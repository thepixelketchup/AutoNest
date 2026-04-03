import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { saveTransaction } from '../../services/billService';
import { useAuth } from '../../hooks/useAuth';

export function MatchingEngine({ importedData, bills, pendingBills, onComplete }) {
  const [unmatchedPending, setUnmatchedPending] = useState([]);
  const [unmatchedImported, setUnmatchedImported] = useState([]);
  const [autoMatches, setAutoMatches] = useState([]);
  const [selectedPending, setSelectedPending] = useState(null);
  
  const { userProfile } = useAuth();
  const targetMonth = new Date().getMonth() + 1;
  const targetYear = new Date().getFullYear();

  useEffect(() => {
    // Run basic matching algo
    let auto = [];
    let remainingImported = [...importedData];
    let remainingPending = [...pendingBills];

    // Attempt to auto-match
    remainingPending = remainingPending.filter(bill => {
      // Find a matching transaction based on name substring
      const matchIdx = remainingImported.findIndex(tx => 
        tx.name && bill.name && tx.name.toLowerCase().includes(bill.name.toLowerCase())
      );
      if (matchIdx !== -1) {
        auto.push({ bill, tx: remainingImported[matchIdx] });
        remainingImported.splice(matchIdx, 1);
        return false; // remove from pending
      }
      return true; // keep in pending
    });

    setAutoMatches(auto);
    setUnmatchedPending(remainingPending);
    setUnmatchedImported(remainingImported);
  }, [importedData, pendingBills]);

  const commitMatch = async (bill, tx) => {
    const rawAmtStr = tx.amount ? tx.amount.toString().replace(/[^0-9.-]+/g,"") : "0";
    const actualAmount = Math.abs(parseFloat(rawAmtStr)) || 0;
    const isVariance = actualAmount > bill.expectedAmount;

    await saveTransaction(userProfile.householdId, bill.id, {
      month: targetMonth,
      year: targetYear,
      status: 'cleared',
      actualAmount: actualAmount,
      varianceReason: isVariance ? 'CSV Import Variance' : '',
      source: 'csv',
      rawBankDescription: tx.rawBankDescription
    });
  };

  const handleApproveAuto = async (index) => {
    const match = autoMatches[index];
    await commitMatch(match.bill, match.tx);
    
    // Remove from autoMatches
    const newAuto = [...autoMatches];
    newAuto.splice(index, 1);
    setAutoMatches(newAuto);
  };

  const handleManualMatch = async (txIdx) => {
    if (!selectedPending) return;
    const tx = unmatchedImported[txIdx];
    await commitMatch(selectedPending, tx);
    
    // Remove from UI arrays
    const newUnmatchedPending = unmatchedPending.filter(b => b.id !== selectedPending.id);
    const newUnmatchedImported = [...unmatchedImported];
    newUnmatchedImported.splice(txIdx, 1);
    
    setUnmatchedPending(newUnmatchedPending);
    setUnmatchedImported(newUnmatchedImported);
    setSelectedPending(null);
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
            <h3 className="font-semibold text-gray-800">Unmatched Pending Bills</h3>
            <p className="text-xs text-gray-500 mt-1">Select a bill to link it manually.</p>
          </div>
          <div className="divide-y divide-gray-100 overflow-y-auto grow">
            {unmatchedPending.length === 0 ? (
               <div className="p-8 text-center text-gray-400 text-sm h-full flex items-center justify-center">All pending bills mapped!</div>
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
      
      <div className="flex justify-end pt-4 border-t border-gray-200">
        <Button onClick={onComplete} variant="primary" className="px-8 shadow-sm">Finish Import Check</Button>
      </div>
    </div>
  );
}
