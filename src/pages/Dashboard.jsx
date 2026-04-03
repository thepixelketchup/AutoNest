import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export default function Dashboard() {
  const { userProfile } = useAuth();

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <header className="flex justify-between items-center mb-6 mt-2 md:mt-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Household Dashboard</h1>
          <p className="text-gray-500 text-sm">Manage your recurring bills</p>
        </div>
        <Button variant="primary" className="shadow-sm">+ Add Bill</Button>
      </header>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex flex-col justify-between h-24">
          <p className="text-sm text-gray-500 font-medium">Total Expected</p>
          <p className="text-2xl font-bold text-gray-900">€0.00</p>
        </Card>
        <Card className="p-4 flex flex-col justify-between h-24">
          <p className="text-sm text-gray-500 font-medium">Total Cleared</p>
          <p className="text-2xl font-bold text-green-600">€0.00</p>
        </Card>
        <Card className="p-4 flex flex-col justify-between h-24">
          <p className="text-sm text-gray-500 font-medium">Remaining</p>
          <p className="text-2xl font-bold text-blue-600">€0.00</p>
        </Card>
        <Card className="p-4 flex flex-col justify-between h-24 bg-rose-50 border-rose-100">
          <p className="text-sm text-rose-600 font-medium">Variance Alert</p>
          <p className="text-2xl font-bold text-rose-700">€0.00</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Monthly Ledger Shell */}
          <Card className="p-0">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-lg font-semibold text-gray-800">Monthly Ledger</h2>
              <div className="flex space-x-2">
                 <span className="text-xs bg-white border border-gray-200 px-2 py-1 rounded text-gray-500 font-medium">Pending: 0</span>
                 <span className="text-xs bg-white border border-gray-200 px-2 py-1 rounded text-green-600 font-medium">Cleared: 0</span>
              </div>
            </div>
            <div className="p-12 text-center text-gray-400 border-2 border-dashed border-gray-200 mx-4 my-6 rounded-lg bg-gray-50/50">
              Monthly Bills List component (to be implemented)
            </div>
          </Card>
        </div>
        
        <div className="space-y-6 lg:col-span-1">
          {/* Requires Attention Shell */}
          <Card className="p-0 overflow-hidden border-orange-200">
            <div className="p-4 border-b border-orange-100 bg-orange-50">
              <h2 className="text-base font-semibold text-orange-800 flex items-center">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                Requires Attention
              </h2>
            </div>
            <div className="p-6 text-sm text-gray-500 text-center">
              No overdue bills or severe variances. You're all caught up!
            </div>
          </Card>

          {/* Mini-timeline Shell */}
          <Card className="p-0">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">Upcoming (Next 7 Days)</h2>
            </div>
            <div className="p-6 text-sm text-gray-500 text-center">
              No upcoming bills projected for this week.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
