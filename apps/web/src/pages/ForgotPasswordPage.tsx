import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Container,
  Paper,
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  InputAdornment,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
} from '@mui/material';
import LockResetIcon from '@mui/icons-material/LockReset';
import DomainIcon from '@mui/icons-material/Domain';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { forgotPasswordSchema, extractCommunitySubdomain } from '@apnasamaj/validation';
import { getActiveCommunitySlug } from '../services/api.client';
import { forgotPasswordApi } from '../services/auth.service';

export const ForgotPasswordPage: React.FC = () => {
  const hostSlug = typeof window !== 'undefined' ? extractCommunitySubdomain(window.location.hostname) : null;
  const isDomainLocked = Boolean(hostSlug);

  const [communitySlug, setCommunitySlug] = useState<string>(() => {
    if (hostSlug) return hostSlug;
    return getActiveCommunitySlug() || 'kewat';
  });

  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setErrorMessage(null);
    setFieldErrors({});

    const validation = forgotPasswordSchema.safeParse({ phone: phone.trim() });
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
      setErrorMessage('Please select a community context to proceed.');
      return;
    }

    setIsSubmitting(true);
    try {
      await forgotPasswordApi(validation.data.phone, effectiveCommunity);
      setIsSubmitted(true);
    } catch (err: unknown) {
      // Even if an unexpected client/network error occurs, provide a safe user-facing message
      // without disclosing account existence or raw exceptions
      const msg = err instanceof Error ? err.message : 'Unable to complete request. Please try again.';
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
            <LockResetIcon sx={{ fontSize: 32 }} />
          </Box>
          <Typography variant="h5" component="h1" fontWeight="bold">
            Forgot Password
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            पासवर्ड रीसेट करने के लिए अपना पंजीकृत मोबाइल नंबर दर्ज करें
          </Typography>
        </Box>

        {isSubmitted ? (
          <Box textAlign="center">
            <Alert
              icon={<CheckCircleOutlineIcon fontSize="inherit" />}
              severity="success"
              sx={{ mb: 3, textAlign: 'left' }}
            >
              If an account is associated with this phone number, password reset instructions have been sent.
              Please check your SMS messages.
            </Alert>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              यदि इस नंबर से कोई खाता जुड़ा है, तो एसएमएस के माध्यम से पासवर्ड रीसेट लिंक भेज दिया गया है।
            </Typography>
            <Button
              component={RouterLink}
              to="/login"
              variant="contained"
              color="primary"
              fullWidth
              startIcon={<ArrowBackIcon />}
              sx={{ py: 1.2, fontWeight: 600, borderRadius: 2 }}
            >
              Back to Sign In
            </Button>
          </Box>
        ) : (
          <Box component="form" onSubmit={handleSubmit} noValidate>
            {errorMessage && (
              <Alert severity="error" sx={{ mb: 2.5 }}>
                {errorMessage}
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

            {/* Phone */}
            <TextField
              required
              fullWidth
              id="phone"
              name="phone"
              label="Registered Phone Number"
              placeholder="e.g. 9876543210"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (fieldErrors.phone) {
                  setFieldErrors((prev) => {
                    const copy = { ...prev };
                    delete copy.phone;
                    return copy;
                  });
                }
              }}
              error={!!fieldErrors.phone}
              helperText={fieldErrors.phone || 'Enter your 10-digit mobile number'}
              disabled={isSubmitting}
              autoFocus
              sx={{ mb: 3 }}
              InputProps={{
                startAdornment: <InputAdornment position="start">+91</InputAdornment>,
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
              {isSubmitting ? 'Sending Instructions...' : 'Send Reset Link'}
            </Button>

            <Box textAlign="center" mt={3}>
              <Typography variant="body2" color="text.secondary">
                Remember your password?{' '}
                <RouterLink to="/login" style={{ textDecoration: 'none', fontWeight: 600, color: '#1976d2' }}>
                  Sign in here
                </RouterLink>
              </Typography>
            </Box>
          </Box>
        )}
      </Paper>
    </Container>
  );
};

