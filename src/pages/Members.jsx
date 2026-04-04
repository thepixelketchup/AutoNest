import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getMembers, addMember, updateMember } from '../services/billService';
import { MemberModal } from '../components/bills/MemberModal';
import { useToast } from '../hooks/useToast';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export default function Members() {
  const { userProfile } = useAuth();
  const { addToast } = useToast();
  
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);

  useEffect(() => {
    if (userProfile?.householdId) {
      loadMembers();
    }
  }, [userProfile?.householdId]);

  async function loadMembers() {
    try {
      setLoading(true);
      const data = await getMembers(userProfile.householdId);
      // Sort alphabetically
      data.sort((a,b) => a.name.localeCompare(b.name));
      setMembers(data);
    } catch (e) {
      addToast("Failed to fetch members.", "error");
    } finally {
      setLoading(false);
    }
  }

  const handleSave = async (memberData) => {
    try {
      if (editingMember) {
        await updateMember(userProfile.householdId, editingMember.id, memberData);
        addToast("Member updated successfully.", "success");
      } else {
        await addMember(userProfile.householdId, memberData);
        addToast("New member saved.", "success");
      }
      setIsModalOpen(false);
      setEditingMember(null);
      loadMembers();
    } catch (e) {
      addToast("Failed to save member.", "error");
    }
  };

  const openEdit = (p) => {
    setEditingMember(p);
    setIsModalOpen(true);
  };

  const openAdd = () => {
    setEditingMember(null);
    setIsModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="font-medium animate-pulse">Loading Members...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:justify-between md:items-center space-y-4 md:space-y-0 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expected Members</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your regular bills, members, and payment methods.</p>
        </div>
        <Button onClick={openAdd} variant="primary" className="shadow-md">+ Add New Member</Button>
      </header>

      <div className="flex flex-col space-y-4">
         {members.length === 0 ? (
            <div className="py-16 text-center text-gray-500 bg-white rounded-xl shadow-sm border border-gray-200 w-full">
               <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5V4a2 2 0 00-2-2h-5m-9 0H3a2 2 0 00-2 2v16h5m14 0h-5m0 0H8m0 0H3m14 0h-5m0 0H8M5 10v4m4-4h4m4 0h0m-4-6v4m4-4h4m-4 0h0m-4-6v4m4-4h4m-4 0h0" /></svg>
               <p className="font-semibold text-lg text-gray-800">No Members configured</p>
               <p className="text-sm mt-1 mb-4">Start by adding household individuals who contribute funds.</p>
               <Button onClick={openAdd} variant="outline" className="shadow-sm">Configure First Member</Button>
            </div>
         ) : members.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-row items-center justify-between hover:border-gray-300 transition-colors w-full group shadow-sm">
               <div className="flex flex-col space-y-3">
                  <div className="flex items-center space-x-3">
                     <span className="flex items-center justify-center bg-blue-100 text-blue-700 rounded-lg w-10 h-10 font-bold shrink-0">{p.name.charAt(0).toUpperCase()}</span>
                     <h3 className="text-[22px] font-extrabold text-slate-800 tracking-tight">{p.name}</h3>
                  </div>
                  <div className="text-[15px] text-slate-400">
                     Contribution Match Keywords: {p.matchKeywords && p.matchKeywords.length > 0 ? p.matchKeywords.join(', ') : 'None'}
                  </div>
               </div>

               <div className="flex flex-col items-end space-y-4">
                  <button onClick={() => openEdit(p)} className="text-sm font-semibold text-blue-600 opacity-0 group-hover:opacity-100 hover:text-blue-800 transition-all">
                     Edit Config
                  </button>
               </div>
            </div>
         ))}
      </div>

      <MemberModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSave} defaultValues={editingMember} />
    </div>
  );
}
