import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PageProvider } from './contexts/PageContext';
import LoadingSpinner from './components/UI/LoadingSpinner';
import Layout from './components/Layout/Layout';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const ReportsLandingPage = lazy(() => import('./pages/ReportsLandingPage'));
const ReportDetailPage = lazy(() => import('./pages/ReportDetailPage'));
const AdminLandingPage = lazy(() => import('./pages/admin/AdminLandingPage'));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'));
const AdminLLMConfigPage = lazy(() => import('./pages/admin/AdminLLMConfigPage'));
const AdminPacsSettingsPage = lazy(() => import('./pages/admin/AdminPacsSettingsPage'));
const AdminSystemSettingsPage = lazy(() => import('./pages/admin/AdminSystemSettingsPage'));
const BlueLightViewerPage = lazy(() => import('./pages/BlueLightViewerPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const StudiesPage = lazy(() => import('./pages/StudiesPage'));
const UploadViewerPage = lazy(() => import('./pages/UploadViewerPage'));
const GuidePage = lazy(() => import('./pages/GuidePage'));

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
    return <Navigate to="/" replace />;
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
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <PageProvider>
      <Layout>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <ReportsLandingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/draft"
              element={
                <ProtectedRoute>
                  <ReportsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/finalized"
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
              path="/demo"
              element={
                <ProtectedRoute requiredRoles={['observer']}>
                  <UploadViewerPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/guide"
              element={
                <ProtectedRoute>
                  <GuidePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/viewer/uploads"
              element={
                <ProtectedRoute requiredRoles={['observer']}>
                  <Navigate to="/demo" replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute requiredRoles={['admin']}>
                  <AdminLandingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute requiredRoles={['admin']}>
                  <AdminUsersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/llm-config"
              element={
                <ProtectedRoute requiredRoles={['admin']}>
                  <AdminLLMConfigPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/pacs-settings"
              element={
                <ProtectedRoute requiredRoles={['admin']}>
                  <AdminPacsSettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/system-settings"
              element={
                <ProtectedRoute requiredRoles={['admin']}>
                  <AdminSystemSettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute requiredRoles={['admin', 'doctor', 'researcher']}>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
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
