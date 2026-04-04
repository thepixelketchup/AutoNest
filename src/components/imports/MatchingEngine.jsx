import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { saveBulkTransactions } from '../../services/billService';
import { getBillPeriodLabel, getBillPeriodMonthYear } from '../../services/billService';
import { useAuth } from '../../hooks/useAuth';

function parseAmount(amountStr) {
  if (!amountStr) return 0;
  let str = amountStr.toString().trim().replace(/[^0-9.,-]/g, '');
  const lastComma = str.lastIndexOf(',');
  const lastDot   = str.lastIndexOf('.');
  if (lastComma > lastDot) str = str.replace(/\./g, '').replace(/,/g, '.');
  else if (lastDot > lastComma) str = str.replace(/,/g, '');
  return parseFloat(str) || 0;
}

/** Score a bill's period overlap against a transaction date. Higher = better match. */
function scoreBillForTx(bill, txDate) {
  const bp = bill.billingPeriod;
  if (!bp) {
    // Legacy month/year
    const bStart = new Date(bill.year, (bill.month || 1) - 1, 1);
    const bEnd   = new Date(bill.year, bill.month || 1, 0);
    if (txDate >= bStart && txDate <= bEnd) return 100;
    const diff = Math.abs(txDate - bStart) / 86400000;
    return Math.max(0, 60 - diff);
  }
  if (bp.type === 'month') {
    const bStart = new Date(bp.year, bp.month - 1, 1);
    const bEnd   = new Date(bp.year, bp.month, 0);
    if (txDate >= bStart && txDate <= bEnd) return 100;
    const diff = Math.abs(txDate - bStart) / 86400000;
    return Math.max(0, 60 - diff);
  }
  if (bp.type === 'dateRange') {
    const bStart = new Date(bp.dateFrom);
    const bEnd   = new Date(bp.dateTo);
    if (txDate >= bStart && txDate <= bEnd) return 100;
    const diff = Math.min(
      Math.abs(txDate - bStart),
      Math.abs(txDate - bEnd)
    ) / 86400000;
    return Math.max(0, 60 - diff);
  }
  if (bp.type === 'specificDate') {
    const diff = Math.abs(txDate - new Date(bp.specificDate)) / 86400000;
    return Math.max(0, 100 - diff);
  }
  return 0;
}

export function MatchingEngine({ importedData, providers, members, bills = [], onComplete }) {
  const [autoMatches,       setAutoMatches]       = useState([]);
  const [unmatchedImported, setUnmatchedImported] = useState([]);
  const [approvedTransactions, setApprovedTransactions] = useState([]);
  const [selectedBill, setSelectedBill] = useState(null);

  const { userProfile } = useAuth();

  useEffect(() => {
    const auto = [];
    let remainingImported = [...importedData];
    const usedBillIds = new Set(); // prevent same bill being matched twice

    remainingImported.forEach((tx, idx) => {
      const amountFloat = parseAmount(tx.amount);
      const searchSpace = `${tx.name || ''} ${tx.rawBankDescription || ''}`.toLowerCase();

      // ── Positive: sweep against Members ──────────────────────────────────
      if (amountFloat > 0 && members?.length > 0) {
        const matchedMember = members.find(m => {
          const nameMatch = m.name && searchSpace.includes(m.name.toLowerCase());
          const kwMatch   = Array.isArray(m.matchKeywords) && m.matchKeywords.length > 0
            ? m.matchKeywords.some(kw => searchSpace.includes(kw.trim().toLowerCase()))
            : false;
          return nameMatch || kwMatch;
        });
        if (matchedMember) {
          auto.push({ type: 'contribution', member: matchedMember, tx, originalIdx: idx });
        }
        return; // Don't match income against bills
      }

      // ── Negative: sweep against manually created bills ────────────────────
      const txDate = tx.dateStr ? new Date(tx.dateStr) : (tx.date ? new Date(tx.date) : new Date());

      const matchedProvider = providers.find(p => {
        const nameMatch = p.name && searchSpace.includes(p.name.toLowerCase());
        const kwMatch   = Array.isArray(p.matchKeywords) && p.matchKeywords.length > 0
          ? p.matchKeywords.some(kw => searchSpace.includes(kw.trim().toLowerCase()))
          : false;
        return nameMatch || kwMatch;
      });

      // Also check negative tx against member deduction
      if (!matchedProvider && members?.length > 0) {
        const matchedMember = members.find(m => {
          const nameMatch = m.name && searchSpace.includes(m.name.toLowerCase());
          const kwMatch   = Array.isArray(m.matchKeywords) && m.matchKeywords.length > 0
            ? m.matchKeywords.some(kw => searchSpace.includes(kw.trim().toLowerCase()))
            : false;
          return nameMatch || kwMatch;
        });
        if (matchedMember) {
          auto.push({ type: 'deduction', member: matchedMember, tx, originalIdx: idx });
          return;
        }
      }

      if (!matchedProvider) return;

      // Find all pending/partial bills for this provider, score by date proximity
      const candidateBills = bills
        .filter(b => b.providerId === matchedProvider.id && b.status !== 'cleared' && !usedBillIds.has(b.id))
        .map(b => ({ ...b, score: scoreBillForTx(b, txDate) }))
        .filter(b => b.score > 0)
        .sort((a, b) => b.score - a.score);

      if (candidateBills.length > 0) {
        const best = candidateBills[0];
        usedBillIds.add(best.id);
        auto.push({ type: 'bill', bill: best, provider: matchedProvider, tx, originalIdx: idx });
      }
    });

    const matchedIndices = auto.map(m => m.originalIdx);
    setAutoMatches(auto);
    setUnmatchedImported(remainingImported.filter((_, i) => !matchedIndices.includes(i)));
  }, [importedData, providers, members, bills]);

  function buildTransaction(tx, overrides = {}) {
    const rawAmt = parseAmount(tx.amount);
    const effectiveDate = tx.dateStr || tx.date || '';
    const txD = new Date(effectiveDate);
    const parsedMonth = !isNaN(txD) ? txD.getMonth() + 1 : (new Date().getMonth() + 1);
    const parsedYear  = !isNaN(txD) ? txD.getFullYear()  : new Date().getFullYear();
    return {
      id: tx.id || (crypto.randomUUID ? crypto.randomUUID() : 'tx_' + Date.now() + Math.random()),
      householdId: userProfile.householdId,
      billId:    null,
      billIds:   [],
      memberId:  null,
      month:     parsedMonth,
      year:      parsedYear,
      dateStr:   effectiveDate,
      name:      tx.name,
      amount:    tx.amount,
      status:    'pending_classification',
      actualAmount: Math.abs(rawAmt),
      varianceReason: '',
      source: tx.source || 'csv',
      rawBankDescription: tx.rawBankDescription || '',
      rawJson: tx.rawJson || '',
      ...overrides,
    };
  }

  function handleApprove(index) {
    const match = autoMatches[index];
    let prepared;

    if (match.type === 'contribution') {
      prepared = buildTransaction(match.tx, {
        memberId: match.member.id,
        status:   'contribution',
        actualAmount: Math.abs(parseAmount(match.tx.amount)),
      });
    } else if (match.type === 'deduction') {
      prepared = buildTransaction(match.tx, {
        memberId: match.member.id,
        status:   'contribution',
        actualAmount: -Math.abs(parseAmount(match.tx.amount)),
        varianceReason: 'Deduction',
      });
    } else {
      // bill match
      prepared = buildTransaction(match.tx, {
        billId:  match.bill.id,
        billIds: [match.bill.id],
        status:  'cleared',
        actualAmount: Math.abs(parseAmount(match.tx.amount)),
        varianceReason: '',
      });
    }

    setApprovedTransactions(prev => [...prev, prepared]);
    setAutoMatches(prev => prev.filter((_, i) => i !== index));
  }

  function handleManualMatch(txIdx) {
    if (!selectedBill) return;
    const tx = unmatchedImported[txIdx];
    const prepared = buildTransaction(tx, {
      billId:  selectedBill.id,
      billIds: [selectedBill.id],
      status:  'cleared',
      actualAmount: Math.abs(parseAmount(tx.amount)),
    });
    setApprovedTransactions(prev => [...prev, prepared]);
    setUnmatchedImported(prev => prev.filter((_, i) => i !== txIdx));
    setSelectedBill(null);
  }

  function handleFinish() {
    const unapproved = autoMatches.map(m => buildTransaction(m.tx));
    const finalUnmatched = [...unmatchedImported, ...unapproved].map(tx => buildTransaction(tx));
    onComplete([...approvedTransactions, ...finalUnmatched]);
  }

  const activeBills = bills.filter(b => b.status !== 'cleared');

  return (
    <div className="space-y-6">

      {/* ── Auto Suggestions ── */}
      {autoMatches.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold text-blue-900 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            Auto-Suggested Matches ({autoMatches.length})
          </h3>
          <div className="space-y-3">
            {autoMatches.map((match, i) => {
              const isBill    = match.type === 'bill';
              const isContrib = match.type === 'contribution';
              const isDeduc   = match.type === 'deduction';
              return (
                <div key={i} className="flex flex-col md:flex-row items-start md:items-center justify-between bg-white px-5 py-4 border border-blue-100 rounded-lg gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isBill ? 'bg-blue-100 text-blue-700' : isContrib ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {isBill ? 'Bill Match' : isContrib ? 'Contribution' : 'Deduction'}
                      </span>
                      <p className="text-sm font-semibold text-gray-900">
                        {isBill
                          ? `${match.provider.name} · ${getBillPeriodLabel(match.bill)}`
                          : `${isDeduc ? '−' : '+'} ${match.member.name}`}
                      </p>
                    </div>
                    {isBill && (
                      <p className="text-xs text-gray-400">
                        Bill: {fmt(match.bill.amount)} · Status: {match.bill.status}
                      </p>
                    )}
                    <p className="text-xs text-gray-500">{match.tx.name} · {match.tx.amount} · {match.tx.dateStr || match.tx.date}</p>
                  </div>
                  <Button onClick={() => handleApprove(i)} variant="primary" className="shrink-0 py-2 px-5 shadow-sm">Approve</Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Manual Matching ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bills panel */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-[480px]">
          <div className="bg-gray-50 p-4 border-b border-gray-200 shrink-0">
            <h3 className="font-semibold text-gray-800">Active Bills</h3>
            <p className="text-xs text-gray-500 mt-1">Select a bill then click a transaction to link them.</p>
          </div>
          <div className="p-3 border-b border-gray-100 shrink-0">
            <select
              value={selectedBill?.id || ''}
              onChange={e => setSelectedBill(activeBills.find(b => b.id === e.target.value) || null)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">— Select a bill to link —</option>
              {providers.map(p => {
                const pBills = activeBills.filter(b => b.providerId === p.id);
                if (!pBills.length) return null;
                return (
                  <optgroup key={p.id} label={p.name}>
                    {pBills.map(b => (
                      <option key={b.id} value={b.id}>
                        {getBillPeriodLabel(b)} · {fmt(b.amount)} [{b.status}]
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>
          <div className="divide-y divide-gray-50 overflow-y-auto flex-1">
            {activeBills.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm flex items-center justify-center h-full">
                No active bills. Create bills in the Bills page first.
              </div>
            ) : activeBills.map(bill => {
              const prov = providers.find(p => p.id === bill.providerId);
              const isSelected = selectedBill?.id === bill.id;
              return (
                <div key={bill.id}
                  className={`p-4 cursor-pointer transition-all border-l-4 ${isSelected ? 'bg-blue-50 border-blue-600' : 'border-transparent hover:bg-gray-50'}`}
                  onClick={() => setSelectedBill(isSelected ? null : bill)}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className={`font-semibold text-sm ${isSelected ? 'text-blue-800' : 'text-gray-800'}`}>{prov?.name || '—'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{getBillPeriodLabel(bill)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-gray-700">{fmt(bill.amount)}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        bill.status === 'partial' ? 'bg-blue-100 text-blue-700' :
                        bill.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                      }`}>{bill.status}</span>
                    </div>
                  </div>
                  {bill.totalPaid > 0 && (
                    <p className="text-[10px] text-green-600 mt-1">Already paid: {fmt(bill.totalPaid)}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Unmatched Transactions */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-[480px]">
          <div className="bg-gray-50 p-4 border-b border-gray-200 shrink-0">
            <h3 className="font-semibold text-gray-800">Unmatched Transactions</h3>
            {selectedBill ? (
              <p className="text-xs text-blue-600 font-bold mt-1">
                Linking to: "{providers.find(p => p.id === selectedBill.providerId)?.name}" — {getBillPeriodLabel(selectedBill)}
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">Select a bill on the left, then click a transaction to link.</p>
            )}
          </div>
          <div className="divide-y divide-gray-50 overflow-y-auto flex-1">
            {unmatchedImported.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm flex items-center justify-center h-full">All transactions matched!</div>
            ) : unmatchedImported.map((tx, i) => (
              <div key={i}
                className={`p-4 transition-colors ${selectedBill ? 'cursor-pointer hover:bg-blue-50 group' : 'opacity-60 cursor-not-allowed'}`}
                onClick={() => handleManualMatch(i)}>
                <div className="flex justify-between items-center">
                  <p className="font-semibold text-sm text-gray-800 truncate max-w-[60%]">{tx.name}</p>
                  <p className="text-sm font-black text-gray-700 bg-gray-100 px-2 py-0.5 rounded">{tx.amount}</p>
                </div>
                {tx.rawBankDescription && (
                  <p className="text-xs text-gray-400 mt-1 italic truncate">"{tx.rawBankDescription}"</p>
                )}
                <div className="flex justify-between mt-1.5">
                  <p className="text-xs text-gray-400">{tx.dateStr || tx.date}</p>
                  {selectedBill && <span className="text-xs text-blue-600 font-bold opacity-0 group-hover:opacity-100">Link →</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center pt-4 border-t border-gray-200">
        <p className="text-sm text-gray-400 italic">Unmatched transactions are saved to your ledger for manual linking later.</p>
        <Button onClick={handleFinish} variant="primary" className="px-8 shadow-sm">Save to Ledger</Button>
      </div>
    </div>
  );
}

function fmt(n) { return `€ ${Number(n || 0).toFixed(2)}`; }
