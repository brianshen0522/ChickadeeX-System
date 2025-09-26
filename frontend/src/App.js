import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PageProvider } from './contexts/PageContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ReportsPage from './pages/ReportsPage';
import ReportDetailPage from './pages/ReportDetailPage';
import AdminPage from './pages/AdminPage';
import BlueLightViewerPage from './pages/BlueLightViewerPage';
import ProfilePage from './pages/ProfilePage';
import StudiesPage from './pages/StudiesPage';
import Layout from './components/Layout/Layout';
import LoadingSpinner from './components/UI/LoadingSpinner';

// Protected Route Component
function ProtectedRoute({ children, requiredRoles = [] }) {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles.length > 0 && !requiredRoles.includes(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

// App Routes Component
function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <PageProvider>
      <Layout>
        <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/reports" 
          element={
            <ProtectedRoute>
              <ReportsPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/reports/:reportId" 
          element={
            <ProtectedRoute>
              <ReportDetailPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/studies" 
          element={
            <ProtectedRoute requiredRoles={['doctor']}>
              <StudiesPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/bluelight" 
          element={
            <ProtectedRoute requiredRoles={['doctor']}>
              <BlueLightViewerPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/admin" 
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <AdminPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/profile" 
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          } 
        />
        <Route path="/login" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Layout>
    </PageProvider>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <div className="min-h-screen bg-gray-50">
          <AppRoutes />
          <Toaster 
            position="bottom-right"
            containerStyle={{ pointerEvents: 'none' }}
            toastOptions={{
              duration: 4000,
              style: {
                background: '#363636',
                color: '#fff',
              },
              success: {
                duration: 3000,
                theme: {
                  primary: '#4aed88',
                },
              },
            }}
          />
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;
