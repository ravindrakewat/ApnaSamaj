import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Box, CircularProgress } from '@mui/material';
import { defaultTheme } from '@apnasamaj/ui-config';
import { UserRole } from '@apnasamaj/shared-types';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminLayout } from './components/AdminLayout';

// Route-level code splitting
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const MemberManagementPage = lazy(() => import('./pages/MemberManagementPage').then((m) => ({ default: m.MemberManagementPage })));
const ModeratorManagementPage = lazy(() => import('./pages/ModeratorManagementPage').then((m) => ({ default: m.ModeratorManagementPage })));
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage').then((m) => ({ default: m.AuditLogsPage })));
const ModerationQueuePage = lazy(() => import('./pages/ModerationQueuePage').then((m) => ({ default: m.ModerationQueuePage })));
const ModerationAnalyticsPage = lazy(() =>
  import('./pages/ModerationAnalyticsPage').then((m) => ({
    default: m.ModerationAnalyticsPage,
  }))
);
const AppealsReviewPage = lazy(() =>
  import('./pages/AppealsReviewPage').then((m) => ({
    default: m.AppealsReviewPage,
  }))
);
const MatrimonialModerationPage = lazy(() =>
  import('./pages/MatrimonialModerationPage').then((m) => ({
    default: m.MatrimonialModerationPage,
  }))
);

const PageFallback: React.FC = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
    <CircularProgress size={36} />
  </Box>
);

export const App: React.FC = () => {
  return (
    <ThemeProvider theme={defaultTheme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <AdminLayout />
                  </ProtectedRoute>
                }
              >
                <Route
                  index
                  element={
                    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN]}>
                      <DashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="members"
                  element={
                    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN]}>
                      <MemberManagementPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="moderators"
                  element={
                    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN]}>
                      <ModeratorManagementPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="moderation"
                  element={
                    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN, UserRole.MODERATOR]}>
                      <ModerationQueuePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="moderation/analytics"
                  element={
                    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN]}>
                      <ModerationAnalyticsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="moderation/appeals"
                  element={
                    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN, UserRole.MODERATOR]}>
                      <AppealsReviewPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="matrimonial"
                  element={
                    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN]}>
                      <MatrimonialModerationPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="audit-logs"
                  element={
                    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN]}>
                      <AuditLogsPage />
                    </ProtectedRoute>
                  }
                />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
};

export default App;
