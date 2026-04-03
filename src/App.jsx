import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Onboarding from './pages/Onboarding';

function App() {
  return (
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
            {/* Additional layout-wrapped routes go here */}
            <Route path="/imports" element={<div className="p-8 text-gray-500">Imports view (Coming in Step 6)</div>} />
            <Route path="/settings" element={<div className="p-8 text-gray-500">Settings view</div>} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
