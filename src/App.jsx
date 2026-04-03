import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './hooks/useToast';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Onboarding from './pages/Onboarding';
import Imports from './pages/Imports';
import Transactions from './pages/Transactions';

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route 
            path="/onboarding" 
            element={
              <ProtectedRoute requireHousehold={false}>
                <Onboarding />
              </ProtectedRoute>
            } 
          />
          <Route 
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            } 
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/imports" element={<Imports />} />
            <Route path="/settings" element={<div className="p-8 text-gray-500">Settings view module under construction</div>} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
    </ToastProvider>
  );
}

export default App;
