import React, { useState, useEffect, useRef } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  Divider,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DomainIcon from '@mui/icons-material/Domain';
import { phoneSchema, extractCommunitySubdomain } from '@apnasamaj/validation';
import { getActiveCommunitySlug } from '../services/api.client';
import { requestClaimOtpApi, verifyClaimOtpApi } from '../services/auth.service';

export const ClaimAccountPage: React.FC = () => {
  const { t } = useTranslation(['auth', 'common']);
  const navigate = useNavigate();

  const hostSlug =
    typeof window !== 'undefined' ? extractCommunitySubdomain(window.location.hostname) : null;
  const isDomainLocked = Boolean(hostSlug);

  const [communitySlug, setCommunitySlug] = useState<string>(() => {
    if (hostSlug) return hostSlug;
    return getActiveCommunitySlug() || 'kewat';
  });

  // Flow State: 1 = Request OTP, 2 = Verify OTP & Set Password, 3 = Success
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form Fields
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Password Visibility
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Cooldown timer (60 seconds)
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // UI State
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const startCooldown = () => {
    setCooldownSeconds(60);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const effectiveCommunity = (isDomainLocked ? hostSlug : communitySlug)?.trim().toLowerCase() || 'kewat';

  // 1. Request Claim OTP
  const handleRequestOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isRequestingOtp || cooldownSeconds > 0) return;

    setErrorMessage(null);
    setFieldErrors({});

    const phoneValidation = phoneSchema.safeParse(phone.trim());
    if (!phoneValidation.success) {
      setFieldErrors({ phone: phoneValidation.error.issues[0]?.message || 'Please enter a valid 10-digit mobile number.' });
      return;
    }

    setIsRequestingOtp(true);
    try {
      const res = await requestClaimOtpApi(phoneValidation.data, effectiveCommunity);
      setInfoMessage(
        res.message ||
          'If an eligible account is associated with this mobile number, an activation code has been sent.'
      );
      startCooldown();
      setStep(2);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to request activation code. Please try again.';
      setErrorMessage(msg);
    } finally {
      setIsRequestingOtp(false);
    }
  };

  // 2. Verify OTP & Set Password
  const handleVerifyAndClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isVerifying) return;

    setErrorMessage(null);
    setFieldErrors({});

    const errors: Record<string, string> = {};

    // Validate OTP (6 digits)
    if (!otp.trim()) {
      errors.otp = 'Please enter the 6-digit activation code.';
    } else if (!/^\d{6}$/.test(otp.trim())) {
      errors.otp = 'Activation code must be exactly 6 digits.';
    }

    // Validate Password
    if (!newPassword) {
      errors.newPassword = 'Password is required.';
    } else if (newPassword.length < 8) {
      errors.newPassword = 'Password must be at least 8 characters long.';
    }

    // Validate Confirm Password
    if (!confirmPassword) {
      errors.confirmPassword = 'Confirm your password.';
    } else if (newPassword !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsVerifying(true);
    try {
      await verifyClaimOtpApi(
        {
          phone: phone.trim(),
          otp: otp.trim(),
          newPassword,
        },
        effectiveCommunity
      );

      // Scrub volatile password fields
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
      setStep(3);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Invalid or expired activation code. Please check your code or request a new one.';
      setErrorMessage(msg);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Container maxWidth="xs" sx={{ py: 6 }}>
      <Paper elevation={3} sx={{ p: { xs: 3, sm: 4 }, borderRadius: 3 }}>
        {/* Header Icon */}
        <Box textAlign="center" mb={2.5}>
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
            {step === 3 ? (
              <CheckCircleOutlineIcon sx={{ fontSize: 36, color: 'success.main' }} />
            ) : (
              <HowToRegIcon sx={{ fontSize: 36 }} />
            )}
          </Box>
          <Typography variant="h5" component="h1" fontWeight="bold">
            {step === 3 ? t('auth:claimSuccessTitle') : t('auth:claimTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {step === 3 ? t('auth:claimSuccessMessage') : t('auth:claimSubtitle')}
          </Typography>
        </Box>

        {/* Alerts */}
        {errorMessage && (
          <Alert severity="error" sx={{ mb: 2.5 }} onClose={() => setErrorMessage(null)}>
            {errorMessage}
          </Alert>
        )}

        {infoMessage && step === 2 && (
          <Alert severity="info" sx={{ mb: 2.5 }} onClose={() => setInfoMessage(null)}>
            {infoMessage}
          </Alert>
        )}

        {/* Community Context Selection / Lock Badge */}
        {step !== 3 && (
          <Box mb={2}>
            {isDomainLocked ? (
              <Box display="flex" justifyContent="center">
                <Chip
                  icon={<DomainIcon />}
                  label={`${hostSlug?.toUpperCase()} Samaj`}
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 600 }}
                />
              </Box>
            ) : (
              <FormControl fullWidth size="small">
                <InputLabel id="claim-community-label">Community</InputLabel>
                <Select
                  labelId="claim-community-label"
                  id="claim-community-select"
                  value={communitySlug}
                  label="Community"
                  onChange={(e) => setCommunitySlug(e.target.value)}
                  disabled={isRequestingOtp || isVerifying || step === 2}
                >
                  <MenuItem value="kewat">Kewat Samaj (kewat)</MenuItem>
                  <MenuItem value="gupta">Gupta Samaj (gupta)</MenuItem>
                </Select>
              </FormControl>
            )}
          </Box>
        )}

        {/* ================================================================= */}
        {/* STEP 1: Enter Phone Number & Request OTP                          */}
        {/* ================================================================= */}
        {step === 1 && (
          <Box component="form" onSubmit={handleRequestOtp} noValidate>
            <TextField
              required
              fullWidth
              id="phone"
              name="phone"
              label={t('auth:phone')}
              placeholder="e.g. 9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              error={!!fieldErrors.phone}
              helperText={fieldErrors.phone}
              disabled={isRequestingOtp}
              autoFocus
              sx={{ mb: 2.5 }}
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
              disabled={isRequestingOtp}
              startIcon={isRequestingOtp ? <CircularProgress size={20} color="inherit" /> : undefined}
              sx={{ py: 1.2, fontWeight: 600, borderRadius: 2 }}
            >
              {isRequestingOtp ? 'Sending Code...' : t('auth:requestOtpButton')}
            </Button>
          </Box>
        )}

        {/* ================================================================= */}
        {/* STEP 2: Enter OTP & Set New Password                              */}
        {/* ================================================================= */}
        {step === 2 && (
          <Box component="form" onSubmit={handleVerifyAndClaim} noValidate>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Mobile: <strong>+91 {phone}</strong>
            </Typography>

            {/* OTP Field */}
            <TextField
              required
              fullWidth
              id="otp"
              name="otp"
              label={t('auth:enterOtp')}
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              error={!!fieldErrors.otp}
              helperText={fieldErrors.otp || t('auth:otpHelperText')}
              disabled={isVerifying}
              autoFocus
              inputProps={{ maxLength: 6, inputMode: 'numeric' }}
              sx={{ mb: 2 }}
            />

            {/* New Password */}
            <TextField
              required
              fullWidth
              id="newPassword"
              name="newPassword"
              label={t('auth:newPassword')}
              type={showNewPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              error={!!fieldErrors.newPassword}
              helperText={fieldErrors.newPassword || 'At least 8 characters'}
              disabled={isVerifying}
              sx={{ mb: 2 }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
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
              label={t('auth:confirmPassword')}
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={!!fieldErrors.confirmPassword}
              helperText={fieldErrors.confirmPassword}
              disabled={isVerifying}
              sx={{ mb: 2.5 }}
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
              disabled={isVerifying}
              startIcon={isVerifying ? <CircularProgress size={20} color="inherit" /> : undefined}
              sx={{ py: 1.2, fontWeight: 600, borderRadius: 2, mb: 1.5 }}
            >
              {isVerifying ? 'Activating Account...' : t('auth:claimButton')}
            </Button>

            {/* Resend OTP */}
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Button
                size="small"
                color="secondary"
                onClick={() => setStep(1)}
                disabled={isVerifying}
                sx={{ textTransform: 'none' }}
              >
                Change Phone
              </Button>

              <Button
                size="small"
                color="primary"
                onClick={() => handleRequestOtp()}
                disabled={isRequestingOtp || cooldownSeconds > 0 || isVerifying}
                sx={{ textTransform: 'none' }}
              >
                {cooldownSeconds > 0
                  ? `${t('auth:resendOtpIn')} ${cooldownSeconds}s`
                  : 'Resend Code'}
              </Button>
            </Box>
          </Box>
        )}

        {/* ================================================================= */}
        {/* STEP 3: Success Screen                                            */}
        {/* ================================================================= */}
        {step === 3 && (
          <Box display="flex" flexDirection="column" gap={2} mt={2}>
            <Alert severity="success" sx={{ borderRadius: 2 }}>
              Your account has been claimed and activated. Please log in using your phone number and new password.
            </Alert>

            <Button
              fullWidth
              variant="contained"
              color="primary"
              size="large"
              onClick={() => navigate('/login')}
              sx={{ py: 1.2, fontWeight: 600, borderRadius: 2, mt: 1 }}
            >
              {t('auth:goToLogin')}
            </Button>
          </Box>
        )}

        <Divider sx={{ my: 3 }} />

        {/* Footer Navigation */}
        <Box textAlign="center">
          <RouterLink
            to="/login"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              textDecoration: 'none',
              fontWeight: 500,
              fontSize: '0.875rem',
              color: '#1976d2',
            }}
          >
            <ArrowBackIcon sx={{ fontSize: 16, mr: 0.5 }} />
            Back to Login
          </RouterLink>
        </Box>
      </Paper>
    </Container>
  );
};

export default ClaimAccountPage;

