import React, { useState } from 'react';
import { Button } from '../ui/Button';

export function SweepReviewModal({ pendingProposals, onClose, onApprove }) {
  // Toggle selection for each proposed update
  const [selectedIds, setSelectedIds] = useState(
    new Set(pendingProposals.map(p => p.id))
  );

  const toggleSelection = (id) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleApprove = () => {
    const approvedMatches = pendingProposals.filter(p => selectedIds.has(p.id));
    onApprove(approvedMatches);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div>
             <h2 className="text-xl font-bold text-gray-900">Review Auto-Sweep Matches</h2>
             <p className="text-sm text-gray-500 mt-1">We found {pendingProposals.length} potential matches for your historic transactions.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-2 rounded-full hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto p-6 flex-1 bg-gray-50/30">
          <div className="space-y-3">
            {pendingProposals.map((proposal) => {
               const isSelected = selectedIds.has(proposal.id);
               return (
                 <div 
                   key={proposal.id} 
                   className={`flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer shadow-sm ${isSelected ? 'bg-white border-blue-200 ring-1 ring-blue-100' : 'bg-gray-50/50 border-gray-200 opacity-75'}`}
                   onClick={() => toggleSelection(proposal.id)}
                 >
                   <div className="flex items-center space-x-4 flex-1">
                     <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 bg-white'}`}>
                        {isSelected && <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none"><path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                     </div>
                     <div className="flex-1">
                       <div className="flex items-center gap-3">
                         <span className={`font-semibold ${isSelected ? 'text-gray-900' : 'text-gray-600'}`}>{proposal.txName}</span>
                         <span className="text-xs font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-600">{proposal.txAmount}</span>
                       </div>
                       <div className="flex items-center gap-2 mt-1">
                         <span className="text-xs font-medium text-gray-500">{proposal.txDate}</span>
                         <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                         <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded">Linked to: {proposal.billName}</span>
                       </div>
                     </div>
                   </div>
                 </div>
               );
            })}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-white flex justify-between items-center">
          <p className="text-sm font-medium text-gray-500">{selectedIds.size} of {pendingProposals.length} matches selected</p>
          <div className="flex space-x-3">
             <Button variant="outline" onClick={onClose} className="px-5">Cancel</Button>
             <Button onClick={handleApprove} variant="primary" disabled={selectedIds.size === 0} className="px-6 shadow-sm">
                Approve {selectedIds.size} Matches
             </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
