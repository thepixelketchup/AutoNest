import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute({ children, requireHousehold = true }) {
  const { currentUser, userProfile } = useAuth();
  const location = useLocation();
  
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // Not allowing users off onboarding if they don't have a household
  if (requireHousehold && userProfile && !userProfile.householdId) {
    return <Navigate to="/onboarding" replace />;
  }
  
  // If user is trying to access onboarding but already has a household
  if (!requireHousehold && userProfile && userProfile.householdId && location.pathname === '/onboarding') {
    return <Navigate to="/" replace />;
  }

  return children;
}
