import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function AppLayout() {
  const { logout, userProfile } = useAuth();

  const navItems = [
    { name: 'Dashboard', path: '/' },
    { name: 'Bills', path: '/bills' },
    { name: 'Contributions', path: '/contributions' },
    { name: 'Transactions', path: '/transactions' },
    { name: 'Reports', path: '/reports' },
    { name: 'Import Statement', path: '/imports' },
    { name: 'Providers', path: '/providers' },
    { name: 'Members', path: '/members' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200">
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-blue-600">AutoNest</h1>
        </div>
        <nav className="flex-1 py-4">
          <ul className="space-y-1 px-3">
            {navItems.map((item) => (
              <li key={item.name}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) => `flex items-center px-3 py-2 rounded-lg ${isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  {item.name}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="p-4 border-t border-gray-200">
          <div className="text-sm font-medium text-gray-800 mb-2 px-3 truncate">
            {userProfile?.email}
          </div>
          <button onClick={logout} className="w-full flex items-center px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium">
            Log Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 pb-16 md:pb-0 h-screen overflow-y-auto">
        <Outlet />
      </main>

      {/* Mobile Bottom Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around">
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) => `flex flex-col items-center py-3 px-4 ${isActive ? 'text-blue-600' : 'text-gray-500'}`}
          >
            <span className="text-xs font-medium">{item.name}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
