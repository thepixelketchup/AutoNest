import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getHousehold, getHouseholdUsers } from '../services/householdService';
import { useToast } from '../hooks/useToast';

export default function Settings() {
  const { userProfile } = useAuth();
  const { addToast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [household, setHousehold] = useState(null);
  const [linkedUsers, setLinkedUsers] = useState([]);

  useEffect(() => {
    if (userProfile?.householdId) {
      fetchSettingsConfig();
    }
  }, [userProfile?.householdId]);

  async function fetchSettingsConfig() {
    try {
      setLoading(true);
      const [hhData, users] = await Promise.all([
        getHousehold(userProfile.householdId),
        getHouseholdUsers(userProfile.householdId)
      ]);
      setHousehold(hhData);
      setLinkedUsers(users);
    } catch (err) {
      addToast('Failed to fetch household configuration.', 'error');
    } finally {
      setLoading(false);
    }
  }

  const handleCopyCode = async () => {
    if (!household?.joinCode) return;
    try {
      await navigator.clipboard.writeText(household.joinCode);
      addToast('Join Code copied to clipboard!', 'success');
    } catch (err) {
      addToast('Failed to copy code.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-4"></div>
        <p className="font-medium animate-pulse">Loading Configurations...</p>
      </div>
    );
  }

  if (!household) return null;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8">
      <header className="mb-6 mt-2 md:mt-0">
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Settings</h1>
        <p className="text-gray-400 text-sm mt-0.5">Manage your core household configuration.</p>
      </header>

      <div className="bg-white rounded-[12px] border border-gray-200 overflow-hidden shadow-sm">
         <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
            <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h2 className="text-[18px] font-bold text-slate-800 tracking-tight">Household Profile</h2>
         </div>

         <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left Block */}
            <div className="space-y-6">
               <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Household Name</p>
                  <p className="text-lg font-bold text-slate-800">{household.name}</p>
               </div>
               <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Join Code</p>
                  <div className="flex items-center gap-3">
                     <div className="bg-blue-50 text-blue-700 font-mono font-black text-2xl tracking-[0.2em] py-2 px-5 rounded-lg border border-blue-100">
                        {household.joinCode}
                     </div>
                     <button onClick={handleCopyCode} className="p-2.5 text-blue-600 bg-white border border-blue-200 rounded-lg shadow-sm hover:bg-blue-50 transition">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                     </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2 font-medium">Share this 6-character code to allow roommates to join your ledger natively.</p>
               </div>
            </div>

            {/* Right Block */}
            <div className="space-y-6">
               <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Tracking Start Boundary</p>
                  <p className="text-lg font-bold text-slate-800">{household.trackingStartDate || 'Unrestricted'}</p>
                  <p className="text-xs text-gray-400 mt-1 font-medium">This anchors the global filtering UI, rejecting years prior to this date.</p>
               </div>
               <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Authenticated Household Members</p>
                  <div className="space-y-2 mt-1">
                     {linkedUsers.map(user => (
                        <div key={user.uid} className="flex items-center text-slate-800 font-semibold gap-3 bg-gray-50 p-3 rounded-lg border border-gray-100">
                           <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                              {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
                           </div>
                           <span className="truncate">{user.displayName || 'Unnamed User'} <span className="text-gray-400 font-normal italic">({user.email})</span></span>
                           {user.uid === userProfile?.uid && (
                              <span className="ml-auto text-xs font-black bg-blue-600 text-white px-2 py-0.5 rounded-full">YOU</span>
                           )}
                        </div>
                     ))}
                  </div>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}
