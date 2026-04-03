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
        await updateBill(editingProvider.id, providerData);
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
         {providers.length === 0 ? (
            <div className="col-span-full py-16 text-center text-gray-500 bg-white rounded-xl shadow-sm border border-gray-200">
               <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
               <p className="font-semibold text-lg text-gray-800">No Providers configured</p>
               <p className="text-sm mt-1 mb-4">Start by adding your recurring bills infrastructure.</p>
               <Button onClick={openAdd} variant="outline" className="shadow-sm">Configure First Provider</Button>
            </div>
         ) : providers.map((p) => (
            <Card key={p.id} className="relative p-6 flex flex-col justify-between hover:border-blue-300 transition-colors group">
               <div>
                  <div className="flex justify-between items-start mb-4">
                     <h3 className="text-xl font-bold text-gray-900">{p.name}</h3>
                     <span className="text-lg font-black text-gray-800 bg-gray-100 px-3 py-1 rounded-md">€{p.expectedAmount.toFixed(2)}</span>
                  </div>
                  
                  <div className="space-y-3 mb-6">
                     <p className="flex justify-between text-sm border-b border-gray-100 pb-2">
                        <span className="text-gray-500 font-medium tracking-wide">Category</span>
                        <span className="text-gray-800 font-semibold capitalize">{p.category}</span>
                     </p>
                     <p className="flex justify-between text-sm border-b border-gray-100 pb-2">
                        <span className="text-gray-500 font-medium tracking-wide">Payment Method</span>
                        <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-bold capitalize">{p.paymentMethod || 'Manual'}</span>
                     </p>
                     <p className="flex justify-between text-sm pb-2">
                        <span className="text-gray-500 font-medium tracking-wide">Expected Day</span>
                        <span className="text-gray-800 font-semibold">{p.expectedDay}</span>
                     </p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 mb-4">
                     <p className="text-xs text-gray-500 font-bold tracking-widest uppercase mb-1 flex items-center">
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        Match Keywords
                     </p>
                     <p className="text-sm font-medium text-gray-800 leading-relaxed">
                        {p.matchKeywords && p.matchKeywords.length > 0 ? (
                           p.matchKeywords.map(kw => <span key={kw} className="inline-block bg-white border border-gray-200 shadow-sm px-2 py-0.5 rounded mr-1 mb-1 text-xs">{kw}</span>)
                        ) : (
                           <span className="text-gray-400 italic text-xs">Matching using primary name only.</span>
                        )}
                     </p>
                  </div>
               </div>

               <Button variant="outline" onClick={() => openEdit(p)} className="w-full text-blue-600 border-blue-200 hover:bg-blue-50 shadow-sm">
                  Edit Provider
               </Button>
            </Card>
         ))}
      </div>

      <ProviderModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSave} defaultValues={editingProvider} />
    </div>
  );
}
