import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getTransactions, getBills, updateTransaction, deleteTransaction, updateBulkTransactions } from '../services/billService';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useToast } from '../hooks/useToast';
import { SweepReviewModal } from '../components/ledger/SweepReviewModal';

export default function Transactions() {
  const { userProfile } = useAuth();
  const { addToast } = useToast();
  
  const [transactions, setTransactions] = useState([]);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('unmatched'); // 'matched' | 'unmatched'

  const [linkModeTxId, setLinkModeTxId] = useState(null);
  const [selectedBillId, setSelectedBillId] = useState('');
  const [pendingProposals, setPendingProposals] = useState(null);
  useEffect(() => {
    if (userProfile?.householdId) {
      fetchData();
    }
  }, [userProfile?.householdId]);

  async function fetchData() {
    try {
      setLoading(true);
      const [fetchedTransactions, fetchedBills] = await Promise.all([
        getTransactions(userProfile.householdId),
        getBills(userProfile.householdId)
      ]);
      fetchedTransactions.sort((a,b) => new Date(b.dateStr) - new Date(a.dateStr));
      setTransactions(fetchedTransactions);
      setBills(fetchedBills);
    } catch (err) {
      addToast("Failed to fetch transactions.", "error");
    } finally {
      setLoading(false);
    }
  }

  const handleUnmatch = async (tx) => {
    if (window.confirm("Remove this transaction's mapping? It will appear back in Unmatched.")) {
      try {
        await updateTransaction(tx.id, {
           billId: null,
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

  const handleManualLink = async (tx) => {
    if (!selectedBillId) return;
    try {
      const bill = bills.find(b => b.id === selectedBillId);
      const actualAmount = Math.abs(parseFloat(tx.amount.toString().replace(/[^0-9.-]+/g,""))) || 0;
      const isVariance = actualAmount > bill.expectedAmount;

      await updateTransaction(tx.id, {
         billId: selectedBillId,
         status: 'cleared',
         actualAmount: actualAmount,
         varianceReason: isVariance ? 'CSV Import Variance' : ''
      });
      addToast("Transaction manually mapped!");
      setLinkModeTxId(null);
      setSelectedBillId('');
      fetchData();
    } catch (err) {
      addToast("Error linking transaction.", "error");
    }
  };

  const handleSweepStart = () => {
    const proposals = [];
    const currentUnmatched = transactions.filter(t => t.billId === null);
    
    currentUnmatched.forEach(tx => {
       const matchedBill = bills.find(b => {
          if (!tx.name) return false;
          const importName = tx.name.toLowerCase();
          if (b.matchKeywords && Array.isArray(b.matchKeywords) && b.matchKeywords.length > 0) {
             return b.matchKeywords.some(kw => importName.includes(kw.trim().toLowerCase()));
          } else {
             return b.name && importName.includes(b.name.toLowerCase());
          }
       });
       
       if (matchedBill) {
          const rawAmtStr = tx.amount ? tx.amount.toString().replace(/[^0-9.-]+/g,"") : "0";
          const actualAmount = Math.abs(parseFloat(rawAmtStr)) || 0;
          const isVariance = actualAmount > matchedBill.expectedAmount;
          
          proposals.push({
             id: tx.id,
             txName: tx.name,
             txAmount: tx.amount,
             txDate: tx.dateStr || `${tx.month}/${tx.year}`,
             billName: matchedBill.name,
             updates: {
                billId: matchedBill.id,
                status: 'cleared',
                actualAmount: actualAmount,
                varianceReason: isVariance ? 'Auto-Sweep Variance' : ''
             }
          });
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
      await updateBulkTransactions(payload);
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
        await deleteTransaction(txId);
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

  const matched = transactions.filter(t => t.billId !== null);
  const unmatched = transactions.filter(t => t.billId === null);
  const viewingList = tab === 'matched' ? matched : unmatched;


  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {pendingProposals && (
         <SweepReviewModal 
           pendingProposals={pendingProposals}
           onClose={() => setPendingProposals(null)}
           onApprove={handleApproveSweep}
         />
      )}
      <header className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transaction Ledger</h1>
          <p className="text-gray-500 text-sm">Manage, filter, and reconcile your global imported history.</p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-lg items-center">
           {tab === 'unmatched' && unmatched.length > 0 && (
             <Button onClick={handleSweepStart} variant="primary" className="mr-3 py-1.5 px-3 text-sm flex items-center shadow-sm">
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                Auto-Sweep Matches
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
                        {tab === 'matched' && (
                           <span className="ml-3 text-xs font-bold px-2 py-0.5 rounded border bg-blue-50 border-blue-100 text-blue-700">Linked to: {bills.find(b=>b.id===tx.billId)?.name || 'Unknown'}</span>
                        )}
                     </p>
                     <p className="text-sm text-gray-500 font-medium tracking-wide mt-1 uppercase">Date: {tx.dateStr || `${tx.month}/${tx.year}`} <span className="mx-2">•</span> <span className="text-gray-800 font-bold bg-gray-100 px-2 py-0.5 rounded">{tx.amount}</span></p>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                     {tab === 'unmatched' && linkModeTxId === tx.id ? (
                        <div className="flex items-center space-x-2 bg-blue-50 p-2 rounded-lg border border-blue-100">
                           <select value={selectedBillId} onChange={e=>setSelectedBillId(e.target.value)} className="p-1.5 border rounded border-blue-200 text-sm">
                              <option value="">Select template...</option>
                              {bills.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                           </select>
                           <Button onClick={() => handleManualLink(tx)} className="py-1.5 px-3 text-sm">Save Link</Button>
                           <button onClick={() => setLinkModeTxId(null)} className="text-gray-400 hover:text-gray-600 text-sm font-medium px-2">Cancel</button>
                        </div>
                     ) : (
                        <>
                           {tab === 'unmatched' && <Button variant="outline" onClick={() => setLinkModeTxId(tx.id)} className="text-sm py-1.5">Link Template</Button>}
                           {tab === 'matched' && <Button variant="outline" onClick={() => handleUnmatch(tx)} className="text-sm py-1.5 text-orange-600 border-orange-200 hover:bg-orange-50">Unmatch</Button>}
                           
                           <button onClick={() => handleDelete(tx.id)} className="text-gray-300 hover:text-red-500 transition-colors p-2 rounded-full hover:bg-red-50">
                             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                           </button>
                        </>
                     )}
                  </div>
               </div>
            ))}
         </div>
      </Card>
    </div>
  );
}
