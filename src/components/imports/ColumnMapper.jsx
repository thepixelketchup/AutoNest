import React, { useState } from 'react';
import { Button } from '../ui/Button';

export function ColumnMapper({ data, fields, onMapped }) {
  const getPrioritizedMatch = (keywords) => {
    for (const kw of keywords) {
      const match = fields.find(f => f.toLowerCase().trim() === kw);
      if (match) return match;
    }
    return null;
  };

  const getPrioritizedApprox = (keywords) => {
    for (const kw of keywords) {
      const match = fields.find(f => f.toLowerCase().includes(kw));
      if (match) return match;
    }
    return null;
  };

  const dateKeywords = ['date', 'datum'];
  const nameKeywords = ['name', 'naam', 'counterparty', 'payee'];
  const amountKeywords = ['amount', 'bedrag'];
  const descKeywords = ['description', 'desc', 'memo', 'omschrijving'];

  const dateGuess = getPrioritizedMatch(dateKeywords) || getPrioritizedApprox(dateKeywords) || fields[0] || '';
  const nameGuess = getPrioritizedMatch(nameKeywords) || getPrioritizedApprox(nameKeywords) || fields[1] || '';
  const amountGuess = getPrioritizedMatch(amountKeywords) || getPrioritizedApprox(amountKeywords) || fields[2] || '';
  const descGuess = getPrioritizedMatch(descKeywords) || getPrioritizedApprox(descKeywords) || '';

  const [dateCol, setDateCol] = useState(dateGuess);
  const [nameCol, setNameCol] = useState(nameGuess);
  const [amountCol, setAmountCol] = useState(amountGuess);
  const [descCol, setDescCol] = useState(descGuess);

  const handleApply = () => {
    const mapped = data.map(row => ({
      date: row[dateCol],
      name: row[nameCol],
      amount: row[amountCol],
      rawBankDescription: descCol ? row[descCol] : '',
      rawJson: JSON.stringify(row)
    })).filter(tx => tx.name && tx.amount); // skip empty rows
    onMapped(mapped);
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
      <h3 className="text-lg font-semibold mb-4 text-gray-800 border-b pb-2">Map CSV Columns</h3>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Date Column</label>
          <select value={dateCol} onChange={e=>setDateCol(e.target.value)} className="w-full p-2 border rounded bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all">
            {fields.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Name Column</label>
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
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Description / Memo (Optional)</label>
          <select value={descCol} onChange={e=>setDescCol(e.target.value)} className="w-full p-2 border rounded bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all">
            <option value="">-- Skip/None --</option>
            {fields.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>

      <div className="mb-6 overflow-x-auto border border-gray-100 rounded-lg">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest bg-gray-50 px-4 py-2 border-b">Preview (First 3 rows)</p>
        <table className="min-w-full text-sm text-left">
          <thead className="bg-gray-100/50">
            <tr>
              <th className="px-4 py-3 font-semibold text-gray-700 border-b">Date</th>
              <th className="px-4 py-3 font-semibold text-gray-700 border-b">Name</th>
              <th className="px-4 py-3 font-semibold text-gray-700 border-b">Amount</th>
              <th className="px-4 py-3 font-semibold text-gray-700 border-b">Description</th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 3).map((row, i) => (
              <tr key={i} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 border-b text-gray-600">{row[dateCol]}</td>
                <td className="px-4 py-3 border-b text-gray-800 font-medium">{row[nameCol]}</td>
                <td className="px-4 py-3 border-b text-gray-600">{row[amountCol]}</td>
                <td className="px-4 py-3 border-b text-gray-500 italic max-w-[200px] truncate">{descCol ? row[descCol] : '-'}</td>
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
