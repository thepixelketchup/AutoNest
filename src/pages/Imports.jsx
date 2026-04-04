import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getTransactions, saveBulkTransactions } from '../services/billService';
import { CsvUploader } from '../components/imports/CsvUploader';
import { ColumnMapper } from '../components/imports/ColumnMapper';
import { useToast } from '../hooks/useToast';

function parseAmount(str) {
  if (!str) return 0;
  let s = str.toString().trim().replace(/[^0-9.,-]/g, '');
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > ld) s = s.replace(/\./g, '').replace(/,/g, '.');
  else if (ld > lc) s = s.replace(/,/g, '');
  return parseFloat(s) || 0;
}

export default function Imports() {
  const { userProfile } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: Upload, 2: Mapping, 3: Match Engine
  const [rawCsvData, setRawCsvData] = useState([]);
  const [csvFields, setCsvFields] = useState([]);
  const [mappedData, setMappedData] = useState([]);

  const [lastUploadDate, setLastUploadDate] = useState('');
  const [allExistingTxs, setAllExistingTxs] = useState([]);

  useEffect(() => {
    if (step === 1 && userProfile?.householdId) {
      getTransactions(userProfile.householdId).then(txs => {
        const csvTxs = txs.filter(t => t.source === 'csv' && (t.dateStr || t.date));
        if (csvTxs.length > 0) {
          csvTxs.sort((a, b) => new Date(b.dateStr || b.date) - new Date(a.dateStr || a.date));
          setLastUploadDate(csvTxs[0].dateStr || csvTxs[0].date);
        }
        setAllExistingTxs(txs);
      });
    }
  }, [step, userProfile?.householdId]);


  const handleUpload = (data, fields) => {
    setRawCsvData(data);
    setCsvFields(fields);
    setStep(2);
  };

  const handleMapped = (normalizedData) => {
    // Filter duplicates based on existing DB transactions
    let duplicates = 0;
    const uniqueData = normalizedData.filter(newTx => {
      // Using the user's exact constraint of duplicated date, name, and amount
      const isDuplicate = allExistingTxs.some(ex => 
        (ex.date === newTx.date || ex.dateStr === newTx.date) && 
        ex.name === newTx.name && 
        ex.amount === newTx.amount
      );
      if (isDuplicate) duplicates++;
      return !isDuplicate;
    });

    if (duplicates > 0) {
      addToast(`Skipped ${duplicates} identical duplicate transactions globally.`, 'success');
    }

    if (uniqueData.length === 0 && normalizedData.length > 0) {
      addToast("All imported transactions already exist. Import cancelled.", "error");
      setStep(1);
      return;
    }

    setMappedData(uniqueData);
    setStep(3);
  };

  const handleComplete = async (rawMappings) => {
    try {
      if (rawMappings && rawMappings.length > 0) {
        const finalTransactions = rawMappings.map(tx => ({
          ...tx,
          dateStr: tx.date || tx.dateStr,
          id: tx.id || crypto.randomUUID(),
          status: 'unmatched',
          billId: null,
          billIds: [],
          memberId: null,
          source: 'csv'
        }));
        await saveBulkTransactions(userProfile.householdId, finalTransactions);
      }
      setStep(1);
      setRawCsvData([]);
      setMappedData([]);
      addToast(`Successfully imported ${rawMappings?.length || 0} transactions!`, 'success');
      navigate('/transactions');
    } catch (e) {
      addToast("Failed to save imported transactions.", "error");
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      <header className="mb-8 mt-2">
        <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">Import Statement</h1>
        <p className="text-gray-500 text-[15px] mt-1.5">Upload CSV exports from Bunq to match against your expenses.</p>
      </header>

      {/* Stepper UI Progress Bar */}
      <div className="flex items-center justify-between relative max-w-lg mx-auto mb-10">
        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-full h-1 bg-gray-200 -z-10"></div>
        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 h-1 bg-blue-600 transition-all duration-300 -z-10" style={{ width: step === 1 ? '0%' : step === 2 ? '50%' : '100%' }}></div>

        <div className={`flex flex-col items-center ${step >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
          <div className={`flex items-center justify-center w-10 h-10 rounded-full font-bold border-2 bg-white ${step >= 1 ? 'border-blue-600' : 'border-gray-300'}`}>1</div>
          <span className="text-xs font-semibold mt-2 absolute -bottom-6">Upload</span>
        </div>
        <div className={`flex flex-col items-center ${step >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
          <div className={`flex items-center justify-center w-10 h-10 rounded-full font-bold border-2 bg-white ${step >= 2 ? 'border-blue-600' : 'border-gray-300'}`}>2</div>
          <span className="text-xs font-semibold mt-2 absolute -bottom-6">Map Columns</span>
        </div>
        <div className={`flex flex-col items-center ${step >= 3 ? 'text-blue-600' : 'text-gray-400'}`}>
          <div className={`flex items-center justify-center w-10 h-10 rounded-full font-bold border-2 bg-white ${step >= 3 ? 'border-blue-600' : 'border-gray-300'}`}>3</div>
          <span className="text-xs font-semibold mt-2 absolute -bottom-6">Review</span>
        </div>
      </div>

      <div className="mt-8">
        {step === 1 && <CsvUploader onUpload={handleUpload} lastUploadDate={lastUploadDate} />}
        {step === 2 && <ColumnMapper data={rawCsvData} fields={csvFields} onMapped={handleMapped} />}
        {step === 3 && (
          <div className="bg-white rounded-2xl shadow p-6 flex flex-col">
            <div className="mb-6">
              <h2 className="text-xl font-black text-gray-900">Review Transactions</h2>
              <p className="text-sm font-medium text-gray-500 mt-1">{mappedData.length} records parsed successfully.</p>
            </div>
            
            <div className="overflow-y-auto max-h-[500px] border border-gray-100 rounded-xl mb-6">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-5 py-3 text-[11px] font-bold text-gray-500 uppercase">Date</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-gray-500 uppercase">Description</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-gray-500 uppercase text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {mappedData.map((tx, idx) => {
                    const amt = parseAmount(tx.amount);
                    return (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 text-sm text-gray-500 whitespace-nowrap">{tx.dateStr || tx.date}</td>
                        <td className="px-5 py-3 text-sm font-semibold text-gray-800 break-all">{tx.name}</td>
                        <td className={`px-5 py-3 text-sm font-black text-right whitespace-nowrap ${amt < 0 ? 'text-red-500' : 'text-green-600'}`}>
                           {amt < 0 ? '− ' : ''}€{Math.abs(amt).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100">
              <button 
                onClick={() => handleComplete(mappedData)} 
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 transition"
              >
                Confirm & Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
