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
    <div 
      onDrop={handleDrop} 
      onDragOver={e => e.preventDefault()}
      className="border-2 border-dashed border-gray-300 rounded-xl p-16 text-center hover:bg-gray-50 transition-colors cursor-pointer bg-white"
      onClick={() => document.getElementById('csvInput').click()}
    >
      <input 
        id="csvInput" 
        type="file" 
        accept=".csv" 
        className="hidden" 
        onChange={e => e.target.files[0] && handleFile(e.target.files[0])} 
      />
      <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
         <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
      </div>
      <h3 className="text-xl font-semibold text-gray-800">Upload Bank CSV</h3>
      <p className="text-gray-500 mt-2 max-w-xs mx-auto">Drag and drop your statement file here, or click to browse files.</p>

      {lastUploadDate && (
        <div className="mt-6 bg-blue-50 border border-blue-100 rounded-lg p-3 max-w-sm mx-auto text-sm text-blue-800">
          <strong className="block mb-1 flex items-center justify-center"><svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Previous Import Detected</strong>
          The most recent transaction you imported was on <b>{lastUploadDate}</b>. We recommend your new CSV export begins one day after this date.
        </div>
      )}
    </div>
  );
}
