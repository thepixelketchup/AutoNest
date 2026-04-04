import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { saveTransaction } from '../../services/billService';
import { useAuth } from '../../hooks/useAuth';

function parseAmount(amountStr) {
  if (!amountStr) return 0;
  let str = amountStr.toString().trim();
  // Keep only digits, commas, dots, and minus signs
  str = str.replace(/[^0-9.,-]/g, "");
  
  const lastComma = str.lastIndexOf(',');
  const lastDot = str.lastIndexOf('.');
  
  if (lastComma > lastDot) {
     // Comma acts as the decimal separator (e.g., 1.234,56 or 1234,56)
     str = str.replace(/\./g, "").replace(/,/g, ".");
  } else if (lastDot > lastComma) {
     // Dot acts as the decimal separator (e.g., 1,234.56)
     str = str.replace(/,/g, "");
  }
  return parseFloat(str) || 0;
}

export function MatchingEngine({ importedData, providers, unpaidBills, onComplete }) {
  const [unmatchedPending, setUnmatchedPending] = useState([]);
  const [unmatchedImported, setUnmatchedImported] = useState([]);
  const [autoMatches, setAutoMatches] = useState([]);
  const [approvedTransactions, setApprovedTransactions] = useState([]);
  const [selectedPending, setSelectedPending] = useState(null);
  
  const { userProfile } = useAuth();

  useEffect(() => {
    // Run basic matching algo
    let auto = [];
    let remainingImported = [...importedData];
    let workingUnpaid = [...unpaidBills]; // We iterate and "consume" bills as we match them
    
    // Attempt auto-match
    remainingImported.forEach((tx, idx) => {
       const matchedProvider = providers.find(p => {
          if (!tx.name) return false;
          const searchSpace = `${tx.name} ${tx.rawBankDescription || ''}`.toLowerCase();
          
          const baseNameMatch = p.name && searchSpace.includes(p.name.toLowerCase());
          const kwMatch = p.matchKeywords && Array.isArray(p.matchKeywords) && p.matchKeywords.length > 0 
              ? p.matchKeywords.some(kw => searchSpace.includes(kw.trim().toLowerCase()))
              : false;
              
          return baseNameMatch || kwMatch;
       });
       
       if (matchedProvider) {
          const txD = tx.dateStr ? new Date(tx.dateStr) : new Date(tx.date);
          const txMonth = !isNaN(txD.getTime()) ? txD.getMonth() + 1 : tx.month;
          const txYear = !isNaN(txD.getTime()) ? txD.getFullYear() : tx.year;

          // Find the precise outstanding bill instance for this provider in this exact month
          const targetBillIdx = workingUnpaid.findIndex(b => b.providerId === matchedProvider.id && b.month === txMonth && b.year === txYear);
          if (targetBillIdx !== -1) {
             const targetBill = workingUnpaid[targetBillIdx];
             auto.push({ provider: matchedProvider, bill: targetBill, tx, originalIdx: idx });
             
             // Remove it from workingUnpaid so multiple missed rents map properly in chronological order!
             workingUnpaid.splice(targetBillIdx, 1);
          }
       }
    });

    const matchedIndices = auto.map(m => m.originalIdx);
    remainingImported = remainingImported.filter((_, idx) => !matchedIndices.includes(idx));

    setAutoMatches(auto);
    setUnmatchedPending(workingUnpaid);
    setUnmatchedImported(remainingImported);
  }, [importedData, providers, unpaidBills]);

  const prepareTransaction = (bill, tx) => {
    const rawAmt = parseAmount(tx.amount);
    const actualAmount = Math.abs(rawAmt) || 0;
    const isVariance = actualAmount > bill.expectedAmount;

    let parsedMonth = bill.month || (new Date().getMonth() + 1);
    let parsedYear = bill.year || new Date().getFullYear();
    const effectiveDate = tx.dateStr || tx.date;

    return {
      id: tx.id || (crypto.randomUUID ? crypto.randomUUID() : 'tx_' + Date.now() + Math.random()),
      householdId: userProfile.householdId,
      billId: bill.id,
      month: parsedMonth,
      year: parsedYear,
      dateStr: effectiveDate,
      name: tx.name,
      amount: tx.amount,
      status: 'cleared',
      actualAmount: actualAmount,
      varianceReason: isVariance ? 'Auto-Sweep Variance' : '',
      source: tx.source || 'csv',
      rawBankDescription: tx.rawBankDescription || '',
      rawJson: tx.rawJson || ''
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
    
    // Collect all auto matches that the user DID NOT explicitly approve!
    const unapprovedAutos = autoMatches.map(m => m.tx);
    const combinedUnmatched = [...unmatchedImported, ...unapprovedAutos];
    
    // Collect all remaining unmatched items as valid global transactions with no billId (orphan)
    combinedUnmatched.forEach(tx => {
       const rawAmt = parseAmount(tx.amount);
       const actualAmount = Math.abs(rawAmt) || 0;
       const effectiveDate = tx.dateStr || tx.date;
       const txDate = new Date(effectiveDate);
       let parsedMonth = new Date().getMonth() + 1;
       let parsedYear = new Date().getFullYear();
       if (!isNaN(txDate.getTime())) {
         parsedMonth = txDate.getMonth() + 1;
         parsedYear = txDate.getFullYear();
       }
       finalMatches.push({
         id: tx.id || (crypto.randomUUID ? crypto.randomUUID() : 'tx_' + Date.now() + Math.random()),
         householdId: userProfile.householdId,
         billId: null, // Unmatched
         month: parsedMonth,
         year: parsedYear,
         dateStr: effectiveDate,
         name: tx.name,
         amount: tx.amount,
         status: 'pending_classification',
         actualAmount: actualAmount,
         varianceReason: '',
         source: tx.source || 'csv',
         rawBankDescription: tx.rawBankDescription || ''
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
                    <p className="text-sm font-semibold text-gray-900">{match.provider.name} <span className="font-medium text-gray-500">[{match.bill.year}-{String(match.bill.month).padStart(2,'0')}]</span></p>
                    <p className="text-xs font-medium text-gray-500 mt-0.5">Template Expected: €{match.bill.expectedAmount.toFixed(2)}</p>
                  </div>
                  <div className="text-blue-300 hidden md:block">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate" title={match.tx.name}>{match.tx.name}</p>
                    <p className="text-xs font-medium text-gray-500 mt-0.5">Scanned Act: {match.tx.amount} on {match.tx.dateStr || match.tx.date}</p>
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
          <div className="p-4 border-b border-gray-100">
            <select 
              value={selectedPending?.id || ''} 
              onChange={e => setSelectedPending(unmatchedPending.find(b => b.id === e.target.value))}
              className="w-full text-sm border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white"
            >
              <option value="">-- Select Bill specifically --</option>
              {providers.map(p => {
                 const pBills = unmatchedPending.filter(b => b.providerId === p.id);
                 if (pBills.length === 0) return null;
                 return (
                    <optgroup key={p.id} label={p.name}>
                       {pBills.map(b => (
                          <option key={b.id} value={b.id}>
                             [{b.year}-{String(b.month).padStart(2,'0')}] Due: €{b.expectedAmount.toFixed(2)}
                          </option>
                       ))}
                    </optgroup>
                 );
              })}
            </select>
          </div>
          <div className="divide-y divide-gray-100 overflow-y-auto grow">
            {unmatchedPending.length === 0 ? (
               <div className="p-8 text-center text-gray-400 text-sm h-full flex items-center justify-center">No outstanding bills!</div>
            ) : unmatchedPending.map(bill => {
              const pMatch = providers.find(p => p.id === bill.providerId);
              return (
              <div 
                key={bill.id} 
                className={`p-4 cursor-pointer transition-all ${selectedPending?.id === bill.id ? 'bg-blue-50 border-l-4 border-blue-600' : 'hover:bg-gray-50 border-l-4 border-transparent'}`}
                onClick={() => setSelectedPending(bill)}
              >
                <div className="flex justify-between items-center">
                  <p className={`font-semibold ${selectedPending?.id === bill.id ? 'text-blue-900' : 'text-gray-800'}`}>{pMatch?.name || 'Unknown'} <span className="font-medium text-gray-500">[{bill.year}-{String(bill.month).padStart(2,'0')}]</span></p>
                  <p className="text-sm font-bold text-gray-500">€{bill.expectedAmount.toFixed(2)}</p>
                </div>
                <p className="text-xs text-gray-400 mt-1 uppercase tracking-wide">Expected Day: {bill.expectedDay}</p>
              </div>
            )})}
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
                  <p className="font-semibold text-gray-800 break-words">{tx.name}</p>
                  <p className="text-sm font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded whitespace-nowrap shrink-0 ml-3">{tx.amount}</p>
                </div>
                {tx.rawBankDescription && (
                   <p className="text-xs text-gray-400 mt-1.5 italic max-w-full break-words line-clamp-2">
                      "{tx.rawBankDescription}"
                   </p>
                )}
                <div className="flex justify-between items-center mt-2">
                   <p className="text-xs text-gray-500 font-medium">{tx.dateStr || tx.date}</p>
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
