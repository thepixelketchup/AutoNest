import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { createHousehold, joinHousehold } from '../services/householdService';

export default function Onboarding() {
  const [activeTab, setActiveTab] = useState('create'); // 'create' | 'join'
  const [name, setName] = useState('');
  const [trackingStart, setTrackingStart] = useState(`${new Date().getFullYear()}-01`);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { currentUser, refreshProfile } = useAuth();
  const navigate = useNavigate();

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      setLoading(true);
      setError('');
      await createHousehold(currentUser.uid, name, trackingStart);
      await refreshProfile();
      navigate('/');
    } catch (err) {
      console.error(err);
      setError('Failed to create household.');
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin(e) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    try {
      setLoading(true);
      setError('');
      await joinHousehold(currentUser.uid, joinCode.toUpperCase());
      await refreshProfile();
      navigate('/');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to join household.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md overflow-hidden">
        <div className="flex border-b">
          <button 
            className={`flex-1 py-4 text-center font-medium ${activeTab === 'create' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30' : 'text-gray-500 hover:bg-gray-50'}`}
            onClick={() => setActiveTab('create')}
          >
            Create Household
          </button>
          <button 
            className={`flex-1 py-4 text-center font-medium ${activeTab === 'join' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30' : 'text-gray-500 hover:bg-gray-50'}`}
            onClick={() => setActiveTab('join')}
          >
            Join Existing
          </button>
        </div>
        
        <div className="p-8">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">{error}</div>}
          
          {activeTab === 'create' ? (
            <form onSubmit={handleCreate} className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-800">Set up a new household</h2>
              <p className="text-sm text-gray-500">Create a centralized space to manage all shared bills and direct debits.</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Household Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. The Smiths, 123 Main St"
                  className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tracking Start Month</label>
                <input 
                  type="month" 
                  className="w-full p-2 border border-gray-300 rounded text-gray-800 focus:ring-blue-500 focus:border-blue-500"
                  value={trackingStart}
                  onChange={(e) => setTrackingStart(e.target.value)}
                  required
                />
              </div>
              <button 
                disabled={loading || !name} 
                type="submit" 
                className="w-full bg-blue-600 text-white font-medium p-3 rounded hover:bg-blue-700 transition disabled:opacity-50 mt-2"
              >
                {loading ? 'Creating...' : 'Create Hub'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoin} className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-800">Join an existing household</h2>
              <p className="text-sm text-gray-500">Enter the 6-character Join Code provided by someone already in the household.</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Join Code</label>
                <input 
                  type="text" 
                  placeholder="e.g. K8F2XQ"
                  className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 font-mono uppercase tracking-widest text-center"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  required
                  maxLength={6}
                />
              </div>
              <button 
                disabled={loading || joinCode.length !== 6} 
                type="submit" 
                className="w-full bg-blue-600 text-white font-medium p-3 rounded hover:bg-blue-700 transition disabled:opacity-50 mt-2"
              >
                {loading ? 'Joining...' : 'Join existing'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
