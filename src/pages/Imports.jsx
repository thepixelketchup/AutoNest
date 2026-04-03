import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getBills, getTransactions } from '../services/billService';
import { CsvUploader } from '../components/imports/CsvUploader';
import { ColumnMapper } from '../components/imports/ColumnMapper';
import { MatchingEngine } from '../components/imports/MatchingEngine';

export default function Imports() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: Upload, 2: Mapping, 3: Match Engine
  
  const [rawCsvData, setRawCsvData] = useState([]);
  const [csvFields, setCsvFields] = useState([]);
  const [mappedData, setMappedData] = useState([]);
  
  const [pendingBills, setPendingBills] = useState([]);
  const [allBills, setAllBills] = useState([]);

  useEffect(() => {
    if (step === 3 && userProfile?.householdId) {
      fetchBills();
    }
  }, [step, userProfile?.householdId]);

  async function fetchBills() {
    const targetMonth = new Date().getMonth() + 1;
    const targetYear = new Date().getFullYear();
    const fetchedBills = await getBills(userProfile.householdId);
    const fetchedTxs = await getTransactions(userProfile.householdId, targetMonth, targetYear);
    
    // Find bills that haven't been cleared for this month
    const pending = fetchedBills.filter(bill => {
      const tx = fetchedTxs.find(t => t.billId === bill.id);
      return !tx || tx.status !== 'cleared';
    });
    
    setAllBills(fetchedBills);
    setPendingBills(pending);
  }

  const handleUpload = (data, fields) => {
    setRawCsvData(data);
    setCsvFields(fields);
    setStep(2);
  };

  const handleMapped = (normalizedData) => {
    setMappedData(normalizedData);
    setStep(3);
  };

  const handleComplete = () => {
    setStep(1);
    setRawCsvData([]);
    setMappedData([]);
    navigate('/');
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      <header className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Bank Statement Import</h1>
        <p className="text-gray-500 text-sm mt-1">Upload your bank's CSV export to automatically match flushed bills.</p>
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
        {step === 1 && <CsvUploader onUpload={handleUpload} />}
        {step === 2 && <ColumnMapper data={rawCsvData} fields={csvFields} onMapped={handleMapped} />}
        {step === 3 && <MatchingEngine importedData={mappedData} bills={allBills} pendingBills={pendingBills} onComplete={handleComplete} />}
      </div>
    </div>
  );
}
