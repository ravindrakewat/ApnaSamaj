import React, { useState, useEffect, useCallback } from 'react';
import {
  Container,
  Box,
  Typography,
  TextField,
  InputAdornment,
  IconButton,
  Button,
  Chip,
  Stack,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Grid,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import AddIcon from '@mui/icons-material/Add';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useAuth } from '../context/AuthContext';
import {
  employmentService,
  ParsedJobListing,
  CreateJobPayload,
  EMPLOYMENT_LOCATIONS,
  EMPLOYMENT_TYPES,
} from '../services/employment.service';
import { JobCard } from '../components/JobCard';

export const EmploymentPage: React.FC = () => {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'ALL' | 'MY_JOBS'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');

  const [jobs, setJobs] = useState<ParsedJobListing[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Job Creation Modal State
  const [createDialogOpen, setCreateDialogOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateJobPayload>({
    title: '',
    company: '',
    location: 'Indore',
    salary: '',
    experience: '',
    employmentType: 'Full-time',
    description: '',
    contactInfo: '',
  });

  const loadJobs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await employmentService.listJobs({
        search: searchQuery.trim() || undefined,
        location: selectedLocation !== 'ALL' ? selectedLocation : undefined,
        authorId: activeTab === 'MY_JOBS' && user?.id ? user.id : undefined,
      });
      setJobs(res.jobs);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'रोजगार अवसर लोड करने में विफल / Failed to load job listings');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedLocation, activeTab, user?.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadJobs();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadJobs]);

  const handleCreateJob = async () => {
    if (!formData.title.trim()) {
      setCreateError('पद का नाम (Job Title) आवश्यक है / Job Title is required');
      return;
    }
    if (!formData.description.trim()) {
      setCreateError('कार्य विवरण (Job Description) आवश्यक है / Description is required');
      return;
    }

    setIsSubmitting(true);
    setCreateError(null);
    try {
      await employmentService.createJob(formData);
      setCreateDialogOpen(false);
      setFormData({
        title: '',
        company: '',
        location: 'Indore',
        salary: '',
        experience: '',
        employmentType: 'Full-time',
        description: '',
        contactInfo: '',
      });
      loadJobs();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'रोजगार पोस्ट करने में विफल / Failed to post job');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {/* Page Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2} mb={3}>
        <Box>
          <Box display="flex" alignItems="center" gap={1.5}>
            <WorkOutlineIcon color="primary" sx={{ fontSize: 32 }} />
            <Typography variant="h4" component="h1" fontWeight="bold">
              रोजगार अवसर / Employment & Jobs
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            समाज के युवाओं व पेशेवरों के लिए उपलब्ध नौकरियां एवं व्यावसायिक अवसर
          </Typography>
        </Box>

        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
        >
          नौकरी पोस्ट करें / Post a Job
        </Button>
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, val) => setActiveTab(val)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="ALL" label="सभी नौकरियां / All Opportunities" sx={{ textTransform: 'none', fontWeight: 600 }} />
        {user && (
          <Tab value="MY_JOBS" label="मेरी पोस्टिंग्स / My Job Posts" sx={{ textTransform: 'none', fontWeight: 600 }} />
        )}
      </Tabs>

      {/* Search and Location Filter Bar */}
      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="पद, कंपनी, कौशल या स्थान खोजें... / Search jobs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
            endAdornment: searchQuery ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearchQuery('')}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
          sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />

        {/* Location Chips */}
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {EMPLOYMENT_LOCATIONS.map((loc) => (
            <Chip
              key={loc}
              label={loc === 'ALL' ? 'सभी स्थान / All Cities' : loc}
              clickable
              color={selectedLocation === loc ? 'primary' : 'default'}
              variant={selectedLocation === loc ? 'filled' : 'outlined'}
              onClick={() => setSelectedLocation(loc)}
              sx={{ fontWeight: selectedLocation === loc ? 600 : 400 }}
            />
          ))}
        </Stack>
      </Box>

      {/* Error State */}
      {error && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={loadJobs} startIcon={<RefreshIcon />}>
              पुनः प्रयास करें / Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {/* Loading Skeletons */}
      {isLoading && (
        <Stack spacing={2}>
          {[1, 2, 3].map((k) => (
            <Skeleton key={k} variant="rounded" height={160} sx={{ borderRadius: 3 }} />
          ))}
        </Stack>
      )}

      {/* Empty State */}
      {!isLoading && !error && jobs.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, bgcolor: '#f8fafc', borderRadius: 3, p: 4 }}>
          <WorkOutlineIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="h6" fontWeight={600} color="text.secondary">
            कोई नौकरी नहीं मिली / No Job Openings Found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
            {searchQuery || selectedLocation !== 'ALL'
              ? 'कृपया अपने खोज मापदंड या स्थान फ़िल्टर बदल कर देखें।'
              : 'वर्तमान में कोई सक्रिय रोजगार पोस्टिंग उपलब्ध नहीं है।'}
          </Typography>
          <Button variant="outlined" color="primary" onClick={() => setCreateDialogOpen(true)}>
            पहली नौकरी पोस्ट करें / Post First Job
          </Button>
        </Box>
      )}

      {/* Jobs List */}
      {!isLoading && !error && jobs.length > 0 && (
        <Stack spacing={2.5}>
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </Stack>
      )}

      {/* Create Job Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => !isSubmitting && setCreateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          नया रोजगार अवसर पोस्ट करें / Post Job Opportunity
        </DialogTitle>
        <DialogContent dividers>
          {createError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {createError}
            </Alert>
          )}

          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="पद का नाम / Job Title *"
                placeholder="उदा. Senior Software Engineer, Accountant, Sales Manager"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                disabled={isSubmitting}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="कंपनी या फर्म / Company or Business"
                placeholder="उदा. Infosys, Sharma Automobiles"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                disabled={isSubmitting}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                size="small"
                label="स्थान / Location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                disabled={isSubmitting}
              >
                {EMPLOYMENT_LOCATIONS.filter((l) => l !== 'ALL').map((loc) => (
                  <MenuItem key={loc} value={loc}>
                    {loc}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="वेतन / Salary (CTC or Monthly)"
                placeholder="उदा. ₹25,000 - ₹35,000 / माह या Negotiable"
                value={formData.salary}
                onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                disabled={isSubmitting}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                size="small"
                label="रोजगार का प्रकार / Employment Type"
                value={formData.employmentType}
                onChange={(e) => setFormData({ ...formData, employmentType: e.target.value })}
                disabled={isSubmitting}
              >
                {EMPLOYMENT_TYPES.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="आवश्यक अनुभव / Required Experience"
                placeholder="उदा. Fresher, 1-3 वर्ष, 5+ Years"
                value={formData.experience}
                onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                disabled={isSubmitting}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="संपर्क सूत्र / Contact (Email/Phone)"
                placeholder="उदा. hr@example.com या 9876543210"
                value={formData.contactInfo}
                onChange={(e) => setFormData({ ...formData, contactInfo: e.target.value })}
                disabled={isSubmitting}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={4}
                label="कार्य विवरण व आवश्यकताएं / Description & Responsibilities *"
                placeholder="कार्य की जिम्मेदारियां, योग्यता, समय, आदि का विस्तृत विवरण लिखें..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                disabled={isSubmitting}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setCreateDialogOpen(false)} disabled={isSubmitting}>
            रद्द करें / Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleCreateJob}
            disabled={isSubmitting}
            startIcon={isSubmitting ? <CircularProgress size={18} /> : null}
          >
            {isSubmitting ? 'पोस्ट हो रहा है...' : 'पोस्ट करें / Post Job'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};
