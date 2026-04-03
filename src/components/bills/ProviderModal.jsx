import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';

export function ProviderModal({ isOpen, onClose, onSave, defaultValues = null }) {
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    expectedAmount: '',
    expectedDay: '',
    paymentMethod: 'Direct Debit',
    matchKeywords: ''
  });

  useEffect(() => {
    if (defaultValues) {
      setFormData({
        name: defaultValues.name || '',
        category: defaultValues.category || '',
        expectedAmount: defaultValues.expectedAmount || '',
        expectedDay: defaultValues.expectedDay || '',
        paymentMethod: defaultValues.paymentMethod || 'Direct Debit',
        matchKeywords: Array.isArray(defaultValues.matchKeywords) ? defaultValues.matchKeywords.join(', ') : (defaultValues.matchKeywords || '')
      });
    } else {
      setFormData({
        name: '', category: '', expectedAmount: '', expectedDay: '', paymentMethod: 'Direct Debit', matchKeywords: ''
      });
    }
  }, [defaultValues, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Parse keywords explicitly
    const keywordsRaw = formData.matchKeywords.split(',').map(k => k.trim()).filter(k => k.length > 0);

    onSave({
      name: formData.name,
      category: formData.category,
      expectedAmount: parseFloat(formData.expectedAmount),
      expectedDay: parseInt(formData.expectedDay, 10),
      paymentMethod: formData.paymentMethod,
      matchKeywords: keywordsRaw
    });
  };

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-xl font-bold text-gray-900">{defaultValues ? 'Edit Provider' : 'Add New Provider'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Provider Name</label>
              <input 
                type="text" 
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Odido"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                required 
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Category</label>
              <input 
                type="text" 
                name="category"
                value={formData.category}
                onChange={handleChange}
                placeholder="e.g. Internet"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                required 
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Expected Amount (€)</label>
              <input 
                type="number" 
                step="0.01"
                min="0"
                name="expectedAmount"
                value={formData.expectedAmount}
                onChange={handleChange}
                placeholder="0.00"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                required 
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Charge Day (1-31)</label>
              <input 
                type="number" 
                min="1" max="31"
                name="expectedDay"
                value={formData.expectedDay}
                onChange={handleChange}
                placeholder="25"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                required 
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Payment Method</label>
              <select
                name="paymentMethod"
                value={formData.paymentMethod}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-800"
              >
                 <option value="Direct Debit">Direct Debit</option>
                 <option value="Manual">Manual</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1 flex justify-between">
                <span>Match Keywords (comma separated)</span>
              </label>
              <input 
                type="text" 
                name="matchKeywords"
                value={formData.matchKeywords}
                onChange={handleChange}
                placeholder="e.g. odido, t-mobile"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <p className="text-xs text-gray-500 mt-1.5 font-medium italic">Used to find the transaction accurately within your bank statement.</p>
            </div>
          </div>

          <div className="pt-4 flex justify-end space-x-3">
            <Button type="button" variant="outline" onClick={onClose} className="px-6 text-gray-600 border-gray-300">Cancel</Button>
            <Button type="submit" variant="primary" className="px-8 shadow-sm">{defaultValues ? 'Save Changes' : 'Add Provider'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
