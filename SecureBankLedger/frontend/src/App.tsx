/*
 * SecureBank Ledger — frontend/src/App.tsx
 * React Router setup with protected routes and role guards
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './stores/authStore';
import Layout from './components/Layout';

// Lazy-loaded pages for code splitting
const Login       = lazy(() => import('./pages/Login'));
const Dashboard   = lazy(() => import('./pages/Dashboard'));
const Accounts    = lazy(() => import('./pages/Accounts'));
const AccountDetail = lazy(() => import('./pages/AccountDetail'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Loans       = lazy(() => import('./pages/Loans'));
const LoanDetail  = lazy(() => import('./pages/LoanDetail'));
const Audit       = lazy(() => import('./pages/Audit'));
const AdminUsers  = lazy(() => import('./pages/AdminUsers'));
const AdminConfig = lazy(() => import('./pages/AdminConfig'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

// Protected route wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode; roles?: string[] }> = ({ children, roles }) => {
  const { isAuthenticated, role } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && role && !roles.includes(role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

// Loading spinner
const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center h-64" aria-live="polite" aria-label="Loading page">
    <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="accounts/:id" element={<AccountDetail />} />
              <Route path="transactions/new" element={<Transactions />} />
              <Route path="loans" element={<Loans />} />
              <Route path="loans/:id" element={<LoanDetail />} />
              <Route path="audit" element={
                <ProtectedRoute roles={['ADMIN', 'AUDITOR']}>
                  <Audit />
                </ProtectedRoute>
              } />
              <Route path="admin/users" element={
                <ProtectedRoute roles={['ADMIN']}>
                  <AdminUsers />
                </ProtectedRoute>
              } />
              <Route path="admin/config" element={
                <ProtectedRoute roles={['ADMIN']}>
                  <AdminConfig />
                </ProtectedRoute>
              } />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
            border: '1px solid #334155',
            borderRadius: '12px',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#22c55e', secondary: '#1e293b' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#1e293b' } },
        }}
      />
    </QueryClientProvider>
  );
};

export default App;
