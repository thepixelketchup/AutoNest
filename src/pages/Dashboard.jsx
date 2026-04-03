import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { getBills, getTransactions, saveTransaction } from '../services/billService';
import { ClearBillModal } from '../components/bills/ClearBillModal';
import { useToast } from '../hooks/useToast';

export default function Dashboard() {
  const { userProfile } = useAuth();
  const { addToast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState([]);
  const [transactions, setTransactions] = useState([]);
  
  const [clearBillSelect, setClearBillSelect] = useState(null); // Which bill to clear
  
  // Hardcode current month/year for MVP context
  const targetMonth = new Date().getMonth() + 1;
  const targetYear = new Date().getFullYear();

  useEffect(() => {
    if (userProfile?.householdId) {
      fetchData();
    }
  }, [userProfile?.householdId]);

  async function fetchData() {
    try {
      setLoading(true);
      const fetchedBills = await getBills(userProfile.householdId);
      const fetchedTxs = await getTransactions(userProfile.householdId, targetMonth, targetYear);
      // Sort bills by expected day
      fetchedBills.sort((a, b) => a.expectedDay - b.expectedDay);
      setBills(fetchedBills);
      setTransactions(fetchedTxs);
    } catch (err) {
      addToast("Failed to sync dashboard data.", "error");
    } finally {
      setLoading(false);
    }
  }


  async function handleClearBill(data) {
    try {
      const txObj = {
        month: targetMonth,
        year: targetYear,
        status: 'cleared',
        actualAmount: data.actualAmount,
        varianceReason: data.varianceReason,
        source: 'manual',
        rawBankDescription: ''
      };
      await saveTransaction(userProfile.householdId, clearBillSelect.id, txObj);
      addToast("Transaction cleared successfully!");
      fetchData();
    } catch (err) {
      addToast("Failed to clear transaction.", "error");
    }
  }

  // Derived state
  const mergedLedger = bills.map(bill => {
    const tx = transactions.find(t => t.billId === bill.id);
    return {
      ...bill,
      transaction: tx || null,
      status: tx?.status || 'pending',
    };
  });

  const totalExpected = mergedLedger.reduce((sum, b) => sum + b.expectedAmount, 0);
  const totalCleared = mergedLedger
    .filter(b => b.status === 'cleared')
    .reduce((sum, b) => sum + (b.transaction?.actualAmount || 0), 0);
    
  const amountRemaining = mergedLedger
    .filter(b => b.status === 'pending')
    .reduce((sum, b) => sum + b.expectedAmount, 0);

  // Variance calculating (only for cleared bills where actual > expected)
  const totalVariance = mergedLedger
    .filter(b => b.status === 'cleared' && b.transaction?.actualAmount > b.expectedAmount)
    .reduce((sum, b) => sum + (b.transaction.actualAmount - b.expectedAmount), 0);

  const currentDay = new Date().getDate();
  const pendingOverdue = mergedLedger.filter(b => b.status === 'pending' && b.expectedDay < currentDay);

  if (loading && bills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="font-medium animate-pulse">Syncing dashboard data...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <header className="flex justify-between items-center mb-6 mt-2 md:mt-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Household Dashboard</h1>
          <p className="text-gray-500 text-sm capitalize">{new Date().toLocaleString('default', { month: 'long' })} {targetYear} Ledger</p>
        </div>
      </header>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex flex-col justify-between h-24">
          <p className="text-sm text-gray-500 font-medium">Total Expected</p>
          <p className="text-2xl font-bold text-gray-900">€{totalExpected.toFixed(2)}</p>
        </Card>
        <Card className="p-4 flex flex-col justify-between h-24">
          <p className="text-sm text-gray-500 font-medium">Total Cleared</p>
          <p className="text-2xl font-bold text-green-600">€{totalCleared.toFixed(2)}</p>
        </Card>
        <Card className="p-4 flex flex-col justify-between h-24">
          <p className="text-sm text-gray-500 font-medium">Remaining</p>
          <p className="text-2xl font-bold text-blue-600">€{amountRemaining.toFixed(2)}</p>
        </Card>
        <Card className={`p-4 flex flex-col justify-between h-24 ${totalVariance > 0 ? 'bg-rose-50 border-rose-100' : ''}`}>
          <p className={`text-sm font-medium ${totalVariance > 0 ? 'text-rose-600' : 'text-gray-500'}`}>Variance Alert</p>
          <p className={`text-2xl font-bold ${totalVariance > 0 ? 'text-rose-700' : 'text-gray-900'}`}>€{totalVariance.toFixed(2)}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-0 border-gray-200">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-white shadow-sm z-10">
              <h2 className="text-lg font-semibold text-gray-800">Monthly Ledger</h2>
              <div className="flex space-x-2">
                 <span className="text-xs bg-gray-50 border border-gray-200 px-2 py-1 rounded-md text-gray-600 font-medium tracking-wide">PENDING: {mergedLedger.filter(b=>b.status==='pending').length}</span>
                 <span className="text-xs bg-green-50 border border-green-200 px-2 py-1 rounded-md text-green-700 font-medium tracking-wide">CLEARED: {mergedLedger.filter(b=>b.status==='cleared').length}</span>
              </div>
            </div>
            <div className="divide-y divide-gray-100 bg-white">
              {mergedLedger.length === 0 ? (
                <div className="p-16 text-center">
                  <div className="w-16 h-16 bg-blue-50 text-blue-200 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                  </div>
                  <p className="text-gray-500 font-medium border-none">No bills tracked yet.</p>
                  <p className="text-sm text-gray-400 mt-1">Start by adding your recurring bills!</p>
                </div>
              ) : (
                mergedLedger.map(item => (
                  <div key={item.id} className="p-5 flex items-center justify-between hover:bg-gray-50/80 transition-colors group">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gray-50 text-gray-900 rounded-lg flex flex-col items-center justify-center border border-gray-200 shadow-sm flex-shrink-0">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">Day</span>
                        <span className="font-bold leading-none">{item.expectedDay}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-lg">{item.name}</p>
                        <p className="text-sm text-gray-500 font-medium mt-0.5 capitalize">{item.category} <span className="mx-1 text-gray-300">•</span> €{item.expectedAmount.toFixed(2)}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      {item.status === 'cleared' ? (
                        <div className="text-right bg-green-50/50 px-3 py-2 rounded-lg border border-green-100/50">
                          <p className="text-sm font-bold text-green-600 mb-0.5 flex items-center justify-end">
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            Cleared
                          </p>
                          <p className="text-xs font-semibold text-gray-700">Actual: €{item.transaction?.actualAmount?.toFixed(2)}</p>
                          {item.transaction?.varianceReason && <p className="text-[10px] font-bold tracking-wide uppercase text-rose-500 mt-1">{item.transaction.varianceReason}</p>}
                        </div>
                      ) : (
                        <Button variant="outline" onClick={() => setClearBillSelect(item)} className="text-sm py-1.5 px-4 shadow-sm border-gray-300">Mark Cleared</Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
        
        <div className="space-y-6 lg:col-span-1">
          <Card className={`p-0 overflow-hidden ${pendingOverdue.length > 0 ? 'border-orange-200' : 'border-gray-200'}`}>
            <div className={`p-4 border-b ${pendingOverdue.length > 0 ? 'border-orange-100 bg-orange-50' : 'border-gray-100 bg-gray-50/50'}`}>
              <h2 className={`text-base font-semibold flex items-center ${pendingOverdue.length > 0 ? 'text-orange-800' : 'text-gray-800'}`}>
                {pendingOverdue.length > 0 && <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
                Requires Attention
              </h2>
            </div>
            <div className="p-4 bg-white">
              {pendingOverdue.length > 0 ? (
                <ul className="space-y-3">
                  {pendingOverdue.map(item => (
                     <li key={item.id} className="text-sm flex justify-between items-center bg-orange-50 p-3 rounded-lg border border-orange-100 shadow-sm">
                       <span className="font-semibold text-orange-900">{item.name}</span>
                       <span className="text-orange-600 bg-orange-100 px-2 py-0.5 rounded text-xs font-bold tracking-wide uppercase">Overdue</span>
                     </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-gray-500 text-center py-4 font-medium">No overdue pending bills!</div>
              )}
            </div>
          </Card>

          <Card className="p-0 border-gray-200">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-base font-semibold text-gray-800">Timeline Progress</h2>
            </div>
            <div className="p-6 bg-white">
              <div className="w-full bg-gray-100 rounded-full h-3 mb-3 shadow-inner overflow-hidden">
                <div className="bg-blue-600 h-3 rounded-full transition-all duration-700 ease-out" style={{ width: `${mergedLedger.length > 0 ? (mergedLedger.filter(b=>b.status==='cleared').length / mergedLedger.length) * 100 : 0}%` }}></div>
              </div>
              <p className="text-sm text-center text-gray-600 font-semibold">
                {mergedLedger.filter(b=>b.status==='cleared').length} of {mergedLedger.length} Bills Cleared
              </p>
            </div>
          </Card>
        </div>
      </div>

      <ClearBillModal isOpen={!!clearBillSelect} onClose={() => setClearBillSelect(null)} onSave={handleClearBill} bill={clearBillSelect} />
    </div>
  );
}
