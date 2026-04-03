import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getBills, getTransactions } from '../services/billService';
import { useToast } from '../hooks/useToast';

export default function MatchReport() {
   const { userProfile } = useAuth();
   const { addToast } = useToast();

   const [loading, setLoading] = useState(true);
   const [reports, setReports] = useState([]);

   useEffect(() => {
      if (userProfile?.householdId) {
         fetchReportData();
      }
   }, [userProfile?.householdId]);

   async function fetchReportData() {
      try {
         setLoading(true);
         const [fetchedBills, fetchedTxs] = await Promise.all([
            getBills(userProfile.householdId),
            getTransactions(userProfile.householdId) // Assuming null month/year fetches all globally!
         ]);

         // 1. Gather all unique YYYY-MM keys from transactions
         const monthKeysSet = new Set(
            fetchedTxs
               .filter(t => t.month && t.year)
               .map(t => `${t.year}-${String(t.month).padStart(2, '0')}`)
         );

         // 2. We always want the current month shown, even if no transactions exist yet.
         const now = new Date();
         const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
         monthKeysSet.add(currentMonthKey);

         const monthKeys = [...monthKeysSet];
         monthKeys.sort((a, b) => b.localeCompare(a)); // Descending sort

         // 3. Populate report object per month
         const generatedReports = monthKeys.map(key => {
            const [yearStr, monthStr] = key.split('-');
            const year = parseInt(yearStr, 10);
            const month = parseInt(monthStr, 10);

            const txsForMonth = fetchedTxs.filter(t => t.year === year && t.month === month && t.status === 'cleared');

            const ledger = fetchedBills.map(bill => {
               const tx = txsForMonth.find(t => t.billId === bill.id);

               let status = 'Pending';
               if (tx && tx.actualAmount) {
                  if (tx.actualAmount >= bill.expectedAmount * 0.95) status = 'Paid'; // adding small tolerance gap buffer
                  else status = 'Partial';
               } else {
                  const currentM = now.getMonth() + 1;
                  const currentY = now.getFullYear();
                  if (year < currentY || (year === currentY && month < currentM)) {
                     status = 'Missed';
                  } else {
                     status = 'Pending';
                  }
               }

               return { ...bill, tx, reportStatus: status };
            });

            const expectedSum = ledger.reduce((acc, b) => acc + b.expectedAmount, 0);
            const paidSum = ledger.reduce((acc, b) => acc + (b.tx?.actualAmount || 0), 0);
            const missedCount = ledger.filter(b => b.reportStatus === 'Missed').length;

            return {
               key,
               year,
               month,
               label: new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' }),
               expectedSum,
               paidSum,
               missedCount,
               ledger
            };
         });

         setReports(generatedReports);
      } catch (err) {
         addToast("Failed to compile match reports.", "error");
      } finally {
         setLoading(false);
      }
   }

   const getStatusStyle = (status) => {
      switch (status) {
         case 'Paid': return { classes: 'text-white font-bold shadow-sm', style: { backgroundColor: '#22c55e' } };
         case 'Partial': return { classes: 'text-white font-bold shadow-sm', style: { backgroundColor: '#f59e0b' } };
         case 'Missed': return { classes: 'text-white font-bold shadow-sm', style: { backgroundColor: '#ef4444' } };
         default: return { classes: 'text-slate-700 bg-slate-100 border border-slate-300 font-bold shadow-sm', style: {} }; // Pending
      }
   };

   const getStatusIcon = (status) => {
      switch (status) {
         case 'Paid': return <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>;
         case 'Partial': return <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
         case 'Missed': return <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
         default: return <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
      }
   };

   if (loading && reports.length === 0) {
      return (
         <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-4"></div>
            <p className="font-medium animate-pulse">Running Match Engine...</p>
         </div>
      );
   }

   return (
      <div className="p-4 md:p-8 max-w-[1280px] mx-auto space-y-6">
         <header className="flex justify-between items-center mb-6 mt-2 md:mt-0">
            <div>
               <h1 className="text-xl font-bold text-gray-900">Match & Report</h1>
               <p className="text-gray-500 text-sm mt-1">Check which bills are paid, missed, or partially paid month by month.</p>
            </div>
         </header>

         <div className="space-y-8">
            {reports.map((report) => (
               <div key={report.key} className="bg-white rounded-[12px] border border-gray-200 overflow-hidden">
                  <div className="px-6 py-5 flex items-center justify-between bg-white border-b border-gray-100">
                     <div className="flex items-center space-x-3">
                        <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        <h2 className="text-[18px] font-bold text-slate-800 tracking-tight">{report.label}</h2>
                     </div>

                     <div className="flex items-center space-x-6 text-[15px] text-gray-600 whitespace-nowrap">
                        <span className="shrink-0">Expected: <strong className="text-gray-900">€ {report.expectedSum.toFixed(2)}</strong></span>
                        <span className="shrink-0">Paid: <strong className="text-gray-900">€ {report.paidSum.toFixed(2)}</strong></span>
                        {report.missedCount > 0 && (
                           <span className="text-red-600 flex items-center gap-1.5 ml-4 shrink-0 font-medium whitespace-nowrap">
                              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              <span>{report.missedCount} Missed</span>
                           </span>
                        )}
                     </div>
                  </div>

                  <div className="bg-white overflow-x-auto rounded-b-[12px]">
                     <div className="min-w-[850px] divide-y divide-gray-100">
                        {report.ledger.length === 0 ? (
                           <div className="p-8 text-center text-gray-400 text-sm font-medium">No providers mapped for this period.</div>
                        ) : (
                           <>
                              {/* Table Header Row */}
                              <div className="py-3 px-6 gap-6 items-center bg-gray-50/50 border-b border-gray-100" style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1.5fr) minmax(140px, 1.2fr) minmax(130px, 1fr) minmax(280px, 2.5fr)' }}>
                                 <div className="text-[11px] font-medium text-gray-400 uppercase tracking-widest">Provider / Category</div>
                                 <div className="grid grid-cols-2 gap-4">
                                    <div className="text-[11px] font-medium text-gray-400 uppercase tracking-widest">Expected</div>
                                    <div className="text-[11px] font-medium text-gray-400 uppercase tracking-widest">Actual</div>
                                 </div>
                                 <div className="text-[11px] font-medium text-gray-400 uppercase tracking-widest text-center">Status</div>
                                 <div className="text-[11px] font-medium text-gray-400 uppercase tracking-widest text-right pr-5">Transaction Match</div>
                              </div>
                              
                              {report.ledger.map((bill) => (
                                 <div key={bill.id} className="py-6 px-6 gap-6 items-center" style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1.5fr) minmax(140px, 1.2fr) minmax(130px, 1fr) minmax(280px, 2.5fr)' }}>

                              {/* Left Info: Name & Meta */}
                              <div>
                                 <h4 className="text-[16px] font-bold text-slate-800 tracking-tight mb-1">{bill.name}</h4>
                                 <p className="text-[14px] text-gray-500 font-medium tracking-wide">
                                    <span className="capitalize">{bill.category}</span>
                                    <span className="mx-2 opacity-60">•</span>
                                    <span className="capitalize">{bill.paymentMethod || 'Manual'}</span>
                                 </p>
                              </div>

                              {/* Middle Info: Expected vs Actual (Two Columns) */}
                              <div className="grid grid-cols-2 gap-4">
                                 <div className="flex flex-col justify-center">
                                    <span className="text-[14px] text-slate-800 font-bold">€ {bill.expectedAmount.toFixed(2)}</span>
                                 </div>
                                 <div className="flex flex-col justify-center">
                                    <span className={`text-[14px] font-bold ${bill.tx?.actualAmount ? 'text-green-600' : 'text-gray-400'}`}>
                                       {bill.tx?.actualAmount ? `€ ${bill.tx.actualAmount.toFixed(2)}` : '€ 0.00'}
                                    </span>
                                 </div>
                              </div>

                              {/* Status Pill (Centered) */}
                              <div className="flex justify-center">
                                 <span 
                                    className={`flex items-center px-4 py-1.5 rounded-full text-[14px] tracking-wide ${getStatusStyle(bill.reportStatus).classes}`}
                                    style={getStatusStyle(bill.reportStatus).style}
                                 >
                                    {getStatusIcon(bill.reportStatus)}
                                    {bill.reportStatus}
                                 </span>
                              </div>

                              {/* Right Match Log Gray Box */}
                              <div className="flex justify-end w-full">
                                 <div className="bg-[#f8fafc] rounded-md text-[14px] py-4 px-5 w-full flex justify-between items-center text-gray-700 border border-transparent shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                                    {bill.tx ? (
                                       <>
                                          <span className="font-mono tracking-tight text-gray-600 pr-4 truncate">
                                             {bill.tx.dateStr || `${bill.tx.year}-${String(bill.tx.month).padStart(2, '0')}`} — {bill.tx.name || bill.tx.rawBankDescription}
                                          </span>
                                          <span className="font-mono font-bold tracking-tight whitespace-nowrap text-slate-700">
                                             € {bill.tx.actualAmount.toFixed(2)}
                                          </span>
                                       </>
                                    ) : (
                                       <span className="text-gray-400 italic w-full text-center">No transaction matched.</span>
                                    )}
                                 </div>
                              </div>

                           </div>
                        ))}
                           </>
                        )}
                     </div>
                  </div>
               </div>
            ))}
         </div>
      </div>
   );
}
