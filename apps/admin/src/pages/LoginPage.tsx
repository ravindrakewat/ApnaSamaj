import React, { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
  Chip,
} from '@mui/material';
import {
  LockOutlined,
  PhoneOutlined,
  Visibility,
  VisibilityOff,
  AdminPanelSettings,
} from '@mui/icons-material';
import { phoneSchema } from '@apnasamaj/validation';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { user, login, isLoading: isRestoring, error: authError, clearError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // If already authenticated and not in a restoring state, redirect to intended page
  if (user && !isRestoring) {
    const from = (location.state as any)?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }

  const validate = (): boolean => {
    let valid = true;
    setPhoneError(null);
    setPasswordError(null);

    // Validate phone using @apnasamaj/validation phoneSchema
    const phoneResult = phoneSchema.safeParse(phone);
    if (!phoneResult.success) {
      setPhoneError(phoneResult.error.issues[0]?.message || 'Invalid Indian mobile number');
      valid = false;
    }

    if (!password || password.trim().length === 0) {
      setPasswordError('Password is required');
      valid = false;
    }

    return valid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setErrorMessage(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await login(phone, password);
      const from = (location.state as any)?.from?.pathname || '/';
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid credentials or connection error.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        py: 4,
        px: 2,
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={4}
          sx={{
            p: { xs: 3, sm: 5 },
            borderRadius: 3,
            borderTop: '6px solid #9c27b0',
            bgcolor: 'background.paper',
          }}
        >
          {/* Header & Branding */}
          <Box display="flex" flexDirection="column" alignItems="center" mb={3}>
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                bgcolor: 'secondary.light',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 1.5,
                color: 'secondary.contrastText',
              }}
            >
              <AdminPanelSettings fontSize="large" />
            </Box>
            <Typography variant="h4" component="h1" fontWeight="bold" color="secondary" gutterBottom>
              Apna Samaj
            </Typography>
            <Chip
              label="Super Admin Portal"
              color="secondary"
              variant="outlined"
              size="small"
              sx={{ fontWeight: 'bold' }}
            />
          </Box>

          <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
            Sign in to access community moderation, security audits, and configuration settings.
          </Typography>

          {/* Error Banner */}
          {(errorMessage || authError) && (
            <Alert
              severity="error"
              onClose={() => {
                setErrorMessage(null);
                clearError();
              }}
              sx={{ mb: 3 }}
            >
              {errorMessage || authError}
            </Alert>
          )}

          {/* Form */}
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              margin="normal"
              required
              fullWidth
              id="phone"
              label="Mobile Number"
              name="phone"
              autoComplete="tel"
              autoFocus
              placeholder="e.g. 9876543210 or +919876543210"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (phoneError) setPhoneError(null);
              }}
              error={Boolean(phoneError)}
              helperText={phoneError || '10-digit Indian phone number starting with 6, 7, 8, or 9'}
              disabled={isSubmitting}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <PhoneOutlined color={phoneError ? 'error' : 'action'} />
                  </InputAdornment>
                ),
              }}
              sx={{ mb: 2 }}
            />

            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError(null);
              }}
              error={Boolean(passwordError)}
              helperText={passwordError}
              disabled={isSubmitting}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockOutlined color={passwordError ? 'error' : 'action'} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowPassword((prev) => !prev)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{ mb: 3 }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              color="secondary"
              size="large"
              disabled={isSubmitting || isRestoring}
              sx={{
                py: 1.5,
                fontWeight: 'bold',
                textTransform: 'none',
                fontSize: '1rem',
                borderRadius: 2,
              }}
            >
              {isSubmitting ? (
                <Box display="flex" alignItems="center" gap={1.5}>
                  <CircularProgress size={22} color="inherit" />
                  <span>Authenticating...</span>
                </Box>
              ) : (
                'Sign In to Console'
              )}
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
};

export default LoginPage;
