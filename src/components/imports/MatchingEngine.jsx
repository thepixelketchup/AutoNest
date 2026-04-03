import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { saveTransaction } from '../../services/billService';
import { useAuth } from '../../hooks/useAuth';

export function MatchingEngine({ importedData, bills, pendingBills, onComplete }) {
  const [unmatchedPending, setUnmatchedPending] = useState([]);
  const [unmatchedImported, setUnmatchedImported] = useState([]);
  const [autoMatches, setAutoMatches] = useState([]);
  const [approvedTransactions, setApprovedTransactions] = useState([]);
  const [selectedPending, setSelectedPending] = useState(null);
  
  const { userProfile } = useAuth();

  useEffect(() => {
    // Run basic matching algo
    let auto = [];
    // Use ALL bills to match historically, not just pending
    let remainingPending = [...bills]; // allow matching against any template
    
    // Attempt to auto-match multiple times to single templates
    remainingImported.forEach((tx, idx) => {
       const matchedBill = bills.find(b => b.name && tx.name && tx.name.toLowerCase().includes(b.name.toLowerCase()));
       if (matchedBill) {
          auto.push({ bill: matchedBill, tx, originalIdx: idx });
       }
    });

    // Remove auto-matched from unmatched queue
    const matchedIndices = auto.map(m => m.originalIdx);
    remainingImported = remainingImported.filter((_, idx) => !matchedIndices.includes(idx));

    setAutoMatches(auto);
    setUnmatchedPending(remainingPending);
    setUnmatchedImported(remainingImported);
  }, [importedData, bills]);

  const prepareTransaction = (bill, tx) => {
    const rawAmtStr = tx.amount ? tx.amount.toString().replace(/[^0-9.-]+/g,"") : "0";
    const actualAmount = Math.abs(parseFloat(rawAmtStr)) || 0;
    const isVariance = actualAmount > bill.expectedAmount;

    let parsedMonth = new Date().getMonth() + 1;
    let parsedYear = new Date().getFullYear();
    const txDate = new Date(tx.date);
    if (!isNaN(txDate.getTime())) {
       parsedMonth = txDate.getMonth() + 1;
       parsedYear = txDate.getFullYear();
    }

    return {
      id: crypto.randomUUID ? crypto.randomUUID() : 'tx_' + Date.now() + Math.random(),
      householdId: userProfile.householdId,
      billId: bill.id,
      month: parsedMonth,
      year: parsedYear,
      dateStr: tx.date,
      name: tx.name,
      amount: tx.amount,
      status: 'cleared',
      actualAmount: actualAmount,
      varianceReason: isVariance ? 'CSV Import Variance' : '',
      source: 'csv',
      rawBankDescription: tx.rawBankDescription
    };
  };

  const handleApproveAuto = (index) => {
    const match = autoMatches[index];
    const preparedTx = prepareTransaction(match.bill, match.tx);
    
    setApprovedTransactions(prev => [...prev, preparedTx]);
    
    const newAuto = [...autoMatches];
    newAuto.splice(index, 1);
    setAutoMatches(newAuto);
  };

  const handleManualMatch = (txIdx) => {
    if (!selectedPending) return;
    const tx = unmatchedImported[txIdx];
    const preparedTx = prepareTransaction(selectedPending, tx);
    
    setApprovedTransactions(prev => [...prev, preparedTx]);
    
    const newUnmatchedImported = [...unmatchedImported];
    newUnmatchedImported.splice(txIdx, 1);
    
    setUnmatchedImported(newUnmatchedImported);
    setSelectedPending(null);
  };
  
  const handleFinish = () => {
    // Collect all approved matches
    const finalMatches = [...approvedTransactions];
    
    // Collect all remaining unmatched items as valid global transactions with no billId (orphan)
    unmatchedImported.forEach(tx => {
       const rawAmtStr = tx.amount ? tx.amount.toString().replace(/[^0-9.-]+/g,"") : "0";
       const txDate = new Date(tx.date);
       let parsedMonth = new Date().getMonth() + 1;
       let parsedYear = new Date().getFullYear();
       if (!isNaN(txDate.getTime())) {
         parsedMonth = txDate.getMonth() + 1;
         parsedYear = txDate.getFullYear();
       }
       finalMatches.push({
         id: crypto.randomUUID ? crypto.randomUUID() : 'tx_' + Date.now() + Math.random(),
         householdId: userProfile.householdId,
         billId: null, // Unmatched
         month: parsedMonth,
         year: parsedYear,
         dateStr: tx.date,
         name: tx.name,
         amount: tx.amount,
         status: 'pending_classification',
         actualAmount: Math.abs(parseFloat(rawAmtStr)) || 0,
         varianceReason: '',
         source: 'csv',
         rawBankDescription: tx.rawBankDescription
       });
    });
    
    onComplete(finalMatches);
  };

  return (
    <div className="space-y-6">
      {autoMatches.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold text-blue-900 mb-4 flex items-center">
             <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
             Auto-Suggested Matches ({autoMatches.length})
          </h3>
          <div className="space-y-3">
            {autoMatches.map((match, i) => (
              <div key={i} className="flex flex-col md:flex-row items-center justify-between bg-white px-5 py-4 border border-blue-100 rounded-lg shadow-sm">
                <div className="flex items-center space-x-6 flex-1 w-full md:w-auto mb-4 md:mb-0">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">{match.bill.name}</p>
                    <p className="text-xs font-medium text-gray-500 mt-0.5">Template Expected: €{match.bill.expectedAmount}</p>
                  </div>
                  <div className="text-blue-300 hidden md:block">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate" title={match.tx.name}>{match.tx.name}</p>
                    <p className="text-xs font-medium text-gray-500 mt-0.5">Scanned Act: {match.tx.amount} on {match.tx.date}</p>
                  </div>
                </div>
                <Button onClick={() => handleApproveAuto(i)} variant="primary" className="w-full md:w-auto py-2 px-6 shadow-sm">Approve Matching</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Pending Bills */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-[500px]">
          <div className="bg-gray-50 p-4 border-b border-gray-200 shrink-0">
            <h3 className="font-semibold text-gray-800">All Bill Templates</h3>
            <p className="text-xs text-gray-500 mt-1">Select any recurring bill to link to a transaction.</p>
          </div>
          <div className="divide-y divide-gray-100 overflow-y-auto grow">
            {unmatchedPending.length === 0 ? (
               <div className="p-8 text-center text-gray-400 text-sm h-full flex items-center justify-center">No templates mapped!</div>
            ) : unmatchedPending.map(bill => (
              <div 
                key={bill.id} 
                className={`p-4 cursor-pointer transition-all ${selectedPending?.id === bill.id ? 'bg-blue-50 border-l-4 border-blue-600' : 'hover:bg-gray-50 border-l-4 border-transparent'}`}
                onClick={() => setSelectedPending(bill)}
              >
                <div className="flex justify-between items-center">
                  <p className={`font-semibold ${selectedPending?.id === bill.id ? 'text-blue-900' : 'text-gray-800'}`}>{bill.name}</p>
                  <p className="text-sm font-bold text-gray-500">€{bill.expectedAmount}</p>
                </div>
                <p className="text-xs text-gray-400 mt-1 uppercase tracking-wide">Expected Day: {bill.expectedDay}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Imported Transactions */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-[500px]">
          <div className="bg-gray-50 p-4 border-b border-gray-200 shrink-0">
            <h3 className="font-semibold text-gray-800">Imported Transactions</h3>
            {selectedPending ? (
               <p className="text-xs text-blue-600 font-bold mt-1 bg-blue-100 inline-block px-2 py-1 rounded">Linking to "{selectedPending.name}" ...</p>
            ) : (
               <p className="text-xs text-gray-500 mt-1 py-1">Select a pending bill on the left first.</p>
            )}
          </div>
          <div className="divide-y divide-gray-100 overflow-y-auto grow">
            {unmatchedImported.length === 0 ? (
               <div className="p-8 text-center text-gray-400 text-sm h-full flex items-center justify-center">No transactions left!</div>
            ) : unmatchedImported.map((tx, i) => (
              <div 
                key={i} 
                className={`p-4 transition-colors ${selectedPending ? 'cursor-pointer hover:bg-blue-50 group' : 'opacity-50 cursor-not-allowed'}`}
                onClick={() => handleManualMatch(i)}
              >
                <div className="flex justify-between items-center">
                  <p className="font-semibold text-gray-800 truncate pr-4">{tx.name}</p>
                  <p className="text-sm font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded whitespace-nowrap">{tx.amount}</p>
                </div>
                <div className="flex justify-between items-center mt-2">
                   <p className="text-xs text-gray-500 font-medium">{tx.date}</p>
                   {selectedPending && <span className="text-xs opacity-0 group-hover:opacity-100 text-blue-600 font-bold">Link →</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div className="flex justify-between items-center pt-4 border-t border-gray-200">
        <p className="text-sm font-medium text-gray-500 italic">Unmatched transactions will be saved to your ledger tab automatically.</p>
        <Button onClick={handleFinish} variant="primary" className="px-8 shadow-sm">Save to Ledger</Button>
      </div>
    </div>
  );
}
