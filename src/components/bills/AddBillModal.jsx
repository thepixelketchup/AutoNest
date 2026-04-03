import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

export function AddBillModal({ isOpen, onClose, onSave }) {
  const [name, setName] = useState('');
  const [expectedAmount, setExpectedAmount] = useState('');
  const [expectedDay, setExpectedDay] = useState('');
  const [category, setCategory] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      name,
      expectedAmount: parseFloat(expectedAmount),
      expectedDay: parseInt(expectedDay, 10),
      category
    });
    setName('');
    setExpectedAmount('');
    setExpectedDay('');
    setCategory('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Recurring Bill">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Bill Name</label>
          <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full mt-1 p-2 border rounded" placeholder="e.g. Electricity, Netflix" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Expected Amount (€)</label>
          <input required type="number" step="0.01" min="0" value={expectedAmount} onChange={e => setExpectedAmount(e.target.value)} className="w-full mt-1 p-2 border rounded" placeholder="50.00" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Expected Day of Month</label>
          <input required type="number" min="1" max="31" value={expectedDay} onChange={e => setExpectedDay(e.target.value)} className="w-full mt-1 p-2 border rounded" placeholder="15" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Category</label>
          <select required value={category} onChange={e => setCategory(e.target.value)} className="w-full mt-1 p-2 border rounded bg-white">
            <option value="">Select a category...</option>
            <option value="utilities">Utilities</option>
            <option value="rent">Rent/Mortgage</option>
            <option value="insurance">Insurance</option>
            <option value="subscriptions">Subscriptions</option>
            <option value="other">Other</option>
          </select>
        </div>
        <Button type="submit" className="w-full mt-4">Save Bill Template</Button>
      </form>
    </Modal>
  );
}
