import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  getTransactions, getProviders, getMembers, getBills,
  updateTransaction, deleteTransaction, restoreTransaction,
  linkTransactionToBill, unlinkTransactionFromBill,
  getBillPeriodLabel,
} from '../services/billService';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useToast } from '../hooks/useToast';

function parseAmount(str) {
  if (!str) return 0;
  let s = str.toString().trim().replace(/[^0-9.,-]/g, '');
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > ld) s = s.replace(/\./g, '').replace(/,/g, '.');
  else if (ld > lc) s = s.replace(/,/g, '');
  return parseFloat(s) || 0;
}

function formatDDMMYYYY(dateInput) {
  if (!dateInput) return '';
  if (typeof dateInput === 'string' && dateInput.includes('-')) {
     const parts = dateInput.split('-');
     if (parts.length === 3 && parts[0].length === 4) {
       return `${parts[2]}-${parts[1]}-${parts[0]}`;
     }
  }
  const d = new Date(dateInput);
  if (isNaN(d.valueOf())) return dateInput;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
}

function scoreBillForTx(bill, txDate) {
  const bp = bill.billingPeriod;
  if (!bp) {
    const bStart = new Date(bill.year, (bill.month || 1) - 1, 1);
    if (txDate >= bStart && txDate <= new Date(bill.year, bill.month || 1, 0)) return 100;
    return Math.max(0, 60 - Math.abs(txDate - bStart) / 86400000);
  }
  if (bp.type === 'month') {
    const bStart = new Date(bp.year, bp.month - 1, 1);
    if (txDate >= bStart && txDate <= new Date(bp.year, bp.month, 0)) return 100;
    return Math.max(0, 60 - Math.abs(txDate - bStart) / 86400000);
  }
  if (bp.type === 'dateRange') {
    const s = new Date(bp.dateFrom), e = new Date(bp.dateTo);
    if (txDate >= s && txDate <= e) return 100;
    return Math.max(0, 60 - Math.min(Math.abs(txDate - s), Math.abs(txDate - e)) / 86400000);
  }
  if (bp.type === 'specificDate')
    return Math.max(0, 100 - Math.abs(txDate - new Date(bp.specificDate)) / 86400000);
  return 0;
}

// ── Shared bill multi-select panel (used by both LinkModal and SweepStepModal) ─
function BillSelector({ allBills, providers, txDate, selections, setSelections, txAmount, existingBillIds = [], existingAllocated = 0 }) {
  // Exclude already-linked bills (they can't be double-linked)
  const activeBills = allBills
    .filter(b => b.status !== 'cleared' && !existingBillIds.includes(b.id))
    .map(b => ({ ...b, score: scoreBillForTx(b, txDate) }))
    .sort((a, b) => b.score - a.score);

  const txAmt          = Math.abs(parseAmount(txAmount));
  // Available budget = total tx - what's already allocated via existing links
  const availableBudget = txAmt > 0 ? Math.max(0, txAmt - existingAllocated) : txAmt;
  const totalNew        = Object.values(selections).reduce((s, v) => s + (Number(v) || 0), 0);
  const isOverBudget    = totalNew > availableBudget + 0.005; // 0.5¢ tolerance
  // Progress bar: show existing + new vs total
  const totalAllocated  = existingAllocated + totalNew;
  const budgetLeft      = txAmt - totalAllocated;
  const pctUsed         = txAmt > 0 ? (totalAllocated / txAmt) * 100 : 0;
  
  let dynColor = 'bg-blue-500';
  if (isOverBudget) dynColor = 'bg-red-500';
  else if (pctUsed > 99) dynColor = 'bg-green-500';
  else if (pctUsed > 80) dynColor = 'bg-orange-500';
  else if (pctUsed > 50) dynColor = 'bg-amber-400';

  function toggleBill(billId, billRemaining) {
    setSelections(prev => {
      const next = { ...prev };
      if (next[billId] !== undefined) {
        delete next[billId];
      } else {
        const alreadyNewAlloc = Object.values(prev).reduce((s, v) => s + (Number(v) || 0), 0);
        const budget = txAmt > 0 ? Math.max(0, availableBudget - alreadyNewAlloc) : billRemaining;
        next[billId] = Math.min(budget, billRemaining);
      }
      return next;
    });
  }

  if (activeBills.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-6 bg-gray-50 rounded-xl">
        {existingBillIds.length > 0 && allBills.filter(b => b.status !== 'cleared').every(b => existingBillIds.includes(b.id))
          ? 'All active bills are already linked to this transaction.'
          : 'No active bills. Create bills in the Bills page first.'}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {/* Budget tracker strip */}
      {txAmt > 0 && (
        <div className={`rounded-xl px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold gap-3 ${
          isOverBudget ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-200'
        }`}>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className={`shrink-0 ${isOverBudget ? 'text-red-600' : 'text-gray-500'}`}>
              {isOverBudget ? '⚠ Over budget!' : existingAllocated > 0 ? 'Remaining budget:' : 'Transaction budget:'}
            </span>
            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden min-w-[60px] relative">
              {/* Existing allocation (blue) */}
              <div className="absolute top-0 bottom-0 left-0 bg-blue-300 transition-all duration-300" style={{ width: `${txAmt > 0 ? Math.min(100, (existingAllocated / txAmt) * 100) : 0}%` }} />
              <div className={`absolute top-0 bottom-0 transition-colors transition-all duration-300 ${dynColor}`}
                style={{ 
                  left: `${txAmt > 0 ? Math.min(100, (existingAllocated / txAmt) * 100) : 0}%`,
                  width: `${txAmt > 0 ? Math.min(100 - (existingAllocated / txAmt) * 100, (totalNew / txAmt) * 100) : 0}%` 
                }} />
            </div>
          </div>
          <div className="shrink-0 text-right">
            <span className={isOverBudget ? 'text-red-700 font-black' : 'text-gray-700'}>
              € {totalAllocated.toFixed(2)}
            </span>
            <span className="text-gray-400 font-normal"> / € {txAmt.toFixed(2)}</span>
            {existingAllocated > 0 && (
              <div className="text-[10px] text-blue-500 font-normal">€ {availableBudget.toFixed(2)} left to allocate</div>
            )}
          </div>
        </div>
      )}

      {/* Bill list */}
      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {activeBills.map(bill => {
          const prov      = providers.find(p => p.id === bill.providerId);
          const isChk     = selections[bill.id] !== undefined;
          const isDisabled = !isChk && txAmt > 0 && budgetLeft <= 0;
          const totalDue  = (bill.amount || 0) + (bill.lateFee || 0);
          const remaining = Math.max(0, totalDue - (bill.totalPaid || 0));
          return (
            <div key={bill.id}
              className={`rounded-xl border p-3 transition-all ${
                isChk ? 'border-blue-300 bg-blue-50' : 
                isDisabled ? 'border-gray-100 bg-gray-50/50 opacity-50 grayscale-[50%] cursor-not-allowed' :
                'cursor-pointer border-gray-200 hover:border-blue-200 hover:bg-gray-50'
              }`}>
              <div className="flex items-center gap-3" onClick={() => { if (!isDisabled) toggleBill(bill.id, remaining); }}>
                <input type="checkbox" readOnly checked={isChk} disabled={isDisabled} className="rounded accent-blue-600 w-4 h-4 shrink-0 cursor-[inherit]" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{prov?.name || '—'}</p>
                  <p className="text-[11px] text-gray-400">{getBillPeriodLabel(bill)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-gray-700">€ {totalDue.toFixed(2)}</p>
                  {(bill.lateFee || 0) > 0 && (
                    <p className="text-[10px] text-amber-500">€ {(bill.amount||0).toFixed(2)} + € {(bill.lateFee||0).toFixed(2)} late fee</p>
                  )}
                  {remaining < totalDue && (
                    <p className="text-[10px] text-green-600">Remaining: € {remaining.toFixed(2)}</p>
                  )}
                  <span className={`text-[10px] font-bold ${
                    bill.status === 'overdue' ? 'text-red-500' :
                    bill.status === 'partial'  ? 'text-blue-500' : 'text-gray-400'
                  }`}>{bill.status}</span>
                </div>
              </div>

              {isChk && (
                <div className="mt-2.5 pt-2.5 border-t border-blue-200 flex items-center gap-2">
                  <label className="text-[11px] text-blue-600 font-bold shrink-0">Amount paid:</label>
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">€</span>
                    <input
                      type="number" step="0.01" min="0"
                      max={availableBudget > 0 ? availableBudget : undefined}
                      value={selections[bill.id]}
                      onChange={e => setSelections(prev => ({ ...prev, [bill.id]: parseAmount(e.target.value) || 0 }))}
                      className={`w-full border rounded-lg pl-6 pr-2 py-1.5 text-sm focus:ring-1 outline-none ${
                        isOverBudget ? 'border-red-300 focus:ring-red-400' : 'border-blue-200 focus:ring-blue-400'
                      }`}
                      onClick={e => e.stopPropagation()}
                    />
                  </div>
                  {availableBudget > 0 && !isOverBudget && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setSelections(prev => {
                          const newAlloc = Object.values(prev).reduce((s, v, _, arr) => s + (Number(v) || 0), 0) - (Number(prev[bill.id]) || 0);
                          return { ...prev, [bill.id]: Math.min(remaining, Math.max(0, availableBudget - newAlloc)) };
                        });
                      }}
                      className="shrink-0 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-1 hover:bg-blue-100 transition"
                    >Max</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Over-budget error */}
      {isOverBudget && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
          New allocation € {totalNew.toFixed(2)} exceeds remaining budget € {availableBudget.toFixed(2)}. Reduce amounts.
        </div>
      )}
    </div>
  );
}

// ── LinkModal (manual one-off linking) ────────────────────────────────────────
function LinkModal({ tx, allBills, providers, members, onSave, onClose, getAllocated }) {
  const amountFloat    = parseAmount(tx.amount);
  const isIncome       = amountFloat > 0;
  // Derive existing bill IDs from ALL sources — billIds array, legacy billId field, AND
  // keys of billAmounts map. This guards against any sync lag between the two fields.
  const existingBillIds = [
    ...(tx.billIds || (tx.billId ? [tx.billId] : [])),
    ...Object.keys(tx.billAmounts || {}),
  ].filter((v, i, a) => a.indexOf(v) === i); // deduplicate
  // How much is already linked; passed in from parent so it uses the same helper
  const existingAllocated = getAllocated ? getAllocated(tx) : 0;

  const availableBudget = Math.abs(amountFloat) - existingAllocated;

  const [linkMode, setLinkMode] = useState(() => {
    if (amountFloat > 0) return 'member';
    return 'bill';
  });
  
  const [selectedMemberId, setSMId] = useState('');
  
  const [selections, setSelections] = useState(() => {
    if (amountFloat >= 0 || existingAllocated > 0) return {};
    
    const searchSpace = `${tx.name || ''} ${tx.rawBankDescription || ''}`.toLowerCase();
    
    const dm = members.find(m => {
      const nm = m.name && searchSpace.includes(m.name.toLowerCase());
      const kw = Array.isArray(m.matchKeywords) ? m.matchKeywords.some(k => searchSpace.includes(k.trim().toLowerCase())) : false;
      return nm || kw;
    });
    
    const p = providers.find(p => {
      const nm = p.name && searchSpace.includes(p.name.toLowerCase());
      const kw = Array.isArray(p.matchKeywords) ? p.matchKeywords.some(k => searchSpace.includes(k.trim().toLowerCase())) : false;
      return nm || kw;
    });

    if (dm && !p) return {};
    
    if (p) {
      const txD = new Date(tx.dateStr || `${tx.year}-${tx.month}-01`);
      const candidateBills = allBills
        .filter(b => b.providerId === p.id && b.status !== 'cleared' && !existingBillIds.includes(b.id))
        .map(b => ({ ...b, _score: scoreBillForTx(b, txD) }))
        .filter(b => b._score > 0)
        .sort((a, b) => b._score - a._score);
      if (candidateBills.length > 0) {
        return { [candidateBills[0].id]: availableBudget };
      }
    }
    return {};
  });

  useEffect(() => {
    const searchSpace = `${tx.name || ''} ${tx.rawBankDescription || ''}`.toLowerCase();
    if (amountFloat > 0) {
      const m = members.find(m => {
        const nm = m.name && searchSpace.includes(m.name.toLowerCase());
        const kw = Array.isArray(m.matchKeywords) ? m.matchKeywords.some(k => searchSpace.includes(k.trim().toLowerCase())) : false;
        return nm || kw;
      });
      if (m) setSMId(m.id);
    } else if (existingAllocated === 0) {
      const dm = members.find(m => {
        const nm = m.name && searchSpace.includes(m.name.toLowerCase());
        const kw = Array.isArray(m.matchKeywords) ? m.matchKeywords.some(k => searchSpace.includes(k.trim().toLowerCase())) : false;
        return nm || kw;
      });
      const p = providers.find(p => {
        const nm = p.name && searchSpace.includes(p.name.toLowerCase());
        const kw = Array.isArray(p.matchKeywords) ? p.matchKeywords.some(k => searchSpace.includes(k.trim().toLowerCase())) : false;
        return nm || kw;
      });
      if (dm && !p) {
        setLinkMode('member');
        setSMId(dm.id);
      }
    }
  }, [amountFloat, existingAllocated, members, providers, tx]);

  const txDate = tx.dateStr ? new Date(tx.dateStr) : new Date();

  const canSave = isIncome
    ? !!selectedMemberId
    : linkMode === 'member'
      ? !!selectedMemberId
      : Object.keys(selections).length > 0 && !(() => {
          const newAlloc = Object.values(selections).reduce((s, v) => s + (Number(v) || 0), 0);
          return newAlloc > availableBudget + 0.005;
        })();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Link Transaction</h2>
            <p className="text-xs text-gray-400 mt-0.5 max-w-sm whitespace-normal">
              <span className="font-semibold text-gray-700">{tx.name}</span> · <span className={amountFloat > 0 ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>{tx.amount}</span>
              <span className="ml-2 text-gray-300">·</span>
              <span className="ml-2 text-gray-400">{formatDDMMYYYY(tx.dateStr)}</span>

            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {isIncome ? (
            <>
              <p className="text-sm text-green-700 font-semibold bg-green-50 rounded-lg px-3 py-2">
                ↑ Positive amount — attribute as a member contribution
              </p>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Select Contributor</label>
                <select value={selectedMemberId} onChange={e => setSMId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">— Select Member —</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                {[['bill', 'Link to Bills'], ['member', 'Deduct from Member']].map(([v, l]) => (
                  <button key={v} type="button"
                    onClick={() => { setLinkMode(v); setSelections({}); setSMId(''); }}
                    className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${linkMode === v ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>{l}
                  </button>
                ))}
              </div>
              {linkMode === 'bill' ? (
                <>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                    Select Bills {Object.keys(selections).length > 0 && <span className="text-blue-600">({Object.keys(selections).length} selected)</span>}
                  </label>
                  <BillSelector allBills={allBills} providers={providers} txDate={txDate}
                    txAmount={Math.abs(amountFloat)}
                    existingBillIds={existingBillIds}
                    existingAllocated={existingAllocated}
                    selections={selections} setSelections={setSelections} />
                </>
              ) : (
                <>
                  <p className="text-sm text-red-600 font-semibold bg-red-50 rounded-lg px-3 py-2">↓ Deduct from a member's balance</p>
                  <select value={selectedMemberId} onChange={e => setSMId(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">— Select Member —</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </>
              )}
            </>
          )}
        </div>

        <div className="px-6 pb-5 pt-3 border-t border-gray-100 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
          <button disabled={!canSave}
            onClick={() => onSave({ isIncome, linkMode, selectedMemberId, selections })}
            className="px-5 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-40 transition shadow-sm">
            Save Link
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SweepStepModal (one-by-one guided sweep) ──────────────────────────────────
function SweepStepModal({ proposal, stepNum, totalSteps, allBills, providers, members, onApprove, onSkip, onClose }) {
  const amtF    = parseAmount(proposal.txAmount);
  const isIncome = amtF > 0;

  // Additionally show partial status banner if tx already has links
  const hasExistingLinks = (proposal.updates?.billId || (proposal.updates?.billIds?.length > 0));
  const isContrib   = proposal.updates?.status === 'contribution';
  const isDeduction = isContrib && (proposal.updates?.actualAmount || 0) < 0;

  // Pre-populate mode from proposal
  const defaultMode = isContrib ? 'member' : 'bill';
  const [linkMode, setLinkMode]     = useState(defaultMode);
  const [selectedMemberId, setSMId] = useState(isContrib ? (proposal.updates?.memberId || '') : '');

  // Pre-select the proposed bill
  const [selections, setSelections] = useState(() => {
    if (!isContrib && proposal.updates?.billId) {
      return { [proposal.updates.billId]: proposal.updates.actualAmount || Math.abs(amtF) };
    }
    return {};
  });

  const txDate = proposal.txDate ? new Date(proposal.txDate) : new Date();

  const canApprove = isIncome
    ? !!selectedMemberId
    : linkMode === 'member'
      ? !!selectedMemberId
      : Object.keys(selections).length > 0 && !(() => {
          const txAmt = Math.abs(amtF);
          const allocated = Object.values(selections).reduce((s, v) => s + (Number(v) || 0), 0);
          return allocated > txAmt + 0.005;
        })();

  const progress = (stepNum / totalSteps) * 100;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 bg-gray-50 shrink-0">
          <div className="flex justify-between items-start mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[11px] font-black text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full">
                  {stepNum} / {totalSteps}
                </span>
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Auto-Sweep</span>
              </div>
              <h2 className="text-lg font-bold text-gray-900">Review & Approve</h2>
              <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
                {proposal.txName}
                <span className="mx-1.5 text-gray-300">·</span>
                <span className={amtF > 0 ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>{proposal.txAmount}</span>
                <span className="mx-1.5 text-gray-300">·</span>
                {proposal.txDate}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg mt-0.5">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Suggested match banner */}
        <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-100 shrink-0 flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          <p className="text-xs font-semibold text-amber-700">
            Suggested: <span className="font-black">{proposal.billName}</span>
            <span className="ml-2 font-normal text-amber-600">— change below if needed</span>
          </p>
        </div>

        {/* Editable link section */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {isIncome ? (
            <>
              <p className="text-sm text-green-700 font-semibold bg-green-50 rounded-lg px-3 py-2">
                ↑ Positive amount — attribute as a member contribution
              </p>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Select Contributor</label>
                <select value={selectedMemberId} onChange={e => setSMId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">— Select Member —</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                {[['bill', 'Link to Bills'], ['member', 'Deduct from Member']].map(([v, l]) => (
                  <button key={v} type="button"
                    onClick={() => { setLinkMode(v); setSelections({}); setSMId(''); }}
                    className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${linkMode === v ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>
                    {l}
                  </button>
                ))}
              </div>

              {linkMode === 'bill' ? (
                <>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                    Select Bills{Object.keys(selections).length > 0 && <span className="text-blue-600 ml-1">({Object.keys(selections).length} selected)</span>}
                  </label>
                  <BillSelector
                    allBills={allBills}
                    providers={providers}
                    txDate={txDate}
                    txAmount={Math.abs(amtF)}
                    selections={selections}
                    setSelections={setSelections}
                  />
                </>
              ) : (
                <>
                  <p className="text-sm text-red-600 font-semibold bg-red-50 rounded-lg px-3 py-2">↓ Deduct from a member's balance</p>
                  <select value={selectedMemberId} onChange={e => setSMId(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">— Select Member —</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 pb-5 pt-3 border-t border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-3 py-2 text-xs font-semibold text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
              Stop
            </button>
            <button onClick={onSkip}
              className="px-4 py-2 text-sm font-semibold text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
              Skip →
            </button>
          </div>
          <button
            disabled={!canApprove}
            onClick={() => onApprove({ isIncome, linkMode, selectedMemberId, selections })}
            className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-40 transition shadow-sm flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            Approve & Next
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Transactions() {
  const { userProfile } = useAuth();
  const { addToast }    = useToast();
  const navigate        = useNavigate();

  const [transactions, setTransactions] = useState([]);
  const [providers,    setProviders]    = useState([]);
  const [members,      setMembers]      = useState([]);
  const [allBills,     setAllBills]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [tab,          setTab]          = useState('unmatched');
  const [linkModalTx,  setLinkModalTx]  = useState(null);
  const [search,       setSearch]       = useState('');

  // Step-by-step sweep state
  const [sweepQueue, setSweepQueue] = useState([]);
  const [sweepStep,  setSweepStep]  = useState(0);
  const sweeping = sweepQueue.length > 0 && sweepStep < sweepQueue.length;

  useEffect(() => { if (userProfile?.householdId) fetchData(); }, [userProfile?.householdId]);

  async function fetchData() {
    try {
      setLoading(true);
      const [txs, provs, bills, mems] = await Promise.all([
        getTransactions(userProfile.householdId),
        getProviders(userProfile.householdId),
        getBills(userProfile.householdId),
        getMembers(userProfile.householdId),
      ]);
      txs.sort((a, b) => new Date(b.dateStr || `${b.year}-${b.month}-01`) - new Date(a.dateStr || `${a.year}-${a.month}-01`));
      setTransactions(txs);
      setProviders(provs);
      setAllBills(bills);
      setMembers(mems);
    } catch {
      addToast('Failed to fetch transactions.', 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── Transaction classification helpers ──────────────────────────────────────
  // How much of a tx has been allocated across all linked bills
  function getAllocated(tx) {
    if (tx.billAmounts && Object.keys(tx.billAmounts).length > 0) {
      return Object.values(tx.billAmounts).reduce((s, v) => s + Number(v || 0), 0);
    }
    // Fallback for legacy single-link transactions that lack billAmounts mapping
    if (tx.billId || tx.billIds?.length > 0) {
      return Math.abs(parseAmount(tx.amount));
    }
    return 0;
  }

  const CENT = 0.01; // 1¢ tolerance
  const isContributionTx = (t) => t.status === 'contribution';
  const hasAnyBillLink   = (t) => (t.billIds?.length > 0) || (t.billId != null);
  const isFullySettled   = (t) => {
    if (!hasAnyBillLink(t)) return false;
    const txAmt = Math.abs(parseAmount(t.amount));
    return txAmt <= 0 || getAllocated(t) >= txAmt - CENT;
  };
  const isPartiallySettled = (t) => hasAnyBillLink(t) && !isFullySettled(t);

  // Matched = fully settled bills OR contributions
  // Unmatched = no links at all  OR partially settled (stays here so user can finish linking)
  const matched   = transactions.filter(t => !t.isDeleted && (isContributionTx(t) || isFullySettled(t)));
  const unmatched = transactions.filter(t => !t.isDeleted && (!isContributionTx(t) && !isFullySettled(t)));
  const deletedTxs= transactions.filter(t => t.isDeleted);

  const q = search.trim().toLowerCase();
  const txSource = tab === 'matched' ? matched : (tab === 'deleted' ? deletedTxs : unmatched);
  const viewList = txSource.filter(t =>
    !q ||
    (t.name || '').toLowerCase().includes(q) ||
    (t.rawBankDescription || '').toLowerCase().includes(q)
  );

  // ── Save helper (shared by LinkModal + SweepStepModal) ────────────────────
  async function executeSaveLink(txId, { isIncome, linkMode, selectedMemberId, selections }) {
    const tx = transactions.find(t => t.id === txId);
    const amountFloat = tx ? parseAmount(tx.amount) : 0;

    if (isIncome) {
      await updateTransaction(userProfile.householdId, txId, {
        memberId: selectedMemberId, billId: null, billIds: [],
        status: 'contribution', actualAmount: Math.abs(amountFloat), varianceReason: '',
      });
    } else if (linkMode === 'member') {
      await updateTransaction(userProfile.householdId, txId, {
        memberId: selectedMemberId, billId: null, billIds: [],
        status: 'contribution', actualAmount: -Math.abs(amountFloat), varianceReason: 'Deduction',
      });
    } else {
      for (const [billId, paidAmt] of Object.entries(selections)) {
        if (Number(paidAmt) > 0) {
          await linkTransactionToBill(userProfile.householdId, billId, txId, Number(paidAmt));
        }
      }
    }
  }

  // ── Manual link (LinkModal) ────────────────────────────────────────────────
  async function handleSaveLink(saveData) {
    const tx = linkModalTx;
    if (!tx) return;
    try {
      await executeSaveLink(tx.id, saveData);
      addToast(`Linked!`);
      setLinkModalTx(null);
      fetchData();
    } catch {
      addToast('Error linking transaction.', 'error');
    }
  }

  // sweep only covers fully-unlinked (not partially-settled ones which the user handles manually)
  function handleSweepStart() {
    const proposals = [];
    const currentUnmatched = transactions.filter(t => !isContributionTx(t) && !hasAnyBillLink(t));
    const usedBillIds = new Set();

    currentUnmatched.forEach(tx => {
      const amountFloat = parseAmount(tx.amount);
      const searchSpace = `${tx.name || ''} ${tx.rawBankDescription || ''}`.toLowerCase();

      if (amountFloat > 0) {
        const m = members.find(m => {
          const nm = m.name && searchSpace.includes(m.name.toLowerCase());
          const kw = Array.isArray(m.matchKeywords) ? m.matchKeywords.some(k => searchSpace.includes(k.trim().toLowerCase())) : false;
          return nm || kw;
        });
        if (m) proposals.push({
          id: tx.id, txName: tx.name, txAmount: tx.amount,
          txDate: tx.dateStr || `${tx.month}/${tx.year}`,
          billName: `Contribution → ${m.name}`,
          updates: { memberId: m.id, billId: null, billIds: [], status: 'contribution', actualAmount: Math.abs(amountFloat) },
        });
        return;
      }

      // Negative → member deduction first
      const dm = members.find(m => {
        const nm = m.name && searchSpace.includes(m.name.toLowerCase());
        const kw = Array.isArray(m.matchKeywords) ? m.matchKeywords.some(k => searchSpace.includes(k.trim().toLowerCase())) : false;
        return nm || kw;
      });
      const p = providers.find(p => {
        const nm = p.name && searchSpace.includes(p.name.toLowerCase());
        const kw = Array.isArray(p.matchKeywords) ? p.matchKeywords.some(k => searchSpace.includes(k.trim().toLowerCase())) : false;
        return nm || kw;
      });

      if (dm && !p) {
        proposals.push({
          id: tx.id, txName: tx.name, txAmount: tx.amount,
          txDate: tx.dateStr || `${tx.month}/${tx.year}`,
          billName: `Deduction from ${dm.name}`,
          updates: { memberId: dm.id, billId: null, billIds: [], status: 'contribution', actualAmount: -Math.abs(amountFloat), varianceReason: 'Deduction' },
        });
        return;
      }

      if (p) {
        const txDate = new Date(tx.dateStr || `${tx.year}-${tx.month}-01`);
        const candidateBills = allBills
          .filter(b => b.providerId === p.id && b.status !== 'cleared' && !usedBillIds.has(b.id))
          .map(b => ({ ...b, _score: scoreBillForTx(b, txDate) }))
          .filter(b => b._score > 0)
          .sort((a, b) => b._score - a._score);

        if (candidateBills.length > 0) {
          const best = candidateBills[0];
          usedBillIds.add(best.id);
          proposals.push({
            id: tx.id, txName: tx.name, txAmount: tx.amount,
            txDate: tx.dateStr || `${tx.month}/${tx.year}`,
            billName: `${p.name} — ${getBillPeriodLabel(best)}`,
            updates: { billId: best.id, billIds: [best.id], status: 'cleared', actualAmount: Math.abs(amountFloat) },
          });
        }
      }
    });

    if (proposals.length > 0) {
      setSweepQueue(proposals);
      setSweepStep(0);
    } else {
      addToast('No matches found.', 'info');
    }
  }

  async function handleSweepApprove(saveData) {
    const proposal = sweepQueue[sweepStep];
    if (!proposal) return;
    try {
      await executeSaveLink(proposal.id, saveData);
      // Advance step; if done, refresh
      const nextStep = sweepStep + 1;
      if (nextStep >= sweepQueue.length) {
        setSweepQueue([]);
        setSweepStep(0);
        addToast(`Sweep complete! Processed ${sweepQueue.length} transaction(s).`, 'success');
        fetchData();
      } else {
        setSweepStep(nextStep);
        // Refresh data in background so scores stay accurate
        fetchData();
      }
    } catch {
      addToast('Error saving match.', 'error');
    }
  }

  function handleSweepSkip() {
    const nextStep = sweepStep + 1;
    if (nextStep >= sweepQueue.length) {
      setSweepQueue([]);
      setSweepStep(0);
      addToast('Sweep complete.', 'success');
      fetchData();
    } else {
      setSweepStep(nextStep);
    }
  }

  function handleSweepClose() {
    setSweepQueue([]);
    setSweepStep(0);
    fetchData();
  }

  // ── Unlink / Delete ────────────────────────────────────────────────────────
  async function handleUnlinkOne(tx, billId) {
    try {
      await unlinkTransactionFromBill(userProfile.householdId, billId, tx.id);
      addToast('Bill link removed.');
      fetchData();
    } catch {
      addToast('Error removing link.', 'error');
    }
  }

  async function handleUnlinkAll(tx) {
    if (!window.confirm('Remove all bill/member links from this transaction?')) return;
    try {
      const billIds = tx.billIds?.length > 0 ? tx.billIds : (tx.billId ? [tx.billId] : []);
      for (const bid of billIds) {
        await unlinkTransactionFromBill(userProfile.householdId, bid, tx.id);
      }
      if (tx.status === 'contribution' && billIds.length === 0) {
        await updateTransaction(userProfile.householdId, tx.id, {
          memberId: null, billId: null, billIds: [], status: 'pending_classification', varianceReason: '',
        });
      }
      addToast('All links removed.');
      fetchData();
    } catch {
      addToast('Error unlinking transaction.', 'error');
    }
  }

  async function handleDelete(txId) {
    if (!window.confirm('Move this transaction to Trash?')) return;
    try {
      await deleteTransaction(userProfile.householdId, txId);
      addToast('Moved to Trash.', 'info');
      fetchData();
    } catch {
      addToast('Error moving to Trash.', 'error');
    }
  }

  async function handleRestore(txId) {
    try {
      // If it has bills, it'll correctly restore its links automatically (since we never wiped them hard)
      await restoreTransaction(userProfile.householdId, txId);
      addToast('Transaction restored.', 'success');
      fetchData();
    } catch {
      addToast('Error restoring.', 'error');
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-400">
        <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin mb-4" />
        <p className="font-semibold text-gray-500">Loading transaction ledger…</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">

      {/* Step-by-step sweep modal */}
      {sweeping && (
        <SweepStepModal
          key={sweepQueue[sweepStep]?.id || sweepStep}
          proposal={sweepQueue[sweepStep]}
          stepNum={sweepStep + 1}
          totalSteps={sweepQueue.length}
          allBills={allBills}
          providers={providers}
          members={members}
          onApprove={handleSweepApprove}
          onSkip={handleSweepSkip}
          onClose={handleSweepClose}
        />
      )}

      {/* Manual link modal */}
      {linkModalTx && (
        <LinkModal
          tx={linkModalTx}
          allBills={allBills}
          providers={providers}
          members={members}
          onSave={handleSaveLink}
          onClose={() => setLinkModalTx(null)}
          getAllocated={getAllocated}
        />
      )}

      {/* Header */}
      <header className="mb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Transactions</h1>
          <p className="text-gray-400 text-sm mt-0.5">Review, match, and reconcile all imported transactions</p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'unmatched' && unmatched.length > 0 && (
            <button onClick={handleSweepStart} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition shadow-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Auto-Sweep
            </button>
          )}
          <button onClick={() => navigate('/imports')} className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-50 transition shadow-sm">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            Import Statement
          </button>
        </div>
      </header>

      {/* Search bar and Tabs */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        {/* Search Bar - render first */}
        <div className="relative flex-1">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" /></svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by name or bank description…"
            className="w-full pl-10 pr-9 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        {/* Tabs - render second */}
        <div className="flex items-center bg-gray-100 border border-gray-200 p-1 rounded-xl gap-1 shrink-0 overflow-x-auto">
          <button onClick={() => setTab('unmatched')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${tab === 'unmatched' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
            Unmatched ({unmatched.filter(t => !hasAnyBillLink(t)).length})
            {unmatched.filter(t => isPartiallySettled(t)).length > 0 && (
              <span className="ml-1.5 text-[10px] font-black text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
                {unmatched.filter(t => isPartiallySettled(t)).length} partial
              </span>
            )}
          </button>
          <button onClick={() => setTab('matched')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${tab === 'matched' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
            Matched ({matched.length})
          </button>
          <button onClick={() => setTab('deleted')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${tab === 'deleted' ? 'bg-white shadow text-red-700' : 'text-gray-500 hover:text-gray-700'}`}>
            Deleted ({deletedTxs.length})
          </button>
        </div>

        {q && (
          <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
            {viewList.length === 0 ? 'No results' : `${viewList.length} result${viewList.length !== 1 ? 's' : ''}`}
          </span>
        )}
      </div>

      <Card className="p-0 border-gray-200 overflow-hidden min-h-[400px]">
        {/* Desktop Header Grid */}
        <div className="hidden md:grid items-center gap-4 px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50/80 border-b border-gray-100 min-h-[50px]"
          style={{ gridTemplateColumns: '2fr 1fr 1fr 2fr 100px' }}>
          <div>Transaction</div>
          <div>Date</div>
          <div>Amount</div>
          <div>Matched Links</div>
          <div className="text-right pr-2">Actions</div>
        </div>

        <div className="divide-y divide-gray-100">
          {viewList.length === 0 ? (
            <div className="py-20 text-center">
              <svg className="w-12 h-12 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-400 font-medium">No transactions here.</p>
            </div>
          ) : viewList.map(tx => {
            const amtF      = parseAmount(tx.amount);
            const txAmt     = Math.abs(amtF);
            const isContrib = isContributionTx(tx);
            const isDeduct  = isContrib && (tx.actualAmount || 0) < 0;
            const partial   = isPartiallySettled(tx);
            const allocated = getAllocated(tx);
            const allocPct  = txAmt > 0 ? Math.min(100, (allocated / txAmt) * 100) : 0;
            const isIncome  = amtF > 0;

            const linkedBillIds = tx.billIds?.length > 0 ? tx.billIds : (tx.billId ? [tx.billId] : []);
            const linkedBills   = linkedBillIds.map(id => allBills.find(b => b.id === id)).filter(Boolean);
            const member        = members.find(m => m.id === tx.memberId);

            return (
              <div key={tx.id} className={`hover:bg-gray-50/50 transition-colors ${partial ? 'bg-amber-50/20' : ''}`}>
                
                {/* Desktop Grid Row */}
                <div className="hidden md:grid items-center gap-4 px-6 py-4 min-h-[84px]"
                  style={{ gridTemplateColumns: '2fr 1fr 1fr 2fr 100px' }}>
                  
                  {/* Column 1: Transaction name & desc */}
                  <div className="flex items-center gap-3 min-w-0 pr-4 w-full">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm shrink-0 shadow-sm ${
                      isContrib
                        ? (isDeduct ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700')
                        : 'bg-indigo-100 text-indigo-700'
                    }`}>
                      {tx.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-800 text-sm truncate">{tx.name}</p>
                      {tx.rawBankDescription && (
                        <p className="text-[10px] text-gray-400 break-words whitespace-normal leading-relaxed" title={tx.rawBankDescription}>
                          {tx.rawBankDescription}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Column 2: Date */}
                  <div>
                    <p className="text-sm font-semibold text-gray-700">{formatDDMMYYYY(tx.dateStr || `${tx.year}-${tx.month}-01`)}</p>
                  </div>

                  {/* Column 3: Amount */}
                  <div>
                    <p className={`text-sm font-black ${isIncome ? 'text-green-600' : 'text-gray-900'}`}>{tx.amount}</p>
                    {!isContrib && tab === 'matched' && allocated > 0 && (
                      <p className="text-[10px] font-semibold text-green-600 mt-0.5">✓ {allocPct.toFixed(0)}% settled</p>
                    )}
                  </div>

                  {/* Column 4: Matched Links */}
                  <div className="flex flex-col items-start min-w-0">
                    {partial && (
                      <div className="w-full max-w-[200px] flex items-center gap-2 mb-1.5">
                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${allocPct}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-amber-600 shrink-0">{Math.round(allocPct)}%</span>
                      </div>
                    )}
                    
                    <div className="flex flex-wrap gap-1">
                      {linkedBills.map(bill => {
                        const prov = providers.find(p => p.id === bill.providerId);
                        const billAlloc = tx.billAmounts?.[bill.id];
                        return (
                          <span key={bill.id} className="group inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 border border-blue-100 text-blue-700">
                            {prov?.name || '—'} · {getBillPeriodLabel(bill)}
                            {billAlloc !== undefined && <span className="ml-1 text-blue-400 font-normal">€{Number(billAlloc).toFixed(2)}</span>}
                            <button onClick={e => { e.stopPropagation(); handleUnlinkOne(tx, bill.id); }}
                              className="ml-0.5 text-blue-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100" title="Unlink">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </span>
                        );
                      })}
                    </div>
                    {isContrib && (
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded border mt-0.5 ${isDeduct ? 'bg-red-50 border-red-200 text-red-600' : 'bg-green-50 border-green-200 text-green-700'}`}>
                        {isDeduct ? '↓ Deduction from' : '↑ Contribution by'} {member?.name || 'Member'}
                      </span>
                    )}
                    {tab === 'unmatched' && !partial && !isContrib && (
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Unmatched</span>
                    )}
                  </div>

                  {/* Column 5: Actions */}
                  <div className="flex items-center justify-end gap-1.5 pr-2">
                    {tab === 'deleted' ? (
                      <button onClick={() => handleRestore(tx.id)}
                        className="px-3 py-1.5 text-[11px] font-bold text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition shadow-sm">
                        Restore
                      </button>
                    ) : (
                      <>
                        {tab === 'unmatched' && (
                          <button onClick={() => setLinkModalTx(tx)}
                            className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-lg transition border shadow-sm ${
                              partial
                                ? 'text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100'
                                : 'text-blue-700 border-blue-200 bg-blue-50 hover:bg-blue-100'
                            }`}>
                            <span>{partial ? 'Add More' : 'Link'}</span>
                          </button>
                        )}
                        {tab === 'matched' && (
                          <button onClick={() => handleUnlinkAll(tx)}
                            className="px-2 py-1.5 text-[11px] font-bold text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50 transition">
                            Unlink All
                          </button>
                        )}
                        {tab !== 'matched' && !hasAnyBillLink(tx) && (
                          <button onClick={() => handleDelete(tx.id)} title="Move to Trash"
                            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Mobile Fallback Grid */}
                <div className="md:hidden flex flex-col p-4 gap-3">
                  <div className="flex justify-between items-start gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                       <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm shrink-0 shadow-sm ${
                         isContrib
                           ? (isDeduct ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700')
                           : 'bg-indigo-100 text-indigo-700'
                       }`}>
                         {tx.name?.charAt(0)?.toUpperCase()}
                       </div>
                       <div className="min-w-0 pr-2 flex-1">
                         <p className="font-semibold text-gray-800 text-sm truncate">{tx.name}</p>
                         <p className="text-[10px] text-gray-400 mt-0.5 truncate">{formatDDMMYYYY(tx.dateStr || `${tx.year}-${tx.month}-01`)}</p>
                       </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-black ${isIncome ? 'text-green-600' : 'text-gray-900'}`}>{tx.amount}</p>
                    </div>
                  </div>

                  {tx.rawBankDescription && (
                    <p className="text-[10px] text-gray-400 break-words whitespace-normal leading-relaxed mt-0.5" title={tx.rawBankDescription}>{tx.rawBankDescription}</p>
                  )}

                  <div className="flex flex-col gap-1.5">
                    {partial && (
                      <div className="w-full flex items-center gap-2 mb-1.5">
                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${allocPct}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-amber-600">{Math.round(allocPct)}%</span>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {linkedBills.map(bill => {
                        const prov = providers.find(p => p.id === bill.providerId);
                        const billAlloc = tx.billAmounts?.[bill.id];
                        return (
                          <span key={bill.id} className="group inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 border border-blue-100 text-blue-700">
                            {prov?.name || '—'} · {getBillPeriodLabel(bill)}
                            {billAlloc !== undefined && <span className="ml-1 text-blue-400 font-normal">€{Number(billAlloc).toFixed(2)}</span>}
                            <button onClick={e => { e.stopPropagation(); handleUnlinkOne(tx, bill.id); }}
                              className="ml-0.5 text-blue-300 hover:text-red-500 transition">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </span>
                        );
                      })}
                    </div>
                    {isContrib && (
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 border rounded w-fit ${isDeduct ? 'bg-red-50 border-red-200 text-red-600' : 'bg-green-50 border-green-200 text-green-700'}`}>
                        {isDeduct ? '↓ Deduction from' : '↑ Contribution by'} {member?.name || 'Member'}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-gray-50 mt-1">
                    {tab === 'deleted' ? (
                      <button onClick={() => handleRestore(tx.id)}
                        className="px-3 py-1.5 text-[11px] font-bold text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition shadow-sm">
                        Restore
                      </button>
                    ) : (
                      <>
                        {tab === 'unmatched' && (
                          <button onClick={() => setLinkModalTx(tx)} className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-lg transition border ${partial ? 'text-amber-700 border-amber-200 bg-amber-50' : 'text-blue-700 border-blue-200 bg-blue-50'}`}>
                            <span>{partial ? 'Add More' : 'Link'}</span>
                          </button>
                        )}
                        {tab === 'matched' && (
                          <button onClick={() => handleUnlinkAll(tx)} className="px-2 py-1.5 text-[11px] font-bold text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50 transition">
                            Unlink All
                          </button>
                        )}
                        {tab !== 'matched' && !hasAnyBillLink(tx) && (
                          <button onClick={() => handleDelete(tx.id)} title="Move to Trash" className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
