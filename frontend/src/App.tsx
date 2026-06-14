import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import GroupDetails from './pages/GroupDetails';
import Landing from './pages/Landing';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-brand-500 border-t-transparent animate-spin"></div>
        <p className="text-slate-600 text-sm">Authenticating your session...</p>
      </div>
    );
  }
  
  return token ? <>{children}</> : <Navigate to="/login" replace />;
};

const HomeRoute: React.FC = () => {
  const { token, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-brand-500 border-t-transparent animate-spin"></div>
        <p className="text-slate-600 text-sm">Authenticating your session...</p>
      </div>
    );
  }
  
  return token ? <Dashboard /> : <Landing />;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Root Conditional Route */}
          <Route path="/" element={<HomeRoute />} />

          {/* Public Auth Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected Routes */}
          <Route
            path="/groups/:group_id"
            element={
              <ProtectedRoute>
                <GroupDetails />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}


export default App;
