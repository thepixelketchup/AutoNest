import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

export function ClearBillModal({ isOpen, onClose, onSave, bill }) {
  const [actualAmount, setActualAmount] = useState('');
  const [varianceReason, setVarianceReason] = useState('');

  useEffect(() => {
    if (bill && isOpen) {
      setActualAmount(bill.expectedAmount.toString());
      setVarianceReason('');
    }
  }, [bill, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const expected = parseFloat(bill.expectedAmount);
    const actual = parseFloat(actualAmount || '0');
    const isVariance = actual > expected;
    
    onSave({
      actualAmount: actual,
      varianceReason: isVariance ? varianceReason : ''
    });
    onClose();
  };

  if (!bill) return null;

  const expected = parseFloat(bill.expectedAmount);
  const actual = parseFloat(actualAmount || '0');
  const isVariance = actual > expected;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Mark Transaction as Cleared">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-gray-50 p-3 rounded border border-gray-100">
          <p className="font-medium text-gray-800">{bill.name}</p>
          <p className="text-sm text-gray-500">Expected monthly cost: €{expected.toFixed(2)}</p>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Actual Amount Cleared (€)</label>
          <input required type="number" step="0.01" min="0" value={actualAmount} onChange={e => setActualAmount(e.target.value)} className={`w-full mt-1 p-2 border rounded font-medium ${isVariance ? 'border-red-300 bg-red-50 text-red-700' : ''}`} />
        </div>

        {isVariance && (
          <div className="bg-red-50 p-4 rounded-lg border border-red-200 mt-4">
            <label className="block text-sm font-medium text-red-800 mb-2">Overcharge Detected (+€{(actual - expected).toFixed(2)})<br/><span className="text-xs text-red-600 font-normal">Please provide a reason for the variance.</span></label>
            <select required value={varianceReason} onChange={e => setVarianceReason(e.target.value)} className="w-full p-2 border rounded border-red-300 bg-white">
              <option value="">Select reason...</option>
              <option value="Late Fee">Late Fee</option>
              <option value="High Usage">High Usage</option>
              <option value="Annual Adjustment">Annual Adjustment</option>
              <option value="Other">Other</option>
            </select>
          </div>
        )}

        <div className="pt-2">
          <Button type="submit" className="w-full">Confirm Transaction</Button>
        </div>
      </form>
    </Modal>
  );
}
