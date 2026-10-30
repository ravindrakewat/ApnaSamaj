import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Box, CircularProgress } from '@mui/material';
import { defaultTheme } from '@apnasamaj/ui-config';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { ProtectedRoute } from './components/ProtectedRoute';

// Route-level code splitting
const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const FeedPage = lazy(() => import('./pages/FeedPage').then((m) => ({ default: m.FeedPage })));
const DirectoryPage = lazy(() => import('./pages/DirectoryPage').then((m) => ({ default: m.DirectoryPage })));
const GroupsPage = lazy(() => import('./pages/GroupsPage').then((m) => ({ default: m.GroupsPage })));
const GroupDetailPage = lazy(() => import('./pages/GroupDetailPage').then((m) => ({ default: m.GroupDetailPage })));
const MemberProfilePage = lazy(() => import('./pages/MemberProfilePage').then((m) => ({ default: m.MemberProfilePage })));
const MatrimonialDashboardPage = lazy(() =>
  import('./pages/MatrimonialDashboardPage').then((m) => ({ default: m.MatrimonialDashboardPage }))
);
const MatrimonialDiscoveryPage = lazy(() =>
  import('./pages/MatrimonialDiscoveryPage').then((m) => ({ default: m.MatrimonialDiscoveryPage }))
);
const MatrimonialProfileDetailPage = lazy(() =>
  import('./pages/MatrimonialProfileDetailPage').then((m) => ({ default: m.MatrimonialProfileDetailPage }))
);
const PostDetailPage = lazy(() => import('./pages/PostDetailPage').then((m) => ({ default: m.PostDetailPage })));
const MyAppealsPage = lazy(() => import('./pages/MyAppealsPage').then((m) => ({ default: m.MyAppealsPage })));

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
          <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
            <Navbar />
            <Box component="main" sx={{ flexGrow: 1 }}>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  <Route
                    path="/profile"
                    element={
                      <ProtectedRoute>
                        <ProfilePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/feed"
                    element={
                      <ProtectedRoute>
                        <FeedPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/posts/:postId"
                    element={
                      <ProtectedRoute>
                        <PostDetailPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/appeals"
                    element={
                      <ProtectedRoute>
                        <MyAppealsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/directory"
                    element={
                      <ProtectedRoute>
                        <DirectoryPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/groups"
                    element={
                      <ProtectedRoute>
                        <GroupsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/groups/:slug"
                    element={
                      <ProtectedRoute>
                        <GroupDetailPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/members/:id"
                    element={
                      <ProtectedRoute>
                        <MemberProfilePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/matrimonial"
                    element={
                      <ProtectedRoute>
                        <MatrimonialDiscoveryPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/matrimonial/profiles/:id"
                    element={
                      <ProtectedRoute>
                        <MatrimonialProfileDetailPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/matrimonial/me"
                    element={
                      <ProtectedRoute>
                        <MatrimonialDashboardPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </Box>
          </Box>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
};

export default App;
