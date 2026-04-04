import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getBills, addBill, updateBill } from '../services/billService';
import { ProviderModal } from '../components/bills/ProviderModal';
import { useToast } from '../hooks/useToast';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export default function Providers() {
  const { userProfile } = useAuth();
  const { addToast } = useToast();
  
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);

  useEffect(() => {
    if (userProfile?.householdId) {
      loadProviders();
    }
  }, [userProfile?.householdId]);

  async function loadProviders() {
    try {
      setLoading(true);
      const data = await getBills(userProfile.householdId);
      // Sort alphabetically
      data.sort((a,b) => a.name.localeCompare(b.name));
      setProviders(data);
    } catch (e) {
      addToast("Failed to fetch providers.", "error");
    } finally {
      setLoading(false);
    }
  }

  const handleSave = async (providerData) => {
    try {
      if (editingProvider) {
        await updateBill(userProfile.householdId, editingProvider.id, providerData);
        addToast("Provider updated successfully.", "success");
      } else {
        await addBill(userProfile.householdId, providerData);
        addToast("New provider saved.", "success");
      }
      setIsModalOpen(false);
      setEditingProvider(null);
      loadProviders();
    } catch (e) {
      addToast("Failed to save provider.", "error");
    }
  };

  const openEdit = (p) => {
    setEditingProvider(p);
    setIsModalOpen(true);
  };

  const openAdd = () => {
    setEditingProvider(null);
    setIsModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="font-medium animate-pulse">Loading Providers...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:justify-between md:items-center space-y-4 md:space-y-0 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expected Providers</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your regular bills, providers, and payment methods.</p>
        </div>
        <Button onClick={openAdd} variant="primary" className="shadow-md">+ Add New Provider</Button>
      </header>

      <div className="flex flex-col space-y-4">
         {providers.length === 0 ? (
            <div className="py-16 text-center text-gray-500 bg-white rounded-xl shadow-sm border border-gray-200 w-full">
               <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
               <p className="font-semibold text-lg text-gray-800">No Providers configured</p>
               <p className="text-sm mt-1 mb-4">Start by adding your recurring bills infrastructure.</p>
               <Button onClick={openAdd} variant="outline" className="shadow-sm">Configure First Provider</Button>
            </div>
         ) : providers.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-row items-center justify-between hover:border-gray-300 transition-colors w-full group shadow-sm">
               <div className="flex flex-col space-y-3">
                  <div className="flex items-center space-x-3">
                     <h3 className="text-[22px] font-extrabold text-slate-800 tracking-tight">{p.name}</h3>
                     <span className="text-[14px] font-medium text-green-700 bg-[#e0f8e9] px-3 py-1 rounded-lg capitalize">
                        {p.paymentMethod || 'Manual'}
                     </span>
                     {p.expectedDay && (
                        <span className="text-[13px] font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg flex items-center">
                           <svg className="w-3.5 h-3.5 mr-1 text-slate-400 transition-colors group-hover:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                           Day {p.expectedDay}
                        </span>
                     )}
                  </div>
                  <div className="text-[17px] text-slate-600">
                     Category: {p.category}
                  </div>
                  <div className="text-[15px] text-slate-400">
                     Keywords: {p.matchKeywords && p.matchKeywords.length > 0 ? p.matchKeywords.join(', ') : 'None'}
                  </div>
               </div>

               <div className="flex flex-col items-end space-y-4">
                  <span className="text-2xl font-black text-slate-800 tracking-tight">€{p.expectedAmount.toFixed(2)}</span>
                  <button onClick={() => openEdit(p)} className="text-sm font-semibold text-blue-600 opacity-0 group-hover:opacity-100 hover:text-blue-800 transition-all">
                     Edit Provider
                  </button>
               </div>
            </div>
         ))}
      </div>

      <ProviderModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSave} defaultValues={editingProvider} />
    </div>
  );
}
