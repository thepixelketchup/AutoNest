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
import Providers from './pages/Providers';
import Members from './pages/Members';
import Contributions from './pages/Contributions';
import Bills from './pages/Bills';
import MatchReport from './pages/MatchReport';

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
            <Route path="/bills" element={<Bills />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/contributions" element={<Contributions />} />
            <Route path="/reports" element={<MatchReport />} />
            <Route path="/imports" element={<Imports />} />
            <Route path="/providers" element={<Providers />} />
            <Route path="/members" element={<Members />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
    </ToastProvider>
  );
}

export default App;
