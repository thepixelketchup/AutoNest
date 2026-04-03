import React, { useState } from 'react';
import { Button } from '../ui/Button';

export function ColumnMapper({ data, fields, onMapped }) {
  const [dateCol, setDateCol] = useState(fields[0] || '');
  const [nameCol, setNameCol] = useState(fields[1] || '');
  const [amountCol, setAmountCol] = useState(fields[2] || '');

  const handleApply = () => {
    const mapped = data.map(row => ({
      date: row[dateCol],
      name: row[nameCol],
      amount: row[amountCol],
      rawBankDescription: JSON.stringify(row)
    })).filter(tx => tx.name && tx.amount); // skip empty rows
    onMapped(mapped);
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
      <h3 className="text-lg font-semibold mb-4 text-gray-800 border-b pb-2">Map CSV Columns</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Date Column</label>
          <select value={dateCol} onChange={e=>setDateCol(e.target.value)} className="w-full p-2 border rounded bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all">
            {fields.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Name/Counterparty Column</label>
          <select value={nameCol} onChange={e=>setNameCol(e.target.value)} className="w-full p-2 border rounded bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all">
            {fields.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Amount Column</label>
          <select value={amountCol} onChange={e=>setAmountCol(e.target.value)} className="w-full p-2 border rounded bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all">
            {fields.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>

      <div className="mb-6 overflow-x-auto border border-gray-100 rounded-lg">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest bg-gray-50 px-4 py-2 border-b">Preview (First 3 rows)</p>
        <table className="min-w-full text-sm text-left">
          <thead className="bg-gray-100/50">
            <tr>
              <th className="px-4 py-3 font-semibold text-gray-700 border-b">Parsed Date</th>
              <th className="px-4 py-3 font-semibold text-gray-700 border-b">Parsed Name</th>
              <th className="px-4 py-3 font-semibold text-gray-700 border-b">Parsed Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 3).map((row, i) => (
              <tr key={i} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 border-b text-gray-600">{row[dateCol]}</td>
                <td className="px-4 py-3 border-b text-gray-800 font-medium">{row[nameCol]}</td>
                <td className="px-4 py-3 border-b text-gray-600">{row[amountCol]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
         <Button onClick={handleApply} className="shadow-sm">Confirm Mapping & Proceed</Button>
      </div>
    </div>
  );
}
