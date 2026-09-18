import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/layout/Layout';
import ProtectedRoute from './components/ProtectedRoute';
const Login = lazy(() => import('./pages/Login'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CommandCenter = lazy(() => import('./pages/CommandCenter'));
const ExtractionReview = lazy(() => import('./pages/ExtractionReview'));
const ValidationDashboard = lazy(() => import('./pages/ValidationDashboard'));
const KnowledgeBase = lazy(() => import('./pages/KnowledgeBase'));
const AIAssistant = lazy(() => import('./pages/AIAssistant'));
const AnalyticsDashboard = lazy(() => import('./pages/AnalyticsDashboard'));
const TopicsExplorer = lazy(() => import('./pages/TopicsExplorer'));
const ReportGenerator = lazy(() => import('./pages/ReportGenerator'));
const AuditTrail = lazy(() => import('./pages/AuditTrail'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const SystemHealth = lazy(() => import('./pages/SystemHealth'));
const IntelligenceDashboard = lazy(() => import('./pages/IntelligenceDashboard'));
const AdminPendingReviews = lazy(() => import('./pages/AdminPendingReviews'));
const ReconciliationReview = lazy(() => import('./pages/ReconciliationReview'));
const Settings = lazy(() => import('./pages/Settings'));
const HelpSupport = lazy(() => import('./pages/HelpSupport'));

import { LanguageProvider } from './context/LanguageContext';

const Landing = lazy(() => import('./pages/Landing'));

function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <div className="min-h-screen bg-light-bg dark:bg-dark-bg transition-colors duration-200">
            <BrowserRouter>
              <Suspense fallback={<div role="status" className="p-6 text-neutral-500">Loading...</div>}>
              <Routes>
                {/* Public Landing & Auth Routes */}
                <Route path="/" element={<Landing />} />
                <Route path="/welcome" element={<Landing />} />
                <Route path="/login" element={<Login />} />
                <Route path="/admin/login" element={<AdminLogin />} />
                
                {/* Protected Application Workflows */}
                <Route element={<ProtectedRoute />}>
                  <Route element={<Layout />}>
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="user-dashboard" element={<Navigate to="/dashboard" replace />} />
                    <Route path="admin-dashboard" element={<ProtectedRoute adminOnly={true}><AdminDashboard /></ProtectedRoute>} />
                    <Route path="command-center" element={<CommandCenter />} />
                    <Route path="extraction" element={<ExtractionReview />} />
                    <Route path="validation" element={<ValidationDashboard />} />
                    <Route path="knowledge-base" element={<KnowledgeBase />} />
                    <Route path="ai-assistant" element={<AIAssistant />} />
                    <Route path="reports" element={<ReportGenerator />} />
                    <Route path="analytics" element={<AnalyticsDashboard />} />
                    <Route path="intelligence" element={<IntelligenceDashboard />} />
                    <Route path="topics" element={<TopicsExplorer />} />
                    <Route path="audit" element={<AuditTrail />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="help" element={<HelpSupport />} />
                    <Route path="reconciliations" element={<ProtectedRoute allowedRoles={['reviewer', 'admin']}><ReconciliationReview /></ProtectedRoute>} />
                    
                    {/* Admin Specific Screens */}
                    <Route element={<ProtectedRoute adminOnly={true} />}>
                      <Route path="admin/users" element={<AdminUsers />} />
                      <Route path="admin/system-health" element={<SystemHealth />} />
                      <Route path="admin/pending-reviews" element={<AdminPendingReviews />} />
                      <Route path="admin/reconciliations" element={<Navigate to="/reconciliations" replace />} />
                    </Route>
                  </Route>
                </Route>
              </Routes>
              </Suspense>
            </BrowserRouter>
          </div>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;
