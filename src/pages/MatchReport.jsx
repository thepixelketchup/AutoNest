import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getProviders, getMembers, getBills, getTransactions, getBillPeriodMonthYear } from '../services/billService';
import { getHousehold } from '../services/householdService';
import { useGlobalPeriod } from '../hooks/useGlobalPeriod';
import { useToast } from '../hooks/useToast';

export default function MatchReport() {
   const { userProfile } = useAuth();
   const { addToast } = useToast();

   const [loading, setLoading] = useState(true);
   const [viewMode, setViewMode] = useState('month'); 
   const [selectedPeriod, setSelectedPeriod] = useGlobalPeriod('this_month');
   const [household, setHousehold] = useState(null);
   const [monthReports, setMonthReports] = useState([]);
   const [providerReports, setProviderReports] = useState([]);

   useEffect(() => {
      if (userProfile?.householdId) {
         fetchReportData();
      }
   }, [userProfile?.householdId]);

   async function fetchReportData() {
      try {
         setLoading(true);
         const [fetchedProviders, fetchedBills, fetchedTxs, hh] = await Promise.all([
            getProviders(userProfile.householdId),
            getBills(userProfile.householdId),
            getTransactions(userProfile.householdId),
            getHousehold(userProfile.householdId)
         ]);
         setHousehold(hh);

         const now = new Date();
         const currentYear = now.getFullYear();
         const currentMonth = now.getMonth() + 1;

         // Normalize bills — attach period info and filter to past/current only
         const validBills = fetchedBills.map(bill => {
            const { month, year } = getBillPeriodMonthYear(bill);
            return { ...bill, _month: month, _year: year };
         }).filter(b => {
            return b._year < currentYear || (b._year === currentYear && b._month <= currentMonth);
         });

         const monthKeysSet = new Set(
            validBills.filter(b => b._month && b._year).map(b => `${b._year}-${String(b._month).padStart(2, '0')}`)
         );
         const currentMonthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
         monthKeysSet.add(currentMonthKey);

         const monthKeys = [...monthKeysSet].sort((a, b) => b.localeCompare(a));

         // ── Month Reports ──────────────────────────────────────────────────────
         const generatedReports = monthKeys.map(key => {
            const [yearStr, monthStr] = key.split('-');
            const year  = parseInt(yearStr, 10);
            const month = parseInt(monthStr, 10);

            const billsForMonth = validBills.filter(b => b._year === year && b._month === month);

            const ledger = billsForMonth.map(bill => {
               const provider = fetchedProviders.find(p => p.id === bill.providerId);
               const relevantTxs = fetchedTxs.filter(t => {
                  if (t.status !== 'cleared') return false;
                  return (t.billIds && t.billIds.includes(bill.id)) || t.billId === bill.id;
               });
               const sumPaid = relevantTxs.reduce((acc, t) => acc + (t.billAmounts ? (t.billAmounts[bill.id] || 0) : Math.abs(t.actualAmount || 0)), 0);
               const billAmt = (bill.amount || 0) + (bill.lateFee || 0);

               let status = 'Pending';
               if (sumPaid > 0) {
                  if (sumPaid >= Math.abs(billAmt) * 0.95) status = 'Paid';
                  else status = 'Partial';
               } else if (billAmt >= 0 && (year < currentYear || (year === currentYear && month < currentMonth))) {
                  status = 'Missed';
               }

               return {
                  ...bill,
                  txs: relevantTxs,
                  actualPaid: sumPaid,
                  reportStatus: status,
                  name: provider?.name || 'Unknown',
                  category: provider?.category || 'Uncategorized',
                  paymentMethod: provider?.paymentMethod || 'Direct Debit',
                  expectedAmount: billAmt,
               };
            });

            const expectedSum = ledger.reduce((acc, b) => acc + b.expectedAmount, 0);
            const paidSum     = ledger.reduce((acc, b) => acc + (b.expectedAmount < 0 ? -b.actualPaid : b.actualPaid), 0);
            const missedCount = ledger.filter(b => b.reportStatus === 'Missed').length;

            return { key, year, month, label: new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' }), expectedSum, paidSum, missedCount, ledger };
         });

         // ── Provider Reports ───────────────────────────────────────────────────
         const generatedProviderReports = fetchedProviders.map(provider => {
            const providerBills = validBills.filter(b => b.providerId === provider.id);
            providerBills.sort((a,b) => b._year !== a._year ? b._year - a._year : b._month - a._month);

            const ledger = providerBills.map(bill => {
               const relevantTxs = fetchedTxs.filter(t => {
                  if (t.status !== 'cleared') return false;
                  return (t.billIds && t.billIds.includes(bill.id)) || t.billId === bill.id;
               });
               const sumPaid = relevantTxs.reduce((acc, t) => acc + (t.billAmounts ? (t.billAmounts[bill.id] || 0) : Math.abs(t.actualAmount || 0)), 0);
               const billAmt = (bill.amount || 0) + (bill.lateFee || 0);

               let status = 'Pending';
               if (sumPaid > 0) {
                  if (sumPaid >= Math.abs(billAmt) * 0.95) status = 'Paid';
                  else status = 'Partial';
               } else if (billAmt >= 0 && (bill._year < currentYear || (bill._year === currentYear && bill._month < currentMonth))) {
                  status = 'Missed';
               }

               return {
                  ...bill,
                  txs: relevantTxs,
                  actualPaid: sumPaid,
                  reportStatus: status,
                  expectedAmount: billAmt,
                  label: new Date(bill._year, bill._month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
               };
            });

            const expectedSum = ledger.reduce((acc, b) => acc + b.expectedAmount, 0);
            const paidSum     = ledger.reduce((acc, b) => acc + (b.expectedAmount < 0 ? -b.actualPaid : b.actualPaid), 0);
            const missedCount = ledger.filter(b => b.reportStatus === 'Missed').length;

            return { id: provider.id, name: provider.name, category: provider.category, paymentMethod: provider.paymentMethod, expectedSum, paidSum, missedCount, ledger };
         });

         const filteredProviderReports = generatedProviderReports.filter(pr => pr.ledger.length > 0);
         filteredProviderReports.sort((a,b) => a.name.localeCompare(b.name));

         setMonthReports(generatedReports);
         setProviderReports(filteredProviderReports);
      } catch (err) {
         addToast("Failed to compile reports.", "error");
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

   if (loading && monthReports.length === 0) {
      return (
         <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-4"></div>
            <p className="font-medium animate-pulse">Running Match Engine...</p>
         </div>
      );
   }

   const currentYearInt = new Date().getFullYear();
   const currentMonthInt = new Date().getMonth() + 1;
   const startYrStr = household?.trackingStartDate;
   let trackingStartYr = currentYearInt - 1; 
   if (startYrStr && startYrStr.includes('-')) {
     trackingStartYr = parseInt(startYrStr.split('-')[0], 10);
   } else if (startYrStr) {
     trackingStartYr = parseInt(startYrStr, 10);
   }
   const maxYear = Math.max(currentYearInt, trackingStartYr || currentYearInt);
   const minYear = Math.min(currentYearInt, trackingStartYr || currentYearInt);
   
   const availableYears = [];
   for (let y = maxYear; y >= minYear; y--) {
     availableYears.push(y);
   }

   const isThisMonth = selectedPeriod === 'this_month';
   const reportYear = isThisMonth ? currentYearInt : parseInt(selectedPeriod, 10);
   const isAllYears = selectedPeriod === 'all';

   const filteredMonthReports = isAllYears 
      ? monthReports 
      : monthReports.filter(r => r.year === reportYear && (!isThisMonth || r.month === currentMonthInt));

   const displayProviderReports = providerReports.map(pr => {
      const filteredLedger = isAllYears 
         ? pr.ledger 
         : pr.ledger.filter(b => b._year === reportYear && (!isThisMonth || b._month === currentMonthInt));
      return {
         ...pr,
         ledger: filteredLedger,
         expectedSum: filteredLedger.reduce((acc, b) => acc + b.expectedAmount, 0),
         paidSum: filteredLedger.reduce((acc, b) => acc + b.actualPaid, 0),
         missedCount: filteredLedger.filter(b => b.reportStatus === 'Missed').length,
      };
   }).filter(pr => pr.ledger.length > 0);

   return (
      <div className="p-4 md:p-8 max-w-[1280px] mx-auto space-y-6">
         <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 mt-2 md:mt-0 gap-4">
            <div>
               <h1 className="text-3xl font-black text-gray-900 tracking-tight">Reports</h1>
               <p className="text-gray-400 text-sm mt-0.5">Audit bills and track exact history</p>
            </div>
            
            <div className="flex items-center gap-3 flex-wrap">
               <div className="flex bg-gray-100 border border-gray-200 rounded-xl p-1 gap-1 flex-wrap">
                  <button
                     onClick={() => setSelectedPeriod('this_month')}
                     className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${selectedPeriod === 'this_month' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                     This Month
                  </button>
                  {availableYears.map(yr => (
                     <button key={yr}
                        onClick={() => setSelectedPeriod(String(yr))}
                        className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${selectedPeriod === String(yr) ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
                     >
                        {yr}
                     </button>
                  ))}
                  <button
                     onClick={() => setSelectedPeriod('all')}
                     className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${selectedPeriod === 'all' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                     All Time
                  </button>
               </div>
               
               <div className="w-px h-6 bg-gray-300 mx-1 hidden sm:block"></div>
               
               <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                  <button 
                     onClick={() => setViewMode('month')}
                     className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${viewMode === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700 shadow-none'}`}
                  >
                     Month View
                  </button>
                  <button 
                     onClick={() => setViewMode('provider')}
                     className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${viewMode === 'provider' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700 shadow-none'}`}
                  >
                     Provider View
                  </button>
               </div>
            </div>
         </header>

         <div className="space-y-8">
          {viewMode === 'month' && filteredMonthReports.map((report) => (
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
                              <div className="grid grid-cols-2 gap-4 mt-2">
                                 <div className="flex flex-col justify-center">
                                    <span className="text-[14px] text-slate-800 font-bold">{bill.expectedAmount < 0 ? '-' : ''}€ {Math.abs(bill.expectedAmount).toFixed(2)}</span>
                                    {bill.expectedAmount < 0 && <span className="text-[10px] font-bold text-blue-500 mt-0.5 uppercase tracking-wide">Refund</span>}
                                 </div>
                                 <div className="flex flex-col justify-center">
                                    <span className={`text-[14px] font-bold ${bill.actualPaid > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                       {bill.actualPaid > 0 ? `${bill.expectedAmount < 0 ? '-' : ''}€ ${bill.actualPaid.toFixed(2)}` : '€ 0.00'}
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
                                    {bill.txs && bill.txs.length > 0 ? (
                                       <>
                                          <span className="font-mono tracking-tight text-gray-600 pr-4 truncate">
                                             {bill.txs.length === 1 
                                                ? `${bill.txs[0].dateStr || `${bill.txs[0].year}-${String(bill.txs[0].month).padStart(2, '0')}`} — ${bill.txs[0].name || bill.txs[0].rawBankDescription}`
                                                : `${bill.txs.length} transactions linked`}
                                          </span>
                                          <span className="font-mono font-bold tracking-tight whitespace-nowrap text-slate-700">
                                             {bill.expectedAmount < 0 && bill.actualPaid > 0 ? '+' : ''}€ {bill.actualPaid.toFixed(2)}
                                          </span>
                                       </>
                                    ) : (
                                       <span className="text-gray-400 italic w-full text-center">No transactions matched.</span>
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

            {viewMode === 'provider' && displayProviderReports.map((providerState) => (
                <div key={providerState.id} className="bg-white rounded-[12px] border border-gray-200 overflow-hidden">
                   <div className="px-6 py-5 flex items-center justify-between bg-white border-b border-gray-100">
                      <div className="flex items-center space-x-3">
                         <span className="flex items-center justify-center bg-blue-100 text-blue-700 rounded-lg w-10 h-10 font-bold shrink-0">{providerState.name.charAt(0).toUpperCase()}</span>
                         <h2 className="text-[18px] font-bold text-slate-800 tracking-tight">{providerState.name}</h2>
                      </div>
                      <div className="flex items-center space-x-6 text-[15px] text-gray-600 whitespace-nowrap">
                         <span className="shrink-0 hidden md:inline">Category: <strong className="text-gray-900 capitalize">{providerState.category || 'N/A'}</strong></span>
                         <span className="shrink-0 hidden lg:inline">Payment: <strong className="text-gray-900 capitalize">{providerState.paymentMethod || 'Manual'}</strong></span>
                         <div className="w-px h-5 bg-gray-200 hidden md:block mx-2"></div>
                         <span className="shrink-0">Expected: <strong className="text-gray-900">€ {providerState.expectedSum.toFixed(2)}</strong></span>
                         <span className="shrink-0">Paid: <strong className="text-gray-900">€ {providerState.paidSum.toFixed(2)}</strong></span>
                         {providerState.missedCount > 0 && (
                            <span className="text-red-600 flex items-center gap-1.5 ml-4 shrink-0 font-medium whitespace-nowrap">
                               <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                               <span>{providerState.missedCount} Missed</span>
                            </span>
                         )}
                      </div>
                   </div>
                   <div className="bg-white overflow-x-auto rounded-b-[12px]">
                      <div className="min-w-[850px] divide-y divide-gray-100">
                         {providerState.ledger.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 text-sm font-medium">No active bills found for this provider.</div>
                         ) : (
                            <>
                               {/* Table Header */}
                               <div className="py-3 px-6 gap-6 items-center bg-gray-50/50 border-b border-gray-100" style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1.5fr) minmax(140px, 1.2fr) minmax(130px, 1fr) minmax(280px, 2.5fr)' }}>
                                  <div className="text-[11px] font-medium text-gray-400 uppercase tracking-widest">Billing Cycle</div>
                                  <div className="grid grid-cols-2 gap-4">
                                     <div className="text-[11px] font-medium text-gray-400 uppercase tracking-widest">Expected</div>
                                     <div className="text-[11px] font-medium text-gray-400 uppercase tracking-widest">Actual</div>
                                  </div>
                                  <div className="text-[11px] font-medium text-gray-400 uppercase tracking-widests text-center">Status</div>
                                  <div className="text-[11px] font-medium text-gray-400 uppercase tracking-widest text-right pr-5">Transaction Match</div>
                               </div>
                               
                               {/* Row Rendering */}
                               {providerState.ledger.map((bill) => (
                                  <div key={bill.id} className="py-6 px-6 gap-6 items-center" style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1.5fr) minmax(140px, 1.2fr) minmax(130px, 1fr) minmax(280px, 2.5fr)' }}>
                                     <div>
                                        <h4 className="text-[16px] font-bold text-slate-800 tracking-tight mb-1">{bill.label}</h4>
                                     </div>
                                     <div className="grid grid-cols-2 gap-4 mt-2">
                                        <div className="flex flex-col justify-center">
                                           <span className="text-[14px] text-slate-800 font-bold">{bill.expectedAmount < 0 ? '-' : ''}€ {Math.abs(bill.expectedAmount).toFixed(2)}</span>
                                           {bill.expectedAmount < 0 && <span className="text-[10px] font-bold text-blue-500 mt-0.5 uppercase tracking-wide">Refund</span>}
                                        </div>
                                        <div className="flex flex-col justify-center">
                                           <span className={`text-[14px] font-bold ${bill.actualPaid > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                              {bill.actualPaid > 0 ? `${bill.expectedAmount < 0 ? '-' : ''}€ ${bill.actualPaid.toFixed(2)}` : '€ 0.00'}
                                           </span>
                                        </div>
                                     </div>
                                     <div className="flex justify-center">
                                        <span className={`flex items-center px-4 py-1.5 rounded-full text-[14px] tracking-wide ${getStatusStyle(bill.reportStatus).classes}`} style={getStatusStyle(bill.reportStatus).style}>
                                           {getStatusIcon(bill.reportStatus)}
                                           {bill.reportStatus}
                                        </span>
                                     </div>
                                     <div className="flex justify-end w-full">
                                        <div className="bg-[#f8fafc] rounded-md text-[14px] py-4 px-5 w-full flex justify-between items-center text-gray-700 border border-transparent shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                                           {bill.txs && bill.txs.length > 0 ? (
                                              <>
                                                 <span className="font-mono tracking-tight text-gray-600 pr-4 truncate">
                                                    {bill.txs.length === 1 
                                                       ? `${bill.txs[0].dateStr || `${bill.txs[0].year}-${String(bill.txs[0].month).padStart(2, '0')}`} — ${bill.txs[0].name || bill.txs[0].rawBankDescription}`
                                                       : `${bill.txs.length} transactions linked`}
                                                 </span>
                                                 <span className="font-mono font-bold tracking-tight whitespace-nowrap text-slate-700">{bill.expectedAmount < 0 && bill.actualPaid > 0 ? '+' : ''}€ {bill.actualPaid.toFixed(2)}</span>
                                              </>
                                           ) : <span className="text-gray-400 italic w-full text-center">No transactions matched.</span>}
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
