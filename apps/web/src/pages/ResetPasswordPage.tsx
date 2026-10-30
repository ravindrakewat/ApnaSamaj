import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link as RouterLink } from 'react-router-dom';
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
import LockResetIcon from '@mui/icons-material/LockReset';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import DomainIcon from '@mui/icons-material/Domain';
import { resetPasswordSchema, extractCommunitySubdomain } from '@apnasamaj/validation';
import { getActiveCommunitySlug } from '../services/api.client';
import { verifyResetTokenApi, resetPasswordApi } from '../services/auth.service';

type VerificationStatus = 'verifying' | 'valid' | 'invalid' | 'missing';

export const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const hostSlug = typeof window !== 'undefined' ? extractCommunitySubdomain(window.location.hostname) : null;
  const isDomainLocked = Boolean(hostSlug);

  const [communitySlug, setCommunitySlug] = useState<string>(() => {
    if (hostSlug) return hostSlug;
    return getActiveCommunitySlug() || 'kewat';
  });

  // Hold token strictly in volatile component state (never in localStorage or sessionStorage)
  const [token, setToken] = useState<string>('');
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('verifying');
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSuccess, setIsSuccess] = useState(false);

  const redirectTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;

    const rawToken = searchParams.get('token')?.trim() || '';

    if (!rawToken) {
      if (isMounted) {
        setVerificationStatus('missing');
        setVerificationError('No reset token provided. Please request a new password reset link.');
      }
      return;
    }

    setToken(rawToken);

    // Scrub token from the address bar to avoid accidental sharing, screen-shoulder surfing, or history leak
    if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('token');
        const cleaned = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : '');
        window.history.replaceState({}, document.title, cleaned);
      } catch {
        // Fallback safely if URL constructor is unavailable in test environment
      }
    }

    const effectiveCommunity = (isDomainLocked ? hostSlug : communitySlug)?.trim().toLowerCase();

    // Verify token preflight against backend API
    verifyResetTokenApi(rawToken, effectiveCommunity)
      .then((data) => {
        if (!isMounted) return;
        if (data.valid) {
          setVerificationStatus('valid');
        } else {
          setVerificationStatus('invalid');
          setVerificationError('This password reset link is invalid, has expired, or has already been used.');
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const msg =
          err instanceof Error
            ? err.message
            : 'This password reset link is invalid, has expired, or has already been used.';
        setVerificationStatus('invalid');
        setVerificationError(msg);
      });

    return () => {
      isMounted = false;
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || isSuccess) return;

    setSubmitError(null);
    setFieldErrors({});

    // Client-side password equality check
    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match.' });
      return;
    }

    // Client-side validation using Zod resetPasswordSchema
    const validation = resetPasswordSchema.safeParse({ token, newPassword });
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
      setSubmitError('Please select a community context to proceed.');
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPasswordApi({ token: validation.data.token, newPassword: validation.data.newPassword }, effectiveCommunity);
      setIsSuccess(true);
      // Cleanly zero out sensitive state
      setToken('');
      setNewPassword('');
      setConfirmPassword('');

      // Auto-redirect to login after 3 seconds
      redirectTimerRef.current = setTimeout(() => {
        navigate('/login', { replace: true });
      }, 3000);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to reset password. The link may have expired or is invalid.';
      setSubmitError(msg);
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
              bgcolor: isSuccess ? 'success.light' : 'primary.light',
              color: isSuccess ? 'success.main' : 'primary.main',
              mb: 1.5,
            }}
          >
            {isSuccess ? <CheckCircleOutlineIcon sx={{ fontSize: 32 }} /> : <LockResetIcon sx={{ fontSize: 32 }} />}
          </Box>
          <Typography variant="h5" component="h1" fontWeight="bold">
            {isSuccess ? 'Password Reset Successful' : 'Set New Password'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {isSuccess
              ? 'आपका पासवर्ड सफलतापूर्वक बदल दिया गया है'
              : 'अपने खाते के लिए एक नया और मजबूत पासवर्ड दर्ज करें'}
          </Typography>
        </Box>

        {/* 1. Verifying Token State */}
        {verificationStatus === 'verifying' && (
          <Box textAlign="center" py={4}>
            <CircularProgress size={36} sx={{ mb: 2 }} />
            <Typography variant="body1" color="text.secondary">
              Verifying your reset link...
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
              रीसेट लिंक का सत्यापन किया जा रहा है...
            </Typography>
          </Box>
        )}

        {/* 2. Missing Token State */}
        {verificationStatus === 'missing' && (
          <Box textAlign="center">
            <Alert icon={<ErrorOutlineIcon fontSize="inherit" />} severity="error" sx={{ mb: 3, textAlign: 'left' }}>
              {verificationError || 'No reset token provided. Please request a new password reset link.'}
            </Alert>
            <Button
              component={RouterLink}
              to="/forgot-password"
              variant="contained"
              color="primary"
              fullWidth
              sx={{ py: 1.2, fontWeight: 600, borderRadius: 2 }}
            >
              Request New Reset Link
            </Button>
            <Box textAlign="center" mt={2}>
              <RouterLink to="/login" style={{ textDecoration: 'none', fontSize: '0.875rem', color: '#1976d2' }}>
                Back to Sign In
              </RouterLink>
            </Box>
          </Box>
        )}

        {/* 3. Invalid or Expired Token State */}
        {verificationStatus === 'invalid' && (
          <Box textAlign="center">
            <Alert icon={<ErrorOutlineIcon fontSize="inherit" />} severity="error" sx={{ mb: 3, textAlign: 'left' }}>
              {verificationError ||
                'This password reset link is invalid, has expired, or has already been used.'}
            </Alert>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              पासवर्ड रीसेट लिंक अमान्य या समाप्त हो गया है। कृपया नया लिंक प्राप्त करने के लिए पुनः अनुरोध करें।
            </Typography>
            <Button
              component={RouterLink}
              to="/forgot-password"
              variant="contained"
              color="primary"
              fullWidth
              sx={{ py: 1.2, fontWeight: 600, borderRadius: 2, mb: 1.5 }}
            >
              Request New Reset Link
            </Button>
            <Button
              component={RouterLink}
              to="/login"
              variant="text"
              color="inherit"
              fullWidth
              sx={{ fontWeight: 500 }}
            >
              Back to Sign In
            </Button>
          </Box>
        )}

        {/* 4. Valid Token State (Show Form or Success State) */}
        {verificationStatus === 'valid' && (
          <>
            {isSuccess ? (
              <Box textAlign="center">
                <Alert severity="success" sx={{ mb: 3, textAlign: 'left' }}>
                  Password has been reset successfully. Redirecting you to sign in...
                </Alert>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  You can now log in using your registered mobile number and new password.
                </Typography>
                <Button
                  component={RouterLink}
                  to="/login"
                  variant="contained"
                  color="primary"
                  fullWidth
                  sx={{ py: 1.2, fontWeight: 600, borderRadius: 2 }}
                >
                  Proceed to Sign In Now
                </Button>
              </Box>
            ) : (
              <Box component="form" onSubmit={handleSubmit} noValidate>
                {submitError && (
                  <Alert severity="error" sx={{ mb: 2.5 }}>
                    {submitError}
                  </Alert>
                )}

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

                {/* New Password */}
                <TextField
                  required
                  fullWidth
                  id="newPassword"
                  name="newPassword"
                  label="New Password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (fieldErrors.newPassword) {
                      setFieldErrors((prev) => {
                        const copy = { ...prev };
                        delete copy.newPassword;
                        return copy;
                      });
                    }
                  }}
                  error={!!fieldErrors.newPassword}
                  helperText={fieldErrors.newPassword || 'At least 8 characters'}
                  disabled={isSubmitting}
                  autoFocus
                  sx={{ mb: 2 }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label="toggle new password visibility"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          edge="end"
                          size="small"
                        >
                          {showNewPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />

                {/* Confirm Password */}
                <TextField
                  required
                  fullWidth
                  id="confirmPassword"
                  name="confirmPassword"
                  label="Confirm New Password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (fieldErrors.confirmPassword) {
                      setFieldErrors((prev) => {
                        const copy = { ...prev };
                        delete copy.confirmPassword;
                        return copy;
                      });
                    }
                  }}
                  error={!!fieldErrors.confirmPassword}
                  helperText={fieldErrors.confirmPassword}
                  disabled={isSubmitting}
                  sx={{ mb: 3 }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label="toggle confirm password visibility"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          edge="end"
                          size="small"
                        >
                          {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
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
                  {isSubmitting ? 'Updating Password...' : 'Reset Password'}
                </Button>

                <Box textAlign="center" mt={3}>
                  <RouterLink to="/login" style={{ textDecoration: 'none', fontSize: '0.875rem', color: '#1976d2' }}>
                    Cancel and return to Sign In
                  </RouterLink>
                </Box>
              </Box>
            )}
          </>
        )}
      </Paper>
    </Container>
  );
};

