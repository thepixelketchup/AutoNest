import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getTransactions, getMembers, updateTransaction } from '../services/billService';
import { getHousehold } from '../services/householdService';
import { useGlobalPeriod } from '../hooks/useGlobalPeriod';
const isContributionTx = (tx) => tx.status === 'contribution' && tx.memberId;
import { Card } from '../components/ui/Card';
import { useToast } from '../hooks/useToast';

function ContributionUnlinkModal({ tx, memberName, onUnlink, onClose }) {
  const [unlinking, setUnlinking] = useState(false);

  async function doUnlink() {
    setUnlinking(true);
    await onUnlink(tx);
    setUnlinking(false);
    onClose();
  }

  const amtF = Number(tx.amount?.toString().replace(/[^0-9.,-]/g, '').replace(',', '.')) || 0;
  const isPos = amtF > 0;
  const fmtDate = tx.dateStr && tx.dateStr.includes('-')
    ? tx.dateStr.split('-').reverse().join('-')
    : (tx.dateStr || `${tx.month}/${tx.year}`);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-8 py-6 bg-white border-b border-gray-100 flex justify-between items-start shrink-0">
          <div>
            <h2 className="text-xl font-black text-gray-900">Linked Contribution</h2>
            <p className="text-sm font-medium text-gray-500 mt-1">Contribution from {memberName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 p-2.5 rounded-xl transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Warning banner */}
        <div className="mx-8 mt-6 px-5 py-4 bg-amber-50 rounded-2xl flex items-start gap-3 shrink-0 border border-amber-100 shadow-sm">
          <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          <p className="text-[13px] font-bold text-amber-800 leading-relaxed">System Locked: Unlink the mapped bank transaction below to safely decouple this record from the household pool.</p>
        </div>

        {/* Transaction list */}
        <div className="divide-y divide-gray-100 overflow-y-auto flex-1 mt-2 px-8 mb-4">
          <div className="py-6 flex items-start justify-between gap-6 group">
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <p className="text-[15px] font-black text-gray-900 truncate leading-tight">{tx.name || 'Transaction'}</p>
              
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-semibold text-gray-400">{fmtDate}</span>
                <span className={`text-sm font-black ${isPos ? 'text-green-600' : 'text-gray-900'}`}>{tx.amount}</span>
                <span className="text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-lg shadow-sm">
                  € {Math.abs(tx.actualAmount || 0).toFixed(2)} mapped
                </span>
              </div>

              {tx.rawBankDescription && (
                <p className="text-[11px] text-gray-400 font-medium italic break-words whitespace-normal leading-relaxed mt-1">{tx.rawBankDescription}</p>
              )}
            </div>
            
            <button
              onClick={doUnlink}
              disabled={unlinking}
              className="px-4 py-2 text-xs font-bold text-red-600 border border-red-200 bg-red-50 rounded-xl hover:bg-red-100 disabled:opacity-50 transition shadow-sm"
            >
              Unlink
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

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

export default function Contributions() {
  const { userProfile } = useAuth();
  const { addToast } = useToast();
  
  const [members, setMembers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [household, setHousehold] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [unlinkModalTx, setUnlinkModalTx] = useState(null);

  // Filtering
  const [selectedMember, setSelectedMember] = useState('');
  const [yearFilter, setYearFilter] = useGlobalPeriod('this_month');

  useEffect(() => {
    if (userProfile?.householdId) {
      loadData();
    }
  }, [userProfile?.householdId]);

  async function loadData() {
    try {
      setLoading(true);
      const [mems, txs, hs] = await Promise.all([
        getMembers(userProfile.householdId),
        getTransactions(userProfile.householdId),
        getHousehold(userProfile.householdId)
      ]);
      setMembers(mems);
      setHousehold(hs);
      // Filter out only contribution transactions
      const contribTxs = txs.filter(t => isContributionTx(t) && t.status === 'contribution');
      // Sort latest to oldest
      contribTxs.sort((a,b) => {
        const da = a.dateStr ? new Date(a.dateStr) : new Date(a.year, a.month-1, 1);
        const db = b.dateStr ? new Date(b.dateStr) : new Date(b.year, b.month-1, 1);
        return db - da;
      });
      setTransactions(contribTxs);
    } catch(e) {
      addToast("Failed to load contributions data.", "error");
    } finally {
      setLoading(false);
    }
  }

  const handleUnlink = async (tx) => {
    try {
      await updateTransaction(userProfile.householdId, tx.id, {
        memberId: null, billId: null, billIds: [], status: 'unmatched', actualAmount: 0, varianceReason: ''
      });
      setTransactions(prev => prev.filter(t => t.id !== tx.id));
      addToast("Contribution unlinked successfully.", "success");
    } catch (e) {
      addToast("Failed to unlink contribution.", "error");
    }
  };

  const availableYears = React.useMemo(() => {
    const thisYear = new Date().getFullYear();
    let startYear = thisYear;
    if (household?.trackingStartDate) {
      const parts = household.trackingStartDate.split('-');
      if (parts.length > 0) startYear = parseInt(parts[0], 10);
    }
    const yrs = ['all', 'this_month'];
    for (let y = thisYear; y >= startYear; y--) yrs.push(y);
    return yrs;
  }, [household]);

  const filteredTxs = transactions.filter(tx => {
    if (selectedMember && tx.memberId !== selectedMember) return false;
    
    // Year filter
    let txYear = parseInt(tx.year);
    let txMonth = parseInt(tx.month);
    if (!txYear && tx.dateStr) {
      const d = new Date(tx.dateStr);
      txYear = d.getFullYear();
      txMonth = d.getMonth() + 1;
    }
    if (yearFilter === 'this_month') {
      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();
      if (txYear !== currentYear || txMonth !== currentMonth) return false;
    } else if (yearFilter !== 'all' && txYear !== Number(yearFilter)) {
      return false;
    }
    return true;
  });

  const totalContributed = filteredTxs.reduce((sum, tx) => sum + (tx.actualAmount || 0), 0);
  
  const memberStats = members.map(m => {
    const amount = filteredTxs.filter(t => t.memberId === m.id).reduce((s, t) => s + (t.actualAmount || 0), 0);
    return { name: m.name, amount };
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="font-medium animate-pulse">Loading Contributions...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      
      {unlinkModalTx && (
        <ContributionUnlinkModal
          tx={unlinkModalTx}
          memberName={members.find(m => m.id === unlinkModalTx.memberId)?.name || 'Unknown'}
          onUnlink={handleUnlink}
          onClose={() => setUnlinkModalTx(null)}
        />
      )}

      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Contributions</h1>
          <p className="text-gray-400 text-sm mt-0.5">Track integrated member funds and specific top-ups.</p>
        </div>
      </header>

      {/* Filter and Stats Bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Year filter dropdown */}
        <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
          className="appearance-none bg-white border border-gray-200 text-gray-700 font-semibold text-[13px] px-4 py-2.5 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition shadow-sm min-w-[140px]" 
          style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}>
          {availableYears.map(yr => (
            <option key={yr} value={yr}>
              {yr === 'all' ? 'All Years' : yr === 'this_month' ? 'This Month' : yr}
            </option>
          ))}
        </select>

        <select 
          value={selectedMember} 
          onChange={e => setSelectedMember(e.target.value)}
          className="appearance-none bg-white border border-gray-200 text-gray-700 font-semibold text-[13px] px-4 py-2.5 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition shadow-sm min-w-[180px]"
          style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
        >
          <option value="">All Contributors</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <span className="text-sm text-gray-400 ml-auto">{filteredTxs.length} record{filteredTxs.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">Total Contributions</p>
          <p className="text-[20px] font-black text-green-600 tracking-tight">€ {totalContributed.toFixed(2)}</p>
        </div>
        {memberStats.map(st => (
          <div key={st.name} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1 truncate">{st.name}</p>
            <p className={`text-[20px] font-black tracking-tight ${st.amount < 0 ? 'text-red-500' : 'text-slate-800'}`}>
              {st.amount < 0 ? '− ' : '+ '}€ {Math.abs(st.amount).toFixed(2)}
            </p>
          </div>
        ))}
      </div>

      <Card className="p-0 border-gray-200 overflow-hidden min-h-[400px]">
        {/* Desktop Header Grid */}
        <div className="hidden md:grid items-center gap-4 px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50/80 border-b border-gray-100 min-h-[50px]"
          style={{ gridTemplateColumns: '2fr 1fr 1fr 2fr 100px' }}>
          <div>Contributor</div>
          <div>Date</div>
          <div>Amount</div>
          <div>Bank Source</div>
          <div className="text-right pr-2">Actions</div>
        </div>

        <div className="divide-y divide-gray-100">
          {filteredTxs.length === 0 ? (
            <div className="py-20 text-center">
              <svg className="w-12 h-12 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-400 font-medium">No contributions mapped yet.</p>
            </div>
          ) : filteredTxs.map(tx => {
            const member = members.find(m => m.id === tx.memberId);
            const isDeduction = (tx.actualAmount || 0) < 0;
            const amtF = Math.abs(tx.actualAmount || 0);

            return (
              <div key={tx.id} className="hover:bg-gray-50/50 transition-colors">
                
                {/* Desktop Grid Row */}
                <div className="hidden md:grid items-center gap-4 px-6 py-4 min-h-[84px]"
                  style={{ gridTemplateColumns: '2fr 1fr 1fr 2fr 100px' }}>
                  
                  {/* Column 1: Contributor */}
                  <div className="flex items-center gap-2.5 min-w-0 pr-4">
                    <div className="w-8 h-8 rounded-lg outline outline-1 outline-blue-100 bg-blue-50 text-blue-700 flex items-center justify-center font-black text-sm shrink-0">
                      {member?.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-800 text-sm truncate">{member?.name || 'Unknown'}</p>
                      <p className="text-[10px] text-gray-400 truncate">Member Identity</p>
                    </div>
                  </div>

                  {/* Column 2: Date */}
                  <div>
                    <p className="text-sm font-semibold text-gray-700">{formatDDMMYYYY(tx.dateStr || `${tx.year}-${tx.month}-01`)}</p>
                  </div>

                  {/* Column 3: Amount */}
                  <div>
                    <span className={`text-sm font-black ${isDeduction ? 'text-red-500' : 'text-green-600'}`}>
                       {isDeduction ? '− ' : '+ '}€ {amtF.toFixed(2)}
                    </span>
                    <p className="text-[10px] font-semibold text-gray-400 mt-0.5">
                       {isDeduction ? 'Deduction' : 'Top-up'}
                    </p>
                  </div>

                  {/* Column 4: Bank Source */}
                  <div className="flex flex-col items-start min-w-0 pr-4">
                    <p className="font-semibold text-gray-700 text-[13px] truncate w-full">{tx.name}</p>
                    {tx.rawBankDescription && (
                      <p className="text-[10px] text-gray-400 break-words whitespace-normal leading-relaxed w-full mt-0.5 font-mono" title={tx.rawBankDescription}>
                        {tx.rawBankDescription}
                      </p>
                    )}
                  </div>

                  {/* Column 5: Actions */}
                  <div className="flex items-center justify-end pr-2">
                     <button onClick={() => setUnlinkModalTx(tx)} 
                       className="py-1 px-2.5 text-[11px] font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-white hover:text-blue-600 transition shadow-sm">
                       1 tx linked
                     </button>
                  </div>
                </div>

                {/* Mobile Fallback Grid */}
                <div className="md:hidden flex flex-col p-4 gap-3">
                  <div className="flex justify-between items-start gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                       <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm shrink-0 bg-blue-50 text-blue-700 outline outline-1 outline-blue-100">
                         {member?.name?.charAt(0)?.toUpperCase()}
                       </div>
                       <div className="min-w-0 pr-2 flex-1">
                         <p className="font-semibold text-gray-800 text-sm truncate">{member?.name || 'Unknown'}</p>
                         <p className="text-[10px] text-gray-400 mt-0.5 truncate">{formatDDMMYYYY(tx.dateStr || `${tx.year}-${tx.month}-01`)}</p>
                       </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-sm font-black ${isDeduction ? 'text-red-500' : 'text-green-600'}`}>
                         {isDeduction ? '− ' : '+ '}€ {amtF.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="w-full bg-gray-50 border border-gray-100 rounded-lg p-2.5 mt-1">
                     <p className="font-bold text-gray-600 text-[11px] truncate">{tx.name}</p>
                     {tx.rawBankDescription && (
                        <p className="text-[10px] text-gray-400 break-words whitespace-normal leading-relaxed mt-0.5 font-mono">{tx.rawBankDescription}</p>
                     )}
                  </div>
                  
                  <div className="pt-2 border-t border-gray-100 flex justify-end">
                     <button onClick={() => setUnlinkModalTx(tx)} className="py-1.5 px-3 text-[11px] font-bold text-gray-700 bg-white border border-gray-200 rounded-lg shadow-sm">
                        1 tx linked
                     </button>
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
