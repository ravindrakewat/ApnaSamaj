import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Container,
  Paper,
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  MenuItem,
  Grid,
  InputAdornment,
  IconButton,
  CircularProgress,
  Divider,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import { registerSchema, RegisterInput } from '@apnasamaj/validation';
import { useAuth } from '../context/AuthContext';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    password: '',
    confirmPassword: '',
    gender: '',
    city: '',
    state: '',
    subCaste: '',
    gotra: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear specific field error when user types
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const updated = { ...prev };
        delete updated[name];
        return updated;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setFieldErrors({});

    // Client-side password match check
    if (formData.password !== formData.confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match.' });
      return;
    }

    // Prepare payload
    const payload: RegisterInput = {
      fullName: formData.fullName.trim(),
      phone: formData.phone.trim(),
      password: formData.password,
      gender: formData.gender ? (formData.gender as 'MALE' | 'FEMALE' | 'OTHER') : undefined,
      city: formData.city.trim() || undefined,
      state: formData.state.trim() || undefined,
      subCaste: formData.subCaste.trim() || undefined,
      gotra: formData.gotra.trim() || undefined,
    };

    // Validate using Zod registerSchema
    const validationResult = registerSchema.safeParse(payload);
    if (!validationResult.success) {
      const errors: Record<string, string> = {};
      validationResult.error.issues.forEach((issue) => {
        const fieldName = issue.path[0]?.toString() || 'form';
        if (!errors[fieldName]) {
          errors[fieldName] = issue.message;
        }
      });
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      await register(validationResult.data);
      // On success, redirect to member profile
      navigate('/profile');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Paper elevation={3} sx={{ p: { xs: 3, sm: 5 }, borderRadius: 3 }}>
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
            <HowToRegIcon sx={{ fontSize: 36 }} />
          </Box>
          <Typography variant="h5" component="h1" fontWeight="bold">
            Create Member Account
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Join the Apna Samaj community portal
          </Typography>
        </Box>

        {/* Global Error Banner */}
        {submitError && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {submitError}
          </Alert>
        )}

        {/* Registration Form */}
        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Grid container spacing={2}>
            {/* Full Name */}
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                id="fullName"
                name="fullName"
                label="Full Name"
                placeholder="e.g. Ramesh Chandra"
                value={formData.fullName}
                onChange={handleChange}
                error={!!fieldErrors.fullName}
                helperText={fieldErrors.fullName}
                disabled={isSubmitting}
                autoFocus
              />
            </Grid>

            {/* Indian Phone Number */}
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                id="phone"
                name="phone"
                label="Mobile Phone Number"
                placeholder="e.g. 9876543210"
                value={formData.phone}
                onChange={handleChange}
                error={!!fieldErrors.phone}
                helperText={fieldErrors.phone || 'Enter a valid 10-digit Indian mobile number'}
                disabled={isSubmitting}
                InputProps={{
                  startAdornment: <InputAdornment position="start">+91</InputAdornment>,
                }}
              />
            </Grid>

            {/* Password */}
            <Grid item xs={12} sm={6}>
              <TextField
                required
                fullWidth
                id="password"
                name="password"
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleChange}
                error={!!fieldErrors.password}
                helperText={fieldErrors.password || 'Min 8 characters'}
                disabled={isSubmitting}
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
            </Grid>

            {/* Confirm Password */}
            <Grid item xs={12} sm={6}>
              <TextField
                required
                fullWidth
                id="confirmPassword"
                name="confirmPassword"
                label="Confirm Password"
                type={showPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={handleChange}
                error={!!fieldErrors.confirmPassword}
                helperText={fieldErrors.confirmPassword}
                disabled={isSubmitting}
              />
            </Grid>

            {/* Profile Foundation Details */}
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Community Profile (Optional)
                </Typography>
              </Divider>
            </Grid>

            {/* Gender */}
            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                id="gender"
                name="gender"
                label="Gender"
                value={formData.gender}
                onChange={handleChange}
                disabled={isSubmitting}
              >
                <MenuItem value="">
                  <em>Not specified</em>
                </MenuItem>
                <MenuItem value="MALE">Male</MenuItem>
                <MenuItem value="FEMALE">Female</MenuItem>
                <MenuItem value="OTHER">Other</MenuItem>
              </TextField>
            </Grid>

            {/* City */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                id="city"
                name="city"
                label="City"
                placeholder="e.g. Bhopal"
                value={formData.city}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </Grid>

            {/* State */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                id="state"
                name="state"
                label="State"
                placeholder="e.g. Madhya Pradesh"
                value={formData.state}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </Grid>

            {/* Sub-Caste */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                id="subCaste"
                name="subCaste"
                label="Sub-Caste"
                placeholder="e.g. Kewat"
                value={formData.subCaste}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </Grid>

            {/* Gotra */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                id="gotra"
                name="gotra"
                label="Gotra"
                placeholder="e.g. Kashyap"
                value={formData.gotra}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </Grid>

            {/* Submit Button */}
            <Grid item xs={12} sx={{ mt: 2 }}>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                fullWidth
                size="large"
                disabled={isSubmitting}
                startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : <HowToRegIcon />}
                sx={{ py: 1.2, fontWeight: 600, borderRadius: 2 }}
              >
                {isSubmitting ? 'Creating Account...' : 'Register as Member'}
              </Button>
            </Grid>
          </Grid>
        </Box>

        {/* Existing Member Link */}
        <Box textAlign="center" mt={3}>
          <Typography variant="body2" color="text.secondary">
            Already have an account?{' '}
            <RouterLink to="/login" style={{ textDecoration: 'none', fontWeight: 600, color: '#1976d2' }}>
              Sign In here
            </RouterLink>
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
};
