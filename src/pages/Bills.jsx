import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import {
  getBills, addBill, updateBill, deleteBill,
  getProviders, getTransactions,
  getBillPeriodLabel, getBillPeriodMonthYear,
  unlinkTransactionFromBill,
} from '../services/billService';
import { getHousehold } from '../services/householdService';


const MONTHS = [
  { v: 1, l: 'January' }, { v: 2, l: 'February' }, { v: 3, l: 'March' },
  { v: 4, l: 'April' }, { v: 5, l: 'May' }, { v: 6, l: 'June' },
  { v: 7, l: 'July' }, { v: 8, l: 'August' }, { v: 9, l: 'September' },
  { v: 10, l: 'October' }, { v: 11, l: 'November' }, { v: 12, l: 'December' },
];

const now = new Date();
const thisYear = now.getFullYear();

const STATUS_STYLE = {
  cleared: { bg: 'bg-green-100', text: 'text-green-700', label: 'Cleared' },
  partial: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Partial' },
  overdue: { bg: 'bg-red-100', text: 'text-red-700', label: 'Overdue' },
  pending: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Pending' },
};

const fmt = (n) => `€ ${Number(n || 0).toFixed(2)}`;

const SELECT_CLASS = "appearance-none border border-gray-200 rounded-xl pl-4 pr-10 py-2 text-sm font-semibold text-gray-600 focus:ring-2 focus:ring-blue-500 outline-none bg-white bg-no-repeat bg-[center_right_12px] bg-[length:16px_16px] transition-shadow cursor-pointer hover:border-gray-300";
const SELECT_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`;


// ── LinkedTxsModal ───────────────────────────────────────────────────────
// Shows all transactions linked to a bill, with individual unlink buttons
function LinkedTxsModal({ bill, linkedTxs, billAmountLabel, onUnlink, onClose }) {
  const [unlinking, setUnlinking] = useState(null); // txId being processed

  async function doUnlink(txId) {
    setUnlinking(txId);
    await onUnlink(txId);
    setUnlinking(null);
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex justify-between items-start shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Linked Transactions</h2>
            <p className="text-xs text-gray-400 mt-0.5">{billAmountLabel}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Warning banner */}
        <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center gap-2 shrink-0">
          <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          <p className="text-xs font-semibold text-amber-700">Unlink all transactions to enable editing or deleting this bill.</p>
        </div>

        {/* Transaction list */}
        <div className="divide-y divide-gray-100 overflow-y-auto flex-1">
          {linkedTxs.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-10">No linked transactions.</p>
          ) : linkedTxs.map(tx => {
            const amtF = Number(tx.amount?.toString().replace(/[^0-9.,-]/g, '').replace(',', '.')) || 0;
            const isPos = amtF > 0;
            const paidAmt = tx.billAmounts?.[bill.id];
            const isProcessing = unlinking === tx.id;
            return (
              <div key={tx.id} className="px-5 py-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-800 truncate">{tx.name || 'Transaction'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {tx.dateStr || `${tx.month}/${tx.year}`}
                    <span className="mx-2 text-gray-200">•</span>
                    <span className={`font-black ${isPos ? 'text-green-600' : 'text-gray-700'}`}>{tx.amount}</span>
                    {paidAmt !== undefined && (
                      <span className="ml-2 text-blue-500 font-semibold">€ {Number(paidAmt).toFixed(2)} applied to this bill</span>
                    )}
                  </p>
                  {tx.rawBankDescription && (
                    <p className="text-[11px] text-gray-300 italic mt-0.5 truncate">{tx.rawBankDescription}</p>
                  )}
                </div>
                <button
                  onClick={() => doUnlink(tx.id)}
                  disabled={isProcessing}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200 rounded-xl hover:bg-red-50 disabled:opacity-50 transition"
                >
                  {isProcessing ? (
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={3} strokeOpacity={0.3} /><path strokeLinecap="round" strokeWidth={3} d="M12 2a10 10 0 0110 10" /></svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                  )}
                  Unlink
                </button>
              </div>
            );
          })}
        </div>

        <div className="px-5 pb-4 pt-3 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="w-full py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── BillFormModal ─────────────────────────────────────────────────────────────
function BillFormModal({ providers, editBill, onSave, onClose, modalYears }) {
  const initial = editBill ? {
    providerId: editBill.providerId || '',
    periodType: editBill.billingPeriod?.type || 'month',
    periodMonth: editBill.billingPeriod?.month ?? now.getMonth() + 1,
    periodYear: editBill.billingPeriod?.year ?? thisYear,
    dateFrom: editBill.billingPeriod?.dateFrom || '',
    dateTo: editBill.billingPeriod?.dateTo || '',
    specificDate: editBill.billingPeriod?.specificDate || '',
    amount: editBill.amount || '',
    lateFee: editBill.lateFee || 0,
    dueDate: editBill.dueDate || '',
    notes: editBill.notes || '',
  } : {
    providerId: '',
    periodType: 'month',
    periodMonth: now.getMonth() + 1,
    periodYear: thisYear,
    dateFrom: '', dateTo: '', specificDate: '',
    amount: '', lateFee: 0, dueDate: '', notes: '',
  };

  const [form, setForm] = useState(initial);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  function buildBillingPeriod() {
    if (form.periodType === 'month')
      return { type: 'month', month: Number(form.periodMonth), year: Number(form.periodYear) };
    if (form.periodType === 'dateRange')
      return { type: 'dateRange', dateFrom: form.dateFrom, dateTo: form.dateTo };
    return { type: 'specificDate', specificDate: form.specificDate };
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.providerId || !form.amount) return;
    onSave({
      providerId: form.providerId,
      amount: Number(form.amount),
      lateFee: Number(form.lateFee) || 0,
      billingPeriod: buildBillingPeriod(),
      dueDate: form.dueDate,
      notes: form.notes,
    });
  }

  const labelCls = 'block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5';
  const inputCls = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{editBill ? 'Edit Bill' : 'Create Bill'}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Link a billing period to a provider</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 rounded-lg p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Provider */}
          <div>
            <label className={labelCls}>Provider *</label>
            <select value={form.providerId} onChange={e => set('providerId', e.target.value)} required className={inputCls}>
              <option value="">— Select Provider —</option>
              {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Billing Period Type */}
          <div>
            <label className={labelCls}>Billing Period</label>
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1 mb-3">
              {[['month', 'Month'], ['dateRange', 'Date Range'], ['specificDate', 'Specific Date']].map(([v, l]) => (
                <button type="button" key={v} onClick={() => set('periodType', v)}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${form.periodType === v ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>
                  {l}
                </button>
              ))}
            </div>
            {form.periodType === 'month' && (
              <div className="grid grid-cols-2 gap-3">
                <select value={form.periodMonth} onChange={e => set('periodMonth', Number(e.target.value))} className={inputCls}>
                  {MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
                <select value={form.periodYear} onChange={e => set('periodYear', Number(e.target.value))} className={inputCls}>
                  {modalYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            )}
            {form.periodType === 'dateRange' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-gray-400 mb-1 block">From</label>
                  <input type="date" value={form.dateFrom} onChange={e => set('dateFrom', e.target.value)} required className={inputCls} />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 mb-1 block">To</label>
                  <input type="date" value={form.dateTo} onChange={e => set('dateTo', e.target.value)} required className={inputCls} />
                </div>
              </div>
            )}
            {form.periodType === 'specificDate' && (
              <input type="date" value={form.specificDate} onChange={e => set('specificDate', e.target.value)} required className={inputCls} />
            )}
          </div>

          {/* Amount + Late Fee */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Bill Amount *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">€</span>
                <input type="number" step="0.01" min="0" value={form.amount} onChange={e => set('amount', e.target.value)} required
                  placeholder="0.00" className={`${inputCls} pl-7`} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Late Fee</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">€</span>
                <input type="number" step="0.01" min="0" value={form.lateFee} onChange={e => set('lateFee', e.target.value)}
                  placeholder="0.00" className={`${inputCls} pl-7`} />
              </div>
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label className={labelCls}>Due Date <span className="font-normal text-gray-400 normal-case tracking-normal">(optional)</span></label>
            <input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} className={inputCls} />
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes <span className="font-normal text-gray-400 normal-case tracking-normal">(optional)</span></label>
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Any extra context…" className={`${inputCls} resize-none`} />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
            <button type="submit" className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition shadow-sm">
              {editBill ? 'Save Changes' : 'Create Bill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── RecurringBillModal ────────────────────────────────────────────────────────
function RecurringBillModal({ providers, bills, household, onSave, onClose, modalYears }) {
  const defaultFromYear = household?.trackingStartDate ? parseInt(household.trackingStartDate.split('-')[0], 10) : thisYear;
  const defaultFromMonth = household?.trackingStartDate ? parseInt(household.trackingStartDate.split('-')[1], 10) : now.getMonth() + 1;

  const [form, setForm] = useState({
    providerId: '',
    amount: '',
    fromMonth: defaultFromMonth,
    fromYear: defaultFromYear,
    toMonth: now.getMonth() + 1,
    toYear: thisYear,
    dueDayOfMonth: '',   // optional day of month for due date per bill
    notes: '',
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (form.providerId && bills) {
      const provBills = bills.filter(b => b.providerId === form.providerId);
      if (provBills.length > 0) {
        const sortedBills = [...provBills].sort((a, b) => {
          const pA = getBillPeriodMonthYear(a);
          const pB = getBillPeriodMonthYear(b);
          if (pB.year !== pA.year) return pB.year - pA.year;
          return pB.month - pA.month;
        });
        const latestBill = sortedBills[0];
        const pLatest = getBillPeriodMonthYear(latestBill);

        let nextMo = pLatest.month + 1;
        let nextYr = pLatest.year;
        if (nextMo > 12) {
          nextMo = 1;
          nextYr++;
        }

        setForm(f => {
          const updates = { fromMonth: nextMo, fromYear: nextYr };
          if (latestBill.dueDate) {
            updates.dueDayOfMonth = String(new Date(latestBill.dueDate).getDate());
          }
          if (latestBill.amount) {
            updates.amount = String(latestBill.amount);
          }
          return { ...f, ...updates };
        });
      } else {
        // Reset to default household tracking date if no bills exist for provider
        setForm(f => ({ ...f, fromMonth: defaultFromMonth, fromYear: defaultFromYear, amount: '', dueDayOfMonth: '' }));
      }
    }
  }, [form.providerId, bills, defaultFromMonth, defaultFromYear]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Build preview list
  const preview = useMemo(() => {
    if (!form.providerId || !form.amount) return [];
    const result = [];
    let yr = Number(form.fromYear);
    let mo = Number(form.fromMonth);
    const endYr = Number(form.toYear);
    const endMo = Number(form.toMonth);
    const maxIter = 60; // safety cap
    let i = 0;
    while ((yr < endYr || (yr === endYr && mo <= endMo)) && i < maxIter) {
      const dueDate = form.dueDayOfMonth
        ? `${yr}-${String(mo).padStart(2, '0')}-${String(form.dueDayOfMonth).padStart(2, '0')}`
        : '';
      result.push({
        monthLabel: `${MONTHS[mo - 1].l} ${yr}`,
        billingPeriod: { type: 'month', month: mo, year: yr },
        dueDate,
      });
      mo++;
      if (mo > 12) { mo = 1; yr++; }
      i++;
    }
    return result;
  }, [form.providerId, form.amount, form.fromMonth, form.fromYear, form.toMonth, form.toYear, form.dueDayOfMonth]);

  const isValid = form.providerId && form.amount && preview.length > 0;

  const labelCls = 'block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5';
  const inputCls = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 bg-purple-50 border-b border-purple-100 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Create Recurring Bills
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Generates one bill per month across a date range</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Left: Form */}
          <div className="p-6 space-y-5 md:w-80 md:border-r border-gray-100 overflow-y-auto shrink-0">
            {/* Provider */}
            <div>
              <label className={labelCls}>Provider *</label>
              <select value={form.providerId} onChange={e => set('providerId', e.target.value)} className={inputCls}>
                <option value="">— Select Provider —</option>
                {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Amount */}
            <div>
              <label className={labelCls}>Bill Amount *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">€</span>
                <input type="number" step="0.01" min="0" value={form.amount} onChange={e => set('amount', e.target.value)}
                  placeholder="0.00" className={`${inputCls} pl-7`} />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Same amount applied to every month</p>
            </div>

            {/* From */}
            <div>
              <label className={labelCls}>From</label>
              <div className="grid grid-cols-2 gap-2">
                <select value={form.fromMonth} onChange={e => set('fromMonth', Number(e.target.value))} className={inputCls}>
                  {MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
                <select value={form.fromYear} onChange={e => set('fromYear', Number(e.target.value))} className={inputCls}>
                  {modalYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {/* To */}
            <div>
              <label className={labelCls}>To</label>
              <div className="grid grid-cols-2 gap-2">
                <select value={form.toMonth} onChange={e => set('toMonth', Number(e.target.value))} className={inputCls}>
                  {MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
                <select value={form.toYear} onChange={e => set('toYear', Number(e.target.value))} className={inputCls}>
                  {modalYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {/* Due day */}
            <div>
              <label className={labelCls}>Due Day of Month <span className="font-normal text-gray-400 normal-case tracking-normal">(optional)</span></label>
              <input type="number" min="1" max="31" value={form.dueDayOfMonth} onChange={e => set('dueDayOfMonth', e.target.value)}
                placeholder="e.g. 15" className={inputCls} />
              <p className="text-[11px] text-gray-400 mt-1">Sets the due date for each generated bill</p>
            </div>

            {/* Notes */}
            <div>
              <label className={labelCls}>Notes <span className="font-normal text-gray-400 normal-case tracking-normal">(optional)</span></label>
              <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
                placeholder="e.g. Monthly rent 2026" className={`${inputCls} resize-none`} />
            </div>
          </div>

          {/* Right: Preview */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 shrink-0">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Preview — {preview.length} bill{preview.length !== 1 ? 's' : ''} will be created
              </p>
              {preview.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">Fill in the form to see a preview</p>
              )}
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
              {preview.map((item, i) => (
                <div key={i} className="px-5 py-3 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded bg-purple-100 text-purple-700 text-[10px] font-black flex items-center justify-center">
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{item.monthLabel}</p>
                      {item.dueDate && (
                        <p className="text-[11px] text-gray-400">Due: {new Date(item.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-black text-gray-700">€ {Number(form.amount || 0).toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center shrink-0 bg-white">
          <p className="text-xs text-gray-400">
            Total: <span className="font-black text-gray-700">€ {(Number(form.amount || 0) * preview.length).toFixed(2)}</span> across {preview.length} bills
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
            <button
              disabled={!isValid || creating}
              onClick={() => onSave({ form, preview, setCreating })}
              className="px-6 py-2.5 text-sm font-bold text-white bg-purple-600 rounded-xl hover:bg-purple-700 disabled:opacity-40 transition shadow-sm flex items-center gap-2"
            >
              {creating && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {creating ? 'Creating…' : `Create ${preview.length} Bill${preview.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Bills() {
  const { userProfile } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState([]);
  const [providers, setProviders] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [household, setHousehold] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [editBill, setEditBill] = useState(null);
  const [linkedTxsModal, setLinkedTxsModal] = useState(null); // bill.id (string) — resolved live at render
  const [yearFilter, setYearFilter] = useState(String(thisYear));
  const [provFilter, setProvFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    if (userProfile?.householdId) fetchData();
  }, [userProfile?.householdId]);

  async function fetchData() {
    try {
      setLoading(true);
      const [b, p, t, h] = await Promise.all([
        getBills(userProfile.householdId),
        getProviders(userProfile.householdId),
        getTransactions(userProfile.householdId),
        getHousehold(userProfile.householdId)
      ]);
      setBills(b || []);
      setProviders(p || []);
      setTransactions(t || []);
      setHousehold(h || null);
      return b; // return fresh data so callers don't read stale state
    } catch {
      addToast('Failed to load bills.', 'error');
    } finally {
      setLoading(false);
    }
  }

  const modalYears = useMemo(() => {
    let startYear = thisYear - 1;
    if (household?.trackingStartDate) {
      const parts = household.trackingStartDate.split('-');
      if (parts.length > 0) startYear = parseInt(parts[0], 10);
    }
    const yrs = [];
    for (let y = startYear; y <= thisYear + 1; y++) yrs.push(y);
    return yrs;
  }, [household]);

  // Derive available years from household start date and bills
  const availableYears = useMemo(() => {
    let startYear = thisYear;
    if (household?.trackingStartDate) {
      const parts = household.trackingStartDate.split('-');
      if (parts.length > 0) startYear = parseInt(parts[0], 10);
    }
    const billYears = bills.map(b => getBillPeriodMonthYear(b).year).filter(Boolean);
    const maxYear = Math.max(thisYear, ...billYears);
    const minYear = Math.min(startYear, ...billYears, thisYear);

    const yrs = ['all', 'this_month'];
    for (let y = maxYear; y >= minYear; y--) {
      yrs.push(y);
    }
    return yrs;
  }, [household, bills]);

  // Filtered bills
  const filteredBills = useMemo(() => {
    return bills.filter(b => {
      const { month, year } = getBillPeriodMonthYear(b);
      if (yearFilter === 'this_month') {
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        if (year !== currentYear || month !== currentMonth) return false;
      } else if (yearFilter !== 'all' && year !== Number(yearFilter)) {
        return false;
      }

      if (provFilter && b.providerId !== provFilter) return false;
      if (statusFilter && b.status !== statusFilter) return false;
      return true;
    }).sort((a, b) => {
      // Sort by period descending
      const { year: ay, month: am } = getBillPeriodMonthYear(a);
      const { year: by, month: bm } = getBillPeriodMonthYear(b);
      return (by * 12 + bm) - (ay * 12 + am);
    });
  }, [bills, yearFilter, provFilter, statusFilter]);

  // Summary totals for filtered set
  const totalAmount = filteredBills.reduce((s, b) => s + (b.amount || 0), 0);
  const totalLateFee = filteredBills.reduce((s, b) => s + (b.lateFee || 0), 0);
  const totalPaid = filteredBills.reduce((s, b) => s + (b.totalPaid || 0), 0);
  const totalGap = (totalAmount + totalLateFee) - totalPaid;

  async function handleSave(billData) {
    try {
      if (editBill) {
        await updateBill(userProfile.householdId, editBill.id, billData);
        addToast('Bill updated!');
      } else {
        await addBill(userProfile.householdId, billData);
        addToast('Bill created!');
      }
      setShowModal(false);
      setEditBill(null);
      fetchData();
    } catch {
      addToast('Failed to save bill.', 'error');
    }
  }

  async function handleRecurringSave({ form, preview, setCreating }) {
    setCreating(true);
    try {
      // Sequential creates to avoid Firestore rate limits
      for (const item of preview) {
        await addBill(userProfile.householdId, {
          providerId: form.providerId,
          amount: Number(form.amount),
          lateFee: 0,
          billingPeriod: item.billingPeriod,
          dueDate: item.dueDate,
          notes: form.notes,
        });
      }
      addToast(`${preview.length} recurring bills created!`, 'success');
      setShowRecurring(false);
      fetchData();
    } catch {
      addToast('Failed to create some bills.', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(bill) {
    const linkedTxs = getLinkedTxs(bill);
    if (linkedTxs.length > 0) {
      setLinkedTxsModal(bill.id);
      return;
    }
    if (!window.confirm(`Delete bill for "${getProviderName(bill.providerId)}" — ${getBillPeriodLabel(bill)}?`)) return;
    try {
      await deleteBill(userProfile.householdId, bill.id);
      addToast('Bill deleted.');
      fetchData();
    } catch {
      addToast('Failed to delete bill.', 'error');
    }
  }

  async function handleUnlinkTxFromBill(billId, txId) {
    try {
      await unlinkTransactionFromBill(userProfile.householdId, billId, txId);
      addToast('Transaction unlinked from bill.');
      // fetchData returns fresh bills — check them directly (React state is async)
      const freshBills = await fetchData();
      if (freshBills) {
        const refreshedBill = freshBills.find(b => b.id === billId);
        if (!refreshedBill || (refreshedBill.transactionIds || []).length === 0) {
          setLinkedTxsModal(null);
        }
      }
    } catch {
      addToast('Error unlinking transaction.', 'error');
    }
  }

  function getProviderName(pid) {
    return providers.find(p => p.id === pid)?.name || '—';
  }

  function getLinkedTxs(bill) {
    const ids = bill.transactionIds || [];
    return transactions.filter(t => ids.includes(t.id));
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-400">
        <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin mb-4" />
        <p className="font-semibold text-gray-500">Loading bills…</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Bills</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manually manage billing records and link transactions</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setEditBill(null); setShowModal(true); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            Add Bill
          </button>
          <button
            onClick={() => setShowRecurring(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-sm font-bold hover:bg-purple-200 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Add Recurring Bills
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Year filter dropdown */}
        <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
          className={SELECT_CLASS} style={{ backgroundImage: SELECT_BG }}>
          {availableYears.map(yr => (
            <option key={yr} value={yr}>
              {yr === 'all' ? 'All Years' : yr === 'this_month' ? 'This Month' : yr}
            </option>
          ))}
        </select>

        {/* Provider filter */}
        <select value={provFilter} onChange={e => setProvFilter(e.target.value)}
          className={SELECT_CLASS} style={{ backgroundImage: SELECT_BG }}>
          <option value="">All Providers</option>
          {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {/* Status filter */}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className={SELECT_CLASS} style={{ backgroundImage: SELECT_BG }}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="partial">Partial</option>
          <option value="cleared">Cleared</option>
          <option value="overdue">Overdue</option>
        </select>

        <span className="text-sm text-gray-400 ml-auto">{filteredBills.length} bill{filteredBills.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Summary Strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { l: 'Total Bills', v: fmt(totalAmount), c: 'text-gray-800' },
          { l: 'Total Late Fees', v: fmt(totalLateFee), c: 'text-amber-600' },
          { l: 'Total Amount', v: fmt(totalAmount + totalLateFee), c: 'text-gray-900' },
          { l: 'Total Paid', v: fmt(totalPaid), c: 'text-green-700' },
          { l: 'Total Outstanding', v: fmt(Math.max(0, totalGap)), c: totalGap > 0 ? 'text-red-600' : 'text-green-600' },
        ].map(s => (
          <div key={s.l} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">{s.l}</p>
            <p className={`text-[20px] font-black ${s.c}`}>{s.v}</p>
          </div>
        ))}
      </div>

      {/* ── Bills Table ── */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {filteredBills.length === 0 ? (
          <div className="py-20 text-center">
            <svg className="w-14 h-14 mx-auto text-gray-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6M5 21h14a2 2 0 002-2V7l-5-5H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <p className="font-bold text-gray-500 text-lg">No bills found</p>
            <p className="text-gray-400 text-sm mt-1">
              {bills.length === 0 ? 'Click "Add Bill" to create your first bill.' : 'Try changing the filters.'}
            </p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="hidden md:grid px-6 py-3 gap-4 border-b border-gray-100 bg-gray-50/60"
              style={{ gridTemplateColumns: '2fr 1.8fr 1.3fr 1.3fr 1fr 100px' }}>
              {['Provider', 'Period', 'Bill Amount', 'Paid', 'Status', 'Actions'].map(h => (
                <div key={h} className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{h}</div>
              ))}
            </div>

            <div className="divide-y divide-gray-50">
              {filteredBills.map(bill => {
                const prov = providers.find(p => p.id === bill.providerId);
                const s = STATUS_STYLE[bill.status] || STATUS_STYLE.pending;
                const gap = ((bill.amount || 0) + (bill.lateFee || 0)) - (bill.totalPaid || 0);
                const linkedTxs = getLinkedTxs(bill);

                return (
                  <div key={bill.id} className="hover:bg-gray-50/40 transition-colors">
                    {/* Desktop grid row */}
                    <div className="hidden md:grid items-center gap-4 px-6 py-4 min-h-[84px]"
                      style={{ gridTemplateColumns: '2fr 1.8fr 1.3fr 1.3fr 1fr 100px' }}>
                      {/* Provider */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-black text-sm shrink-0">
                          {prov?.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-800 text-sm truncate">{prov?.name || '—'}</p>
                          <p className="text-[10px] text-gray-400 truncate">
                            <span className="capitalize">{prov?.category || 'Uncategorized'}</span>
                            {bill.notes && <span className="text-gray-300 mx-1.5 font-normal">|</span>}
                            {bill.notes && <span className="normal-case">{bill.notes}</span>}
                          </p>
                        </div>
                      </div>

                      {/* Period */}
                      <div>
                        <p className="text-sm font-semibold text-gray-700">{getBillPeriodLabel(bill)}</p>
                        {bill.dueDate && (
                          <p className="text-[10px] text-gray-400">Due {new Date(bill.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</p>
                        )}
                      </div>

                      {/* Bill Amount — total due with late fee breakdown */}
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{fmt((bill.amount || 0) + (bill.lateFee || 0))}</p>
                        {(bill.lateFee || 0) > 0 && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {fmt(bill.lateFee)} late fees included
                          </p>
                        )}
                      </div>

                      {/* Paid — with Pending sub-line when partial */}
                      <div>
                        <p className={`text-sm font-black ${(bill.totalPaid || 0) > 0 ? 'text-green-600' : 'text-gray-400'
                          }`}>{fmt(bill.totalPaid)}</p>
                        {gap > 0 && (bill.totalPaid || 0) > 0 && (
                          <p className="text-[10px] font-semibold text-red-500 mt-0.5">{fmt(gap)} outstanding</p>
                        )}
                      </div>

                      {/* Status */}
                      <div>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${s.bg} ${s.text}`}>
                          {s.label}
                        </span>
                        {linkedTxs.length > 0 && (
                          <button
                            onClick={() => setLinkedTxsModal(bill.id)}
                            className="mt-1 flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline transition"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.1-1.1m-.758-4.9a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                            {linkedTxs.length} tx linked
                          </button>
                        )}
                      </div>

                      {/* Actions — blocked when transactions are linked */}
                      <div className="flex items-center gap-2">
                        {linkedTxs.length > 0 ? (
                          <>
                            <button
                              title="Unlink transactions before editing"
                              onClick={() => setLinkedTxsModal(bill.id)}
                              className="p-1.5 rounded-lg text-gray-200 cursor-not-allowed"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button
                              title="Unlink transactions before deleting"
                              onClick={() => setLinkedTxsModal(bill.id)}
                              className="p-1.5 rounded-lg text-gray-200 cursor-not-allowed"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditBill(bill); setShowModal(true); }}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button onClick={() => handleDelete(bill)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Mobile card */}
                    <div className="md:hidden flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-black text-sm">
                            {prov?.name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0 pr-2">
                            <p className="font-bold text-gray-800 truncate">{prov?.name || '—'}</p>
                            <p className="text-[10px] text-gray-400 truncate mb-0.5">
                              <span className="capitalize">{prov?.category || 'Uncategorized'}</span>
                              {bill.notes && <span className="text-gray-300 mx-1.5 font-normal">|</span>}
                              {bill.notes && <span className="normal-case">{bill.notes}</span>}
                            </p>
                            <p className="text-[11px] text-gray-400 font-medium">{getBillPeriodLabel(bill)}</p>
                          </div>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${s.bg} ${s.text}`}>{s.label}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-gray-50 rounded-lg p-2">
                          <p className="text-gray-400">Billed</p>
                          <p className="font-black text-gray-800">{fmt(bill.amount)}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2">
                          <p className="text-gray-400">Paid</p>
                          <p className="font-black text-green-600">{fmt(bill.totalPaid)}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2">
                          <p className="text-gray-400">Gap</p>
                          <p className={`font-black ${gap > 0 ? 'text-red-500' : 'text-green-600'}`}>{gap > 0 ? fmt(gap) : '—'}</p>
                        </div>
                      </div>
                      {/* Mobile action buttons — also blocked when linked */}
                      <div className="flex gap-2 justify-end">
                        {linkedTxs.length > 0 ? (
                          <button
                            onClick={() => setLinkedTxsModal(bill.id)}
                            className="px-3 py-1.5 text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50"
                          >
                            {linkedTxs.length} tx linked
                          </button>
                        ) : (
                          <>
                            <button onClick={() => { setEditBill(bill); setShowModal(true); }} className="px-3 py-1.5 text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">Edit</button>
                            <button onClick={() => handleDelete(bill)} className="px-3 py-1.5 text-xs font-semibold text-red-500 border border-red-200 rounded-lg hover:bg-red-50">Delete</button>
                          </>
                        )}
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>

            {/* Footer totals */}
            <div className="hidden md:grid px-6 py-4 gap-4 bg-gray-50/80 border-t border-gray-200"
              style={{ gridTemplateColumns: '2fr 1.8fr 1.3fr 1.3fr 1fr 100px' }}>
              <div className="text-xs text-gray-400 uppercase tracking-wider flex items-center">Totals ({filteredBills.length})</div>
              <div />
              <div>
                <p className="text-sm font-semibold text-gray-900">{fmt(totalAmount + totalLateFee)}</p>
                {totalLateFee > 0 && (
                  <p className="text-[10px] text-gray-400">{fmt(totalLateFee)} late fees included</p>
                )}
              </div>
              <div>
                <p className="text-sm font-black text-green-700">{fmt(totalPaid)}</p>
                {totalGap > 0 && totalPaid > 0 && (
                  <p className="text-[10px] font-semibold text-red-500">{fmt(totalGap)} outstanding</p>
                )}
              </div>
              <div /><div />
            </div>
          </>
        )}
      </div>

      {linkedTxsModal && (() => {
        // Always resolve live bill from current bills array — not stale state
        const liveBill = bills.find(b => b.id === linkedTxsModal);
        if (!liveBill) return null;
        const liveTxs = getLinkedTxs(liveBill);
        return (
          <LinkedTxsModal
            bill={liveBill}
            linkedTxs={liveTxs}
            billAmountLabel={`${getProviderName(liveBill.providerId)} — ${getBillPeriodLabel(liveBill)} — ${fmt(liveBill.amount)}`}
            onUnlink={(txId) => handleUnlinkTxFromBill(liveBill.id, txId)}
            onClose={() => setLinkedTxsModal(null)}
          />
        );
      })()}
      {showModal && (
        <BillFormModal
          providers={providers}
          editBill={editBill}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditBill(null); }}
          modalYears={modalYears}
        />
      )}
      {showRecurring && (
        <RecurringBillModal
          providers={providers}
          bills={bills}
          household={household}
          onSave={handleRecurringSave}
          onClose={() => setShowRecurring(false)}
          modalYears={modalYears}
        />
      )}
    </div>
  );
}
