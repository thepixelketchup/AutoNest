import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getProviders, getMembers, getGeneratedBills, getTransactions, saveBulkTransactions, generateDueBills } from '../services/billService';
import { CsvUploader } from '../components/imports/CsvUploader';
import { ColumnMapper } from '../components/imports/ColumnMapper';
import { MatchingEngine } from '../components/imports/MatchingEngine';
import { useToast } from '../hooks/useToast';

export default function Imports() {
  const { userProfile } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: Upload, 2: Mapping, 3: Match Engine
  const [loadingBills, setLoadingBills] = useState(false);

  const [rawCsvData, setRawCsvData] = useState([]);
  const [csvFields, setCsvFields] = useState([]);
  const [allProviders, setAllProviders] = useState([]);
  const [allMembers, setAllMembers] = useState([]);
  const [unpaidBills, setUnpaidBills] = useState([]);
  const [allBills, setAllBills] = useState([]);

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

  useEffect(() => {
    if (step === 3 && userProfile?.householdId) {
      fetchBills();
    }
  }, [step, userProfile?.householdId]);

  async function fetchBills() {
    try {
      setLoadingBills(true);
      await generateDueBills(userProfile.householdId);
      const providers = await getProviders(userProfile.householdId);
      const members = await getMembers(userProfile.householdId);
      const generatedBills = await getGeneratedBills(userProfile.householdId);
      const allTxs = await getTransactions(userProfile.householdId);

      const unpaid = generatedBills.filter(bill => {
        const matchingTxs = allTxs.filter(t => t.billId === bill.id && t.status === 'cleared');
        const sumPaid = matchingTxs.reduce((acc, t) => acc + (t.actualAmount || 0), 0);
        return sumPaid < bill.expectedAmount * 0.95; // Account for tolerance logic
      });

      // Sort unpaid chronologically (oldest debts first)
      unpaid.sort((a, b) => {
         if (a.year !== b.year) return a.year - b.year;
         return a.month - b.month;
      });

      setAllProviders(providers);
      setAllMembers(members);
      setAllBills(generatedBills);
      setUnpaidBills(unpaid);
    } catch (e) {
      addToast("Failed to fetch pending bills.", "error");
    } finally {
      setLoadingBills(false);
    }
  }

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

  const handleComplete = async (finalTransactions) => {
    try {
      if (finalTransactions && finalTransactions.length > 0) {
        await saveBulkTransactions(userProfile.householdId, finalTransactions);
      }
      setStep(1);
      setRawCsvData([]);
      setMappedData([]);
      addToast(`Successfully imported ${finalTransactions?.length || 0} transactions!`, 'success');
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
          <span className="text-xs font-semibold mt-2 absolute -bottom-6">Match</span>
        </div>
      </div>

      <div className="mt-8">
        {step === 1 && <CsvUploader onUpload={handleUpload} lastUploadDate={lastUploadDate} />}
        {step === 2 && <ColumnMapper data={rawCsvData} fields={csvFields} onMapped={handleMapped} />}
        {step === 3 && (
          loadingBills ? (
            <div className="flex justify-center items-center h-64 text-blue-600 animate-pulse font-medium">Running Smart Match Engine...</div>
          ) : (
            <MatchingEngine 
            importedData={mappedData} 
            providers={allProviders}
            members={allMembers}
            unpaidBills={unpaidBills} 
            onComplete={handleComplete} 
          />)
        )}
      </div>
    </div>
  );
}
