import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getHousehold } from '../services/householdService';

export default function Dashboard() {
  const { currentUser, userProfile, logout } = useAuth();
  const [household, setHousehold] = useState(null);

  useEffect(() => {
    if (userProfile?.householdId) {
      getHousehold(userProfile.householdId).then(setHousehold);
    }
  }, [userProfile?.householdId]);
  
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">AutoNest Dashboard</h1>
      {household && (
        <div className="mb-4 bg-white p-4 rounded shadow border border-gray-100 max-w-sm">
          <h2 className="text-xl font-semibold">{household.name}</h2>
          <p className="text-gray-600 mt-2">
            Join Code: <span className="font-mono bg-gray-100 px-2 py-1 rounded text-black tracking-widest">{household.joinCode}</span>
          </p>
        </div>
      )}
      <p>Welcome, {currentUser?.email}</p>
      <button 
        onClick={logout}
        className="mt-4 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition"
      >
        Log Out
      </button>
    </div>
  );
}
