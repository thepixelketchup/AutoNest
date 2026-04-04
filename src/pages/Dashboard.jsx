import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getProviders, getMembers, getBills, getTransactions, getBillPeriodMonthYear } from '../services/billService';
import { useToast } from '../hooks/useToast';

// ── helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => `€ ${Math.abs(Number(n || 0)).toFixed(2)}`;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function RingProgress({ pct = 0, size = 130, stroke = 13, color = '#3b82f6' }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(100, pct) / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color}
        strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
    </svg>
  );
}

function StatCard({ label, value, sub, icon, accent = 'blue' }) {
  const clr = {
    blue:   ['bg-blue-50',   'text-blue-500',   'text-blue-700'],
    green:  ['bg-green-50',  'text-green-500',  'text-green-700'],
    amber:  ['bg-amber-50',  'text-amber-500',  'text-amber-700'],
    red:    ['bg-red-50',    'text-red-500',    'text-red-700'],
    purple: ['bg-purple-50', 'text-purple-500', 'text-purple-700'],
    indigo: ['bg-indigo-50', 'text-indigo-500', 'text-indigo-700'],
  }[accent] || ['bg-blue-50','text-blue-500','text-blue-700'];
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col justify-between min-h-[110px] hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
        <span className={`${clr[0]} ${clr[1]} rounded-xl p-2`}>{icon}</span>
      </div>
      <div>
        <p className={`text-[24px] font-black tracking-tight ${clr[2]}`}>{value}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5 font-medium">{sub}</p>}
      </div>
    </div>
  );
}

function MiniBar({ pct, color = '#8b5cf6' }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
      <div className="h-1.5 rounded-full transition-all duration-700"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color }} />
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { userProfile } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const now     = new Date();
  const thisMonth = now.getMonth() + 1;
  const thisYear  = now.getFullYear();
  const todayDay  = now.getDate();

  const [loading,      setLoading]      = useState(true);
  const [providers,    setProviders]    = useState([]);
  const [members,      setMembers]      = useState([]);
  const [allBills,     setAllBills]     = useState([]);
  const [allTxs,       setAllTxs]       = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('month'); // 'month' | '2025' | '2026' | 'all'

  useEffect(() => {
    if (userProfile?.householdId) fetchData();
  }, [userProfile?.householdId]);

  async function fetchData() {
    try {
      setLoading(true);
      const [p, b, t, m] = await Promise.all([
        getProviders(userProfile.householdId),
        getBills(userProfile.householdId),
        getTransactions(userProfile.householdId),
        getMembers(userProfile.householdId),
      ]);
      setProviders(p);
      setAllBills(b);
      setAllTxs(t);
      setMembers(m);
    } catch {
      addToast('Failed to load dashboard.', 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── Available years from bills ─────────────────────────────────────────────
  const availableYears = useMemo(() => {
    const yrs = new Set(allBills.map(b => b.year));
    allTxs.forEach(t => { if (t.year) yrs.add(t.year); });
    return [...yrs].sort((a,b) => b - a);
  }, [allBills, allTxs]);

  // ── Filter helpers ─────────────────────────────────────────────────────────
  const billInPeriod = (bill) => {
    const { month: bm, year: by } = getBillPeriodMonthYear(bill);
    if (selectedPeriod === 'month') return bm === thisMonth && by === thisYear;
    if (selectedPeriod === 'all')   return true;
    return by === parseInt(selectedPeriod, 10);
  };
  const txInPeriod = (tx) => {
    const d = tx.dateStr ? new Date(tx.dateStr) : null;
    const txYear  = d && !isNaN(d) ? d.getFullYear() : tx.year;
    const txMonth = d && !isNaN(d) ? d.getMonth() + 1 : tx.month;
    if (selectedPeriod === 'month') return txYear === thisYear && txMonth === thisMonth;
    if (selectedPeriod === 'all')   return true;
    return txYear === parseInt(selectedPeriod, 10);
  };

  // ── Derived data ───────────────────────────────────────────────────────────
  const periodBills = allBills.filter(billInPeriod);
  const periodTxs   = allTxs.filter(txInPeriod);

  const enrichedBills = periodBills.map(bill => {
    const provider = providers.find(p => p.id === bill.providerId);
    const tx = allTxs.find(t => t.billId === bill.id && t.status === 'cleared');
    return { ...bill, providerName: provider?.name || '?', category: provider?.category || '', tx };
  });

  const totalExpected  = enrichedBills.reduce((s, b) => s + (b.amount || 0), 0);
  const totalPaid      = enrichedBills.filter(b => b.tx).reduce((s, b) => s + (b.tx?.actualAmount || 0), 0);
  const totalRemaining = enrichedBills.filter(b => !b.tx).reduce((s, b) => s + (b.amount || 0), 0);
  const clearedCount   = enrichedBills.filter(b => b.tx).length;
  const paidPct        = totalExpected > 0 ? (totalPaid / totalExpected) * 100 : 0;
  const overdueBills   = selectedPeriod === 'month'
    ? enrichedBills.filter(b => !b.tx && b.billingPeriod?.type === 'month' && b.status === 'overdue')
    : [];

  // Contributions
  const contribTxs  = periodTxs.filter(t => t.status === 'contribution' && t.memberId && !t.billId);
  const totalContrib = contribTxs.reduce((s, t) => s + (t.actualAmount || 0), 0);

  // Provider spend breakdown
  const providerSpend = providers.map(p => {
    const pBills = enrichedBills.filter(b => b.providerId === p.id);
    const expected = pBills.reduce((s, b) => s + (b.amount || 0), 0);
    const paid     = pBills.filter(b => b.tx).reduce((s, b) => s + (b.tx?.actualAmount || 0), 0);
    const missed   = pBills.filter(b => !b.tx && b.status !== 'cleared').length;
    return { id: p.id, name: p.name, category: p.category, expected, paid, missed };
  }).filter(p => p.expected > 0).sort((a,b) => b.expected - a.expected);

  const maxProvSpend = Math.max(...providerSpend.map(p => p.expected), 1);

  // Member summaries
  const memberSummaries = members.map(m => {
    const mTxs     = contribTxs.filter(t => t.memberId === m.id);
    const deposits  = mTxs.filter(t => (t.actualAmount||0) > 0).reduce((s,t) => s + (t.actualAmount||0), 0);
    const deductions= mTxs.filter(t => (t.actualAmount||0) < 0).reduce((s,t) => s + Math.abs(t.actualAmount||0), 0);
    const net       = deposits - deductions;
    return { ...m, deposits, deductions, net, txCount: mTxs.length };
  });
  const maxDeposit = Math.max(...memberSummaries.map(m => m.deposits), 1);

  // Time-series chart
  const chartData = useMemo(() => {
    if (selectedPeriod === 'month') {
      // Current month: last 6 months comparison
      return Array.from({ length: 6 }, (_, i) => {
        const d   = new Date(thisYear, now.getMonth() - (5 - i), 1);
        const mn  = d.getMonth() + 1;
        const yr  = d.getFullYear();
        const b   = allBills.filter(x => x.month === mn && x.year === yr);
        const exp = b.reduce((s, x) => s + (x.amount || 0), 0);
        const paid= allTxs.filter(t => b.some(x => x.id === t.billId) && t.status === 'cleared').reduce((s,t) => s + (t.actualAmount||0), 0);
        return { label: `${MONTHS[mn-1]} ${yr !== thisYear ? yr : ''}`.trim(), exp, paid, isCurrent: mn === thisMonth && yr === thisYear };
      });
    }
    if (selectedPeriod === 'all') {
      // All years: one bar per year
      return availableYears.slice().reverse().map(yr => {
        const b   = allBills.filter(x => x.year === yr);
        const exp = b.reduce((s, x) => s + (x.amount || 0), 0);
        const paid= allTxs.filter(t => b.some(x => x.id === t.billId) && t.status === 'cleared').reduce((s,t) => s + (t.actualAmount||0), 0);
        return { label: String(yr), exp, paid, isCurrent: yr === thisYear };
      });
    }
    // Specific year: month by month
    const yr = parseInt(selectedPeriod, 10);
    return Array.from({ length: 12 }, (_, i) => {
      const mn  = i + 1;
      const b   = allBills.filter(x => x.month === mn && x.year === yr);
      const exp = b.reduce((s, x) => s + (x.amount || 0), 0);
      const paid= allTxs.filter(t => b.some(x => x.id === t.billId) && t.status === 'cleared').reduce((s,t) => s + (t.actualAmount||0), 0);
      return { label: MONTHS[i], exp, paid, isCurrent: mn === thisMonth && yr === thisYear };
    });
  }, [selectedPeriod, allBills, allTxs, availableYears]);

  const maxChartVal = Math.max(...chartData.map(x => x.exp), 1);

  // Recent txs
  const recentTxs = [...allTxs]
    .sort((a, b) => new Date(b.dateStr || `${b.year}-${b.month}-01`) - new Date(a.dateStr || `${a.year}-${a.month}-01`))
    .slice(0, 6);

  const unmatched = allTxs.filter(t => t.billId === null && t.status !== 'contribution');

  const periodLabel = selectedPeriod === 'month'
    ? `${now.toLocaleString('default', { month: 'long' })} ${thisYear}`
    : selectedPeriod === 'all' ? 'All Time' : selectedPeriod;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-400">
        <div className="relative w-14 h-14 mb-5">
          <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
          <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
        </div>
        <p className="font-semibold text-gray-500">Syncing household data…</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">

      {/* ── HEADER + PERIOD SELECTOR ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-0.5">{now.toLocaleString('default', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Period Selector */}
          <div className="flex bg-gray-100 border border-gray-200 rounded-xl p-1 gap-1 flex-wrap">
            <button
              onClick={() => setSelectedPeriod('month')}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${selectedPeriod === 'month' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
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
          {/* Quick Actions */}
          <button onClick={() => navigate('/imports')} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            Import
          </button>
          <button onClick={() => navigate('/reports')} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-50 transition shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            Reports
          </button>
        </div>
      </div>

      {/* ── ALERTS (month-only) ─────────────────────────────────────────── */}
      {selectedPeriod === 'month' && (overdueBills.length > 0 || unmatched.length > 0) && (
        <div className="flex flex-col sm:flex-row gap-3">
          {overdueBills.length > 0 && (
            <div className="flex-1 flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-3.5">
              <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-red-800">{overdueBills.length} overdue bill{overdueBills.length > 1 ? 's' : ''}</p>
                <p className="text-xs text-red-400 truncate">{overdueBills.map(b => b.providerName).join(', ')}</p>
              </div>
              <button onClick={() => navigate('/transactions')} className="text-xs font-bold text-red-600 hover:underline shrink-0">View →</button>
            </div>
          )}
          {unmatched.length > 0 && (
            <div className="flex-1 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5">
              <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-800">{unmatched.length} unmatched transaction{unmatched.length !== 1 ? 's' : ''}</p>
                <p className="text-xs text-amber-500">Need linking to a bill or member</p>
              </div>
              <button onClick={() => navigate('/transactions')} className="text-xs font-bold text-amber-600 hover:underline shrink-0">Match →</button>
            </div>
          )}
        </div>
      )}

      {/* ── KPI CARDS ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label={`Expected · ${periodLabel}`} value={fmt(totalExpected)}
          sub={`${periodBills.length} bills`} accent="blue"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2" /></svg>}
        />
        <StatCard label={`Paid · ${periodLabel}`} value={fmt(totalPaid)}
          sub={`${clearedCount}/${periodBills.length} cleared`} accent="green"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
        />
        <StatCard label="Outstanding" value={fmt(totalRemaining)}
          sub={overdueBills.length > 0 ? `${overdueBills.length} overdue` : '0 overdue'} accent={overdueBills.length > 0 ? 'red' : 'amber'}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <StatCard label={`Contributions · ${periodLabel}`} value={fmt(totalContrib)}
          sub={`${contribTxs.length} transaction${contribTxs.length !== 1 ? 's' : ''}`} accent="purple"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
        />
        <StatCard label="Coverage Rate" value={`${Math.round(paidPct)}%`}
          sub={`€${(totalExpected - totalPaid).toFixed(0)} gap`} accent="indigo"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
        />
      </div>

      {/* ── MAIN GRID ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT COL: Ring + Chart */}
        <div className="lg:col-span-1 space-y-6">

          {/* Ring */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col items-center text-center">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-4">{periodLabel} Progress</p>
            <div className="relative flex items-center justify-center">
              <RingProgress pct={paidPct} size={140} stroke={14}
                color={paidPct >= 75 ? '#22c55e' : paidPct >= 40 ? '#3b82f6' : '#f59e0b'} />
              <div className="absolute text-center">
                <p className="text-[28px] font-black text-gray-900">{Math.round(paidPct)}%</p>
                <p className="text-[11px] text-gray-400 font-semibold">cleared</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 w-full mt-5">
              {[
                { l: 'Cleared', v: clearedCount, c: 'text-green-600' },
                { l: 'Pending', v: periodBills.length - clearedCount, c: 'text-amber-500' },
                { l: 'Overdue', v: overdueBills.length, c: 'text-red-500' },
              ].map(s => (
                <div key={s.l}>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{s.l}</p>
                  <p className={`text-[18px] font-black ${s.c}`}>{s.v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Spend Chart */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-4">
              {selectedPeriod === 'month' ? '6-Month Trend' : selectedPeriod === 'all' ? 'Year-by-Year Spend' : `${selectedPeriod} Monthly Spend`}
            </p>
            <div className="flex items-end gap-1.5 h-28">
              {chartData.map((d, i) => {
                const expH = Math.round((d.exp / maxChartVal) * 100);
                const paidH = d.exp > 0 ? Math.round((d.paid / maxChartVal) * 100) : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`Expected: €${d.exp.toFixed(0)} | Paid: €${d.paid.toFixed(0)}`}>
                    <div className="relative w-full flex items-end justify-center" style={{ height: '96px' }}>
                      <div className="absolute bottom-0 w-full rounded-t-md opacity-20 transition-all duration-500"
                        style={{ height: `${Math.max(expH, 3)}%`, backgroundColor: d.isCurrent ? '#3b82f6' : '#94a3b8' }} />
                      <div className="absolute bottom-0 w-3/4 rounded-t-md transition-all duration-700"
                        style={{ height: `${Math.max(paidH, 0)}%`, backgroundColor: d.isCurrent ? '#3b82f6' : '#475569' }} />
                    </div>
                    <p className={`text-[9px] font-bold truncate text-center ${d.isCurrent ? 'text-blue-600' : 'text-gray-400'}`}>{d.label}</p>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3">
              <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
                <span className="w-3 h-2 rounded-sm bg-slate-300 opacity-50 inline-block" />Expected
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
                <span className="w-3 h-2 rounded-sm bg-slate-600 inline-block" />Paid
              </span>
            </div>
          </div>
        </div>

        {/* MIDDLE COL: Provider Spend Breakdown */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center shrink-0">
            <div>
              <h2 className="font-bold text-gray-900">Spend by Provider</h2>
              <p className="text-xs text-gray-400 mt-0.5">{periodLabel}</p>
            </div>
            <button onClick={() => navigate('/reports')} className="text-[12px] font-semibold text-blue-600 hover:text-blue-800">Full report →</button>
          </div>
          <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
            {providerSpend.length === 0 ? (
              <div className="py-14 text-center text-gray-400 text-sm">No bill data for this period.</div>
            ) : providerSpend.map(p => {
              const pct     = (p.expected / maxProvSpend) * 100;
              const paidPct = p.expected > 0 ? (p.paid / p.expected) * 100 : 0;
              return (
                <div key={p.id} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-black text-sm shrink-0">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                        <p className="text-[10px] text-gray-400 capitalize">{p.category}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-black text-gray-800">{fmt(p.paid)}</p>
                      <p className="text-[10px] text-gray-400">of {fmt(p.expected)}</p>
                    </div>
                  </div>
                  {/* two-layer bar: expected (light) and paid (solid) */}
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className="relative h-2 rounded-full bg-blue-100" style={{ width: `${pct}%` }}>
                      <div className="absolute left-0 top-0 h-2 rounded-full bg-blue-500 transition-all duration-700"
                        style={{ width: `${paidPct}%` }} />
                    </div>
                  </div>
                  {p.missed > 0 && (
                    <p className="text-[10px] text-red-400 mt-1">{p.missed} unpaid bill{p.missed > 1 ? 's' : ''}</p>
                  )}
                </div>
              );
            })}
          </div>
          {/* Footer total */}
          {providerSpend.length > 0 && (
            <div className="border-t border-gray-100 px-5 py-3 flex justify-between items-center bg-gray-50/60 shrink-0">
              <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Total Paid</p>
              <p className="font-black text-blue-700">{fmt(totalPaid)}</p>
            </div>
          )}
        </div>

        {/* RIGHT COL: Member Contributions + Recent */}
        <div className="lg:col-span-1 space-y-6">

          {/* Member Contributions Panel */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h2 className="font-bold text-gray-900">Contributions</h2>
                <p className="text-xs text-gray-400 mt-0.5">{periodLabel}</p>
              </div>
              <button onClick={() => navigate('/reports')} className="text-[12px] font-semibold text-blue-600 hover:text-blue-800">Details →</button>
            </div>
            <div className="p-4 space-y-4">
              {memberSummaries.length === 0 ? (
                <div className="py-6 text-center text-gray-400 text-sm">
                  <svg className="w-8 h-8 mx-auto mb-2 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  No members configured.
                </div>
              ) : memberSummaries.map(m => {
                const barPct = (m.deposits / maxDeposit) * 100;
                return (
                  <div key={m.id}>
                    <div className="flex items-center gap-3 mb-1.5">
                      <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-black text-sm shrink-0">
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                          <p className="text-sm font-semibold text-gray-800 truncate">{m.name}</p>
                          <p className={`text-sm font-black ml-2 shrink-0 ${m.net >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {m.net >= 0 ? '+' : '−'} {fmt(m.net)}
                          </p>
                        </div>
                        <div className="flex text-[10px] text-gray-400 gap-2 mt-0.5">
                          <span className="text-green-500">+{fmt(m.deposits)}</span>
                          {m.deductions > 0 && <span className="text-red-400">−{fmt(m.deductions)}</span>}
                          <span>{m.txCount} tx</span>
                        </div>
                      </div>
                    </div>
                    <MiniBar pct={barPct} color="#8b5cf6" />
                  </div>
                );
              })}
            </div>
            {memberSummaries.length > 0 && (
              <div className="border-t border-gray-100 px-5 py-3 flex justify-between items-center bg-gray-50/60">
                <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Net Pool</p>
                <p className={`font-black text-[15px] ${totalContrib >= 0 ? 'text-purple-700' : 'text-red-500'}`}>
                  {totalContrib >= 0 ? '+' : '−'} {fmt(totalContrib)}
                </p>
              </div>
            )}
          </div>

          {/* Upcoming this month (only in month view) */}
          {selectedPeriod === 'month' && (() => {
            const upcoming = enrichedBills.filter(b => !b.tx && b.expectedDay >= todayDay && b.expectedDay <= todayDay + 7).sort((a,b) => a.expectedDay - b.expectedDay);
            if (upcoming.length === 0) return null;
            return (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="font-bold text-gray-900">Due in 7 Days</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {upcoming.map(b => (
                    <div key={b.id} className="px-5 py-3 flex justify-between items-center">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{b.providerName}</p>
                        <p className="text-[10px] text-gray-400">Day {b.expectedDay}</p>
                      </div>
                      <p className="text-sm font-black text-amber-600">{fmt(b.amount)}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── RECENT ACTIVITY ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="font-bold text-gray-900">Recent Transactions</h2>
          <button onClick={() => navigate('/transactions')} className="text-[12px] font-semibold text-blue-600 hover:text-blue-800">View all →</button>
        </div>
        <div className="divide-y divide-gray-50">
          {recentTxs.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">
              <svg className="w-10 h-10 mx-auto mb-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
              No transactions imported yet.
            </div>
          ) : recentTxs.map(tx => {
            const isContrib  = tx.status === 'contribution';
            const isDeduct   = isContrib && (tx.actualAmount||0) < 0;
            const isCleared  = tx.status === 'cleared';
            const isUnmatched = !tx.billId && !isContrib;
            const member     = isContrib ? members.find(m => m.id === tx.memberId) : null;
            const txBill     = tx.billId ? allBills.find(b => b.id === tx.billId) : null;
            const txProvider = txBill ? providers.find(p => p.id === txBill.providerId) : null;
            const iconBg     = isDeduct ? 'bg-red-100' : isContrib ? 'bg-purple-100' : isCleared ? 'bg-green-100' : 'bg-gray-100';
            const iconColor  = isDeduct ? 'text-red-500' : isContrib ? 'text-purple-500' : isCleared ? 'text-green-500' : 'text-gray-400';
            const amtColor   = isDeduct ? 'text-red-500' : isContrib ? 'text-purple-600' : isCleared ? 'text-green-600' : 'text-gray-400';
            const amtPrefix  = isDeduct ? '−' : isContrib ? '+' : '';
            return (
              <div key={tx.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
                  {isDeduct ? (
                    <svg className={`w-5 h-5 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" /></svg>
                  ) : isContrib ? (
                    <svg className={`w-5 h-5 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                  ) : isCleared ? (
                    <svg className={`w-5 h-5 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  ) : (
                    <svg className={`w-5 h-5 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 text-sm truncate">{tx.name || tx.rawBankDescription || 'Transaction'}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {tx.dateStr || `${tx.month}/${tx.year}`}
                    {isContrib && member && <> · <span className="font-semibold text-purple-500">{isDeduct ? `Deduction — ` : `Contribution — `}{member.name}</span></>}
                    {isCleared && txProvider && <> · <span className="font-semibold text-green-500">{txProvider.name}</span></>}
                    {isUnmatched && <> · <span className="font-semibold text-amber-500">Unmatched</span></>}
                  </p>
                </div>
                <p className={`font-black text-sm shrink-0 ${amtColor}`}>
                  {amtPrefix} {fmt(Math.abs(tx.actualAmount || parseFloat(tx.amount) || 0))}
                </p>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
