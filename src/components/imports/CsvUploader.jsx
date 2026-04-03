import React from 'react';
import Papa from 'papaparse';

export function CsvUploader({ onUpload, lastUploadDate }) {
  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFile = (file) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        onUpload(results.data, results.meta.fields);
      }
    });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 md:p-12 flex flex-col items-center text-center max-w-4xl mx-auto">
      <div className="w-20 h-20 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-6">
        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
      </div>

      <h2 className="text-2xl font-bold text-gray-900 mb-3">Import Bank Statement</h2>

      <p className="text-gray-500 text-base max-w-lg mb-8 leading-relaxed">
        Export your transactions from any bank as a CSV file and upload it here.
      </p>

      <div className="flex space-x-4 mb-12">
        <button onClick={() => document.getElementById('csvInput').click()} className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-8 rounded-lg transition shadow-sm flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          Select CSV File
        </button>
        <input
          id="csvInput"
          type="file"
          accept=".csv"
          className="hidden"
          onChange={e => e.target.files[0] && handleFile(e.target.files[0])}
        />
      </div>

      {lastUploadDate && (
        <div className="mb-10 bg-blue-50 border border-blue-100 rounded-lg p-4 w-full text-sm text-blue-800 text-left flex items-start space-x-3">
          <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <div>
            <strong className="block mb-1">Previous Import Detected</strong>
            The most recent transaction you imported was on <b>{lastUploadDate}</b>. We recommend your new CSV export begins one day after this date.
          </div>
        </div>
      )}

      <div className="bg-gray-50/80 rounded-xl p-6 md:p-8 w-full text-left">
        <h4 className="font-bold text-gray-800 mb-4 text-[15px]">Expected CSV Format:</h4>
        <ul className="text-[15px] text-gray-600 space-y-2.5">
          <li className="flex"><span className="text-gray-400 mr-2">•</span> Must contain columns with headers like "Date", "Amount" (or "Bedrag"), and "Name"/"Description".</li>
          <li className="flex"><span className="text-gray-400 mr-2">•</span> Date format is automatically detected.</li>
        </ul>
      </div>
    </div>
  );
}
