import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getTransactions, getProviders, getMembers, getGeneratedBills, generateDueBills, updateTransaction, deleteTransaction, updateBulkTransactions } from '../services/billService';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useToast } from '../hooks/useToast';
import { SweepReviewModal } from '../components/ledger/SweepReviewModal';

export default function Transactions() {
  const { userProfile } = useAuth();
  const { addToast } = useToast();
  
  const [transactions, setTransactions] = useState([]);
  const [providers, setProviders] = useState([]);
  const [members, setMembers] = useState([]);
  const [allBills, setAllBills] = useState([]);
  const [unpaidBills, setUnpaidBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('unmatched'); // 'matched' | 'unmatched'

function parseAmount(amountStr) {
  if (!amountStr) return 0;
  let str = amountStr.toString().trim();
  str = str.replace(/[^0-9.,-]/g, "");
  const lastComma = str.lastIndexOf(',');
  const lastDot = str.lastIndexOf('.');
  if (lastComma > lastDot) {
     str = str.replace(/\./g, "").replace(/,/g, ".");
  } else if (lastDot > lastComma) {
     str = str.replace(/,/g, "");
  }
  return parseFloat(str) || 0;
}

  const [linkModalTx, setLinkModalTx] = useState(null);
  const [linkMode, setLinkMode] = useState('bill'); // 'bill' | 'member' — for negative txs
  const [selectedBillId, setSelectedBillId] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [pendingProposals, setPendingProposals] = useState(null);
  useEffect(() => {
    if (userProfile?.householdId) {
      fetchData();
    }
  }, [userProfile?.householdId]);

  async function fetchData() {
    try {
      setLoading(true);
      await generateDueBills(userProfile.householdId);
      const [fetchedTransactions, fetchedProviders, fetchedBills, fetchedMembers] = await Promise.all([
        getTransactions(userProfile.householdId),
        getProviders(userProfile.householdId),
        getGeneratedBills(userProfile.householdId),
        getMembers(userProfile.householdId)
      ]);
      fetchedTransactions.sort((a,b) => new Date(b.dateStr) - new Date(a.dateStr));
      
      const unpaid = fetchedBills.filter(bill => {
        const matchingTxs = fetchedTransactions.filter(t => t.billId === bill.id && t.status === 'cleared');
        const sumPaid = matchingTxs.reduce((acc, t) => acc + (t.actualAmount || 0), 0);
        return sumPaid < bill.expectedAmount * 0.95; 
      });
      unpaid.sort((a,b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
      
      setTransactions(fetchedTransactions);
      setProviders(fetchedProviders);
      setMembers(fetchedMembers);
      setAllBills(fetchedBills);
      setUnpaidBills(unpaid);
    } catch (err) {
      addToast("Failed to fetch transactions.", "error");
    } finally {
      setLoading(false);
    }
  }

  const handleUnmatch = async (tx) => {
    if (window.confirm("Remove this transaction's mapping? It will appear back in Unmatched.")) {
      try {
        await updateTransaction(userProfile.householdId, tx.id, {
           billId: null,
           memberId: null,
           status: 'pending_classification',
           varianceReason: ''
        });
        addToast("Transaction unmapped successfully.");
        fetchData();
      } catch (err) {
        addToast("Error unmapping transaction.", "error");
      }
    }
  };

  const handleManualLink = async () => {
    const tx = linkModalTx;
    if (!tx) return;
    const amountFloat = parseAmount(tx.amount);
    const isIncome = amountFloat > 0;

    try {
      if (isIncome) {
        // Positive → Contribution
        if (!selectedMemberId) return;
        const actualAmount = Math.abs(amountFloat);
        await updateTransaction(userProfile.householdId, tx.id, {
           memberId: selectedMemberId, billId: null,
           status: 'contribution', actualAmount, varianceReason: ''
        });
        addToast("Transaction attributed as a contribution!");
      } else if (linkMode === 'member') {
        // Debit attributed as a DEDUCTION from a member
        if (!selectedMemberId) return;
        const actualAmount = -Math.abs(amountFloat); // negative to signal deduction
        await updateTransaction(userProfile.householdId, tx.id, {
           memberId: selectedMemberId, billId: null,
           status: 'contribution', actualAmount, varianceReason: 'Deduction'
        });
        addToast("Transaction recorded as a member deduction!");
      } else {
        // Debit linked to a Bill
        if (!selectedBillId) return;
        const bill = allBills.find(b => b.id === selectedBillId);
        const actualAmount = Math.abs(amountFloat);
        const isVariance = actualAmount > bill.expectedAmount;
        await updateTransaction(userProfile.householdId, tx.id, {
           billId: selectedBillId, memberId: null,
           status: 'cleared', actualAmount,
           varianceReason: isVariance ? 'Manual Link Variance' : ''
        });
        addToast("Transaction linked to bill!");
      }
      setLinkModalTx(null);
      setSelectedBillId('');
      setSelectedMemberId('');
      setLinkMode('bill');
      fetchData();
    } catch (err) {
      addToast("Error linking transaction.", "error");
    }
  };

  const handleSweepStart = () => {
    const proposals = [];
    // Only sweep transactions that are completely unclassified (no billId and not already a contribution)
    const currentUnmatched = transactions.filter(t => t.billId === null && t.status !== 'contribution');
    let workingUnpaid = [...unpaidBills];
    
    currentUnmatched.forEach(tx => {
       const amountFloat = parseAmount(tx.amount);
       const searchSpace = `${tx.name || ''} ${tx.rawBankDescription || ''}`.toLowerCase();

       // Positive transactions → try to match against Members (income/contributions)
       if (amountFloat > 0 && members.length > 0) {
          const matchedMember = members.find(m => {
             const baseNameMatch = m.name && searchSpace.includes(m.name.toLowerCase());
             const kwMatch = m.matchKeywords && Array.isArray(m.matchKeywords) && m.matchKeywords.length > 0
                ? m.matchKeywords.some(kw => searchSpace.includes(kw.trim().toLowerCase()))
                : false;
             return baseNameMatch || kwMatch;
          });
          if (matchedMember) {
             const actualAmount = Math.abs(amountFloat);
             proposals.push({
                id: tx.id,
                txName: tx.name,
                txAmount: tx.amount,
                txDate: tx.dateStr || `${tx.month}/${tx.year}`,
                billName: `Contribution → ${matchedMember.name}`,
                isContribution: true,
                updates: {
                   memberId: matchedMember.id,
                   billId: null,
                   status: 'contribution',
                   actualAmount: actualAmount,
                   varianceReason: ''
                }
             });
          }
          return; // Don't try to match income against bills
       }

       // Negative transactions → first check members (possible deduction), then bills
       const matchedMemberForDeduction = members.find(m => {
          const baseNameMatch = m.name && searchSpace.includes(m.name.toLowerCase());
          const kwMatch = m.matchKeywords && Array.isArray(m.matchKeywords) && m.matchKeywords.length > 0
             ? m.matchKeywords.some(kw => searchSpace.includes(kw.trim().toLowerCase()))
             : false;
          return baseNameMatch || kwMatch;
       });

       const matchedProvider = providers.find(p => {
          if (!tx.name) return false;
          const baseNameMatch = p.name && searchSpace.includes(p.name.toLowerCase());
          const kwMatch = p.matchKeywords && Array.isArray(p.matchKeywords) && p.matchKeywords.length > 0
              ? p.matchKeywords.some(kw => searchSpace.includes(kw.trim().toLowerCase()))
              : false;
          return baseNameMatch || kwMatch;
       });

       // If it matches a member but not a provider → propose as deduction
       if (matchedMemberForDeduction && !matchedProvider) {
          const actualAmount = -Math.abs(amountFloat); // negative = deduction
          proposals.push({
             id: tx.id,
             txName: tx.name,
             txAmount: tx.amount,
             txDate: tx.dateStr || `${tx.month}/${tx.year}`,
             billName: `Deduction from ${matchedMemberForDeduction.name}`,
             isContribution: true,
             updates: {
                memberId: matchedMemberForDeduction.id,
                billId: null,
                status: 'contribution',
                actualAmount,
                varianceReason: 'Deduction'
             }
          });
          return;
       }
       
       if (matchedProvider) {
          const txD = tx.dateStr ? new Date(tx.dateStr) : new Date(tx.date);
          const txMonth = !isNaN(txD.getTime()) ? txD.getMonth() + 1 : tx.month;
          const txYear = !isNaN(txD.getTime()) ? txD.getFullYear() : tx.year;
          
          const targetBillIdx = workingUnpaid.findIndex(b => b.providerId === matchedProvider.id && b.month === txMonth && b.year === txYear);
          if (targetBillIdx !== -1) {
             const targetBill = workingUnpaid[targetBillIdx];
             const actualAmount = Math.abs(parseAmount(tx.amount));
             const isVariance = actualAmount > targetBill.expectedAmount;
             
             proposals.push({
                id: tx.id,
                txName: tx.name,
                txAmount: tx.amount,
                txDate: tx.dateStr || `${tx.month}/${tx.year}`,
                billName: `${matchedProvider.name} [${targetBill.year}-${String(targetBill.month).padStart(2,'0')}]`,
                isContribution: false,
                updates: {
                   billId: targetBill.id,
                   status: 'cleared',
                   actualAmount: actualAmount,
                   varianceReason: isVariance ? 'Auto-Sweep Variance' : ''
                }
             });
             workingUnpaid.splice(targetBillIdx, 1);
          }
       }
    });
    
    if (proposals.length > 0) {
       setPendingProposals(proposals);
    } else {
       addToast("No new matches found among historic transactions.", "info");
    }
  };

  const handleApproveSweep = async (approvedMatches) => {
    try {
      setPendingProposals(null);
      setLoading(true);
      const payload = approvedMatches.map(m => ({ id: m.id, updates: m.updates }));
      await updateBulkTransactions(userProfile.householdId, payload);
      addToast(`Successfully swept ${payload.length} historic transactions!`, 'success');
      fetchData();
    } catch (e) {
      addToast("Failed to save approved sweep matches.", "error");
      setLoading(false);
    }
  };

  const handleDelete = async (txId) => {
    if (window.confirm("Permanently delete this transaction?")) {
      try {
        await deleteTransaction(userProfile.householdId, txId);
        addToast("Transaction deleted.");
        fetchData();
      } catch (err) {
        addToast("Error deleting transaction.", "error");
      }
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="font-medium animate-pulse">Loading transaction graph...</p>
      </div>
    );
  }

  // Contributions now show inside Matched with a green label
  const matched = transactions.filter(t => t.billId !== null || t.status === 'contribution');
  const unmatched = transactions.filter(t => t.billId === null && t.status !== 'contribution');
  const viewingList = tab === 'matched' ? matched : unmatched;

  const LinkModal = () => {
    if (!linkModalTx) return null;
    const amountFloat = parseAmount(linkModalTx.amount);
    const isIncome = amountFloat > 0;
    // For debits: user can toggle between linking a bill OR deducting from a member
    const canSave = isIncome
       ? !!selectedMemberId
       : linkMode === 'member' ? !!selectedMemberId : !!selectedBillId;
    const closeFn = () => { setLinkModalTx(null); setSelectedBillId(''); setSelectedMemberId(''); setLinkMode('bill'); };
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Link Transaction</h2>
              <p className="text-sm text-gray-500 mt-0.5 truncate max-w-[320px]">{linkModalTx.name} · <span className={isIncome ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>{linkModalTx.amount}</span></p>
            </div>
            <button onClick={closeFn} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="p-6 space-y-4">
            {isIncome ? (
              <>
                <div className="flex items-center space-x-2 mb-2">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-100 text-green-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  </span>
                  <p className="text-sm font-semibold text-gray-700">Positive amount — attribute as a contribution</p>
                </div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Select Contributor</label>
                <select value={selectedMemberId} onChange={e => setSelectedMemberId(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500">
                  <option value="">-- Select a Member --</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </>
            ) : (
              <>
                {/* Mode toggle for debit */}
                <div className="flex bg-gray-100 rounded-lg p-1 mb-2">
                  <button onClick={() => { setLinkMode('bill'); setSelectedMemberId(''); }} className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition-all ${linkMode === 'bill' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500'}`}>Link to Bill</button>
                  <button onClick={() => { setLinkMode('member'); setSelectedBillId(''); }} className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition-all ${linkMode === 'member' ? 'bg-white shadow-sm text-red-600' : 'text-gray-500'}`}>Deduct from Member</button>
                </div>
                {linkMode === 'bill' ? (
                  <>
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6M5 21h14a2 2 0 002-2V7l-5-5H5a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                      </span>
                      <p className="text-sm font-semibold text-gray-700">Debit — link to an outstanding bill</p>
                    </div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Select Bill</label>
                    <select value={selectedBillId} onChange={e => setSelectedBillId(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
                      <option value="">-- Select a Bill --</option>
                      {providers.map(p => {
                        const pBills = unpaidBills.filter(b => b.providerId === p.id);
                        if (pBills.length === 0) return null;
                        return (
                          <optgroup key={p.id} label={p.name}>
                            {pBills.map(b => <option key={b.id} value={b.id}>[{b.year}-{String(b.month).padStart(2,'0')}] Due: €{b.expectedAmount.toFixed(2)}</option>)}
                          </optgroup>
                        );
                      })}
                    </select>
                  </>
                ) : (
                  <>
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-100 text-red-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" /></svg>
                      </span>
                      <p className="text-sm font-semibold text-gray-700">Debit — deduct from a member's balance</p>
                    </div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Select Member</label>
                    <select value={selectedMemberId} onChange={e => setSelectedMemberId(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm">
                      <option value="">-- Select a Member --</option>
                      {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </>
                )}
              </>
            )}
          </div>
          <div className="px-6 pb-6 flex justify-end space-x-3">
            <button onClick={closeFn} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button disabled={!canSave} onClick={handleManualLink} className="px-5 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition">Save Link</button>
          </div>
        </div>
      </div>
    );
  };


  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {pendingProposals && (
         <SweepReviewModal 
           pendingProposals={pendingProposals}
           onClose={() => setPendingProposals(null)}
           onApprove={handleApproveSweep}
         />
      )}
      {/* Smart Link Popup Modal */}
      <LinkModal />

      <header className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transaction Ledger</h1>
          <p className="text-gray-500 text-sm">Manage, filter, and reconcile your global imported history.</p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-lg items-center">
           {tab === 'unmatched' && unmatched.length > 0 && (
             <Button onClick={handleSweepStart} variant="primary" className="mr-3 py-1.5 px-3 text-sm flex items-center shadow-sm">
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                Auto-Sweep
             </Button>
           )}
           <button onClick={() => setTab('unmatched')} className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${tab === 'unmatched' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Unmatched ({unmatched.length})</button>
           <button onClick={() => setTab('matched')} className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${tab === 'matched' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Matched ({matched.length})</button>
        </div>
      </header>

      <Card className="p-0 border-gray-200 shadow-sm overflow-hidden min-h-[500px]">
         <div className="divide-y divide-gray-100">
            {viewingList.length === 0 ? (
               <div className="p-16 text-center text-gray-500">
                  <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  No transactions found in this category.
               </div>
            ) : viewingList.map(tx => (
               <div key={tx.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between hover:bg-gray-50/80 transition-colors group">
                  <div className="flex flex-col mb-4 md:mb-0">
                     <p className="font-semibold text-gray-900 text-lg flex items-center">
                        {tx.name}
                        {/* Bill match label */}
                        {tab === 'matched' && tx.status !== 'contribution' && (() => {
                           const b = allBills.find(b => b.id === tx.billId);
                           const p = b ? providers.find(p => p.id === b.providerId) : null;
                           return p ? (
                             <span className="ml-3 text-xs font-bold px-2 py-0.5 rounded border bg-blue-50 border-blue-100 text-blue-700">
                               Linked to: {p.name} [{b.year}-{String(b.month).padStart(2,'0')}]
                             </span>
                           ) : null;
                        })()}
                        {/* Contribution label — green for deposit, red for deduction */}
                        {tab === 'matched' && tx.status === 'contribution' && (() => {
                           const m = members.find(m => m.id === tx.memberId);
                           const isDeduction = (tx.actualAmount || 0) < 0;
                           return (
                             <span className={`ml-3 text-xs font-bold px-2 py-0.5 rounded border ${isDeduction ? 'bg-red-50 border-red-200 text-red-600' : 'bg-green-50 border-green-200 text-green-700'}`}>
                               {isDeduction ? 'Deduction from' : 'Contribution by'} {m?.name || 'Member'}
                             </span>
                           );
                        })()}
                     </p>
                     <p className="text-sm text-gray-500 font-medium tracking-wide mt-1 uppercase">Date: {tx.dateStr || `${tx.month}/${tx.year}`} <span className="mx-2">•</span> <span className="text-gray-800 font-bold bg-gray-100 px-2 py-0.5 rounded">{tx.amount}</span></p>
                     {tx.rawBankDescription && (
                        <p className="text-sm text-gray-400 mt-1.5 italic max-w-2xl break-words line-clamp-2">
                           "{tx.rawBankDescription}"
                        </p>
                     )}
                  </div>
                  
                  <div className="flex items-center space-x-3">
                      {tab === 'unmatched' && (
                         <Button variant="outline" onClick={() => { setLinkModalTx(tx); setSelectedBillId(''); setSelectedMemberId(''); }} className="text-sm py-1.5">Link Template</Button>
                      )}
                      {tab === 'matched' && (
                         <Button variant="outline" onClick={() => handleUnmatch(tx)} className="text-sm py-1.5 text-orange-600 border-orange-200 hover:bg-orange-50">Unlink</Button>
                      )}
                      <button onClick={() => handleDelete(tx.id)} className="text-gray-300 hover:text-red-500 transition-colors p-2 rounded-full hover:bg-red-50">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                   </div>
               </div>
            ))}
         </div>
      </Card>
    </div>
  );
}
