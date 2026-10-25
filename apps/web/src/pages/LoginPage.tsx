import React, { useState } from 'react';
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import {
  Container,
  Paper,
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  InputAdornment,
  IconButton,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import DomainIcon from '@mui/icons-material/Domain';
import { loginSchema, extractCommunitySubdomain } from '@apnasamaj/validation';
import { useAuth } from '../context/AuthContext';
import { getActiveCommunitySlug } from '../services/api.client';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const hostSlug = typeof window !== 'undefined' ? extractCommunitySubdomain(window.location.hostname) : null;
  const isDomainLocked = Boolean(hostSlug);

  const [communitySlug, setCommunitySlug] = useState<string>(() => {
    if (hostSlug) return hostSlug;
    return getActiveCommunitySlug() || 'kewat';
  });

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/profile';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});

    const validation = loginSchema.safeParse({ phone: phone.trim(), password });
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.issues.forEach((issue) => {
        const field = issue.path[0]?.toString() || 'form';
        if (!errors[field]) errors[field] = issue.message;
      });
      setFieldErrors(errors);
      return;
    }

    const effectiveCommunity = (isDomainLocked ? hostSlug : communitySlug)?.trim().toLowerCase();
    if (!effectiveCommunity) {
      setErrorMessage('Please select a community to sign in.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(validation.data.phone, validation.data.password, effectiveCommunity);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid credentials or login failure.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Container maxWidth="xs" sx={{ py: 8 }}>
      <Paper elevation={3} sx={{ p: { xs: 3, sm: 4 }, borderRadius: 3 }}>
        {/* Header */}
        <Box textAlign="center" mb={3}>
          <Box
            sx={{
              display: 'inline-flex',
              p: 1.5,
              borderRadius: '50%',
              bgcolor: 'primary.light',
              color: 'primary.main',
              mb: 1.5,
            }}
          >
            <LockOutlinedIcon sx={{ fontSize: 32 }} />
          </Box>
          <Typography variant="h5" component="h1" fontWeight="bold">
            Member Login
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Sign in to access your Apna Samaj portal
          </Typography>
        </Box>

        {errorMessage && (
          <Alert severity="error" sx={{ mb: 2.5 }}>
            {errorMessage}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          {/* Community Context Selection / Lock Badge */}
          {isDomainLocked ? (
            <Box display="flex" justifyContent="center" mb={2}>
              <Chip
                icon={<DomainIcon />}
                label={`${hostSlug?.toUpperCase()} Samaj`}
                color="primary"
                variant="outlined"
                sx={{ fontWeight: 600 }}
              />
            </Box>
          ) : (
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel id="community-select-label">Community</InputLabel>
              <Select
                labelId="community-select-label"
                id="community-select"
                value={communitySlug}
                label="Community"
                onChange={(e) => setCommunitySlug(e.target.value)}
                disabled={isSubmitting}
              >
                <MenuItem value="kewat">Kewat Samaj (kewat)</MenuItem>
                <MenuItem value="gupta">Gupta Samaj (gupta)</MenuItem>
              </Select>
            </FormControl>
          )}

          {/* Phone */}
          <TextField
            required
            fullWidth
            id="phone"
            name="phone"
            label="Phone Number"
            placeholder="e.g. 9876543210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={!!fieldErrors.phone}
            helperText={fieldErrors.phone}
            disabled={isSubmitting}
            autoFocus
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: <InputAdornment position="start">+91</InputAdornment>,
            }}
          />

          {/* Password */}
          <TextField
            required
            fullWidth
            id="password"
            name="password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={!!fieldErrors.password}
            helperText={fieldErrors.password}
            disabled={isSubmitting}
            sx={{ mb: 3 }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label="toggle password visibility"
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                    size="small"
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <Button
            type="submit"
            fullWidth
            variant="contained"
            color="primary"
            size="large"
            disabled={isSubmitting}
            startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : undefined}
            sx={{ py: 1.2, fontWeight: 600, borderRadius: 2 }}
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </Button>

          <Box textAlign="center" mt={3}>
            <Typography variant="body2" color="text.secondary">
              Don't have an account yet?{' '}
              <RouterLink to="/register" style={{ textDecoration: 'none', fontWeight: 600, color: '#1976d2' }}>
                Register here
              </RouterLink>
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};
