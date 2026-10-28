import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { UserRole } from '@apnasamaj/shared-types';
import { useAuth } from '../context/AuthContext';

export interface ProtectedRouteProps {
  children?: React.ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        minHeight="100vh"
        bgcolor="background.default"
        gap={2}
      >
        <CircularProgress color="secondary" size={48} thickness={4} />
        <Typography variant="body2" color="text.secondary">
          Verifying security credentials...
        </Typography>
      </Box>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // If a MODERATOR accesses an unauthorized admin route, redirect to /moderation
    if (user.role === UserRole.MODERATOR) {
      return <Navigate to="/moderation" replace />;
    }
    // Otherwise redirect to dashboard
    return <Navigate to="/" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export default ProtectedRoute;
