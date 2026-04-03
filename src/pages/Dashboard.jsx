import React from 'react';
import { useAuth } from '../hooks/useAuth';

export default function Dashboard() {
  const { currentUser, logout } = useAuth();
  
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">AutoNest Dashboard</h1>
      <p>Welcome, {currentUser?.email}</p>
      <button 
        onClick={logout}
        className="mt-4 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
      >
        Log Out
      </button>
    </div>
  );
}
