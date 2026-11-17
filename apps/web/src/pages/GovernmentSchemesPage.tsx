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
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useAuth } from '../context/AuthContext';
import {
  governmentSchemesService,
  ParsedGovernmentScheme,
  CreateGovernmentSchemePayload,
  SCHEME_CATEGORIES,
  SCHEME_LOCATIONS,
} from '../services/government-schemes.service';
import { SchemeCard } from '../components/SchemeCard';

export const GovernmentSchemesPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'COMMUNITY_ADMIN' || user?.role === 'MODERATOR';

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');

  const [schemes, setSchemes] = useState<ParsedGovernmentScheme[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog State
  const [createDialogOpen, setCreateDialogOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateGovernmentSchemePayload>({
    title: '',
    department: '',
    category: 'EDUCATION',
    targetBeneficiaries: '',
    eligibility: '',
    ageCriteria: '',
    incomeCriteria: '',
    benefits: '',
    requiredDocuments: [],
    applicationProcess: '',
    deadline: '',
    officialWebsite: '',
    helpline: '',
    locationState: 'Madhya Pradesh',
    description: '',
  });

  const [documentsInput, setDocumentsInput] = useState<string>('');

  const loadSchemes = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await governmentSchemesService.listSchemes({
        search: searchQuery.trim() || undefined,
        category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
        locationState: selectedLocation !== 'ALL' ? selectedLocation : undefined,
      });
      setSchemes(res.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'योजनाएं लोड करने में विफल / Failed to load schemes');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedCategory, selectedLocation]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadSchemes();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadSchemes]);

  const handleCreateScheme = async () => {
    if (!formData.title.trim()) {
      setCreateError('योजना का नाम (Scheme Title) आवश्यक है');
      return;
    }
    if (!formData.description.trim()) {
      setCreateError('योजना का विवरण (Description) आवश्यक है');
      return;
    }

    const docs = documentsInput
      .split(/[,|]/)
      .map((d) => d.trim())
      .filter(Boolean);

    setIsSubmitting(true);
    setCreateError(null);
    try {
      await governmentSchemesService.createScheme({
        ...formData,
        requiredDocuments: docs,
      });
      setCreateDialogOpen(false);
      setFormData({
        title: '',
        department: '',
        category: 'EDUCATION',
        targetBeneficiaries: '',
        eligibility: '',
        ageCriteria: '',
        incomeCriteria: '',
        benefits: '',
        requiredDocuments: [],
        applicationProcess: '',
        deadline: '',
        officialWebsite: '',
        helpline: '',
        locationState: 'Madhya Pradesh',
        description: '',
      });
      setDocumentsInput('');
      loadSchemes();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'योजना जोड़ने में विफल');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2} mb={3}>
        <Box>
          <Box display="flex" alignItems="center" gap={1.5}>
            <AccountBalanceIcon color="primary" sx={{ fontSize: 32 }} />
            <Typography variant="h4" component="h1" fontWeight="bold">
              सरकारी योजनाएं / Government Welfare Schemes
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            केंद्र एवं राज्य सरकार की जनकल्याणकारी, छात्रवृत्ति, एवं व्यवसायिक अनुदान योजनाएं
          </Typography>
        </Box>

        {isAdmin && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            नई योजना जोड़ें / Add Scheme
          </Button>
        )}
      </Box>

      {/* Search Input */}
      <Box sx={{ mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="योजना, विभाग, छात्रवृत्ति या लाभ खोजें... / Search schemes..."
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

        {/* Category Chips */}
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
          {SCHEME_CATEGORIES.map((cat) => (
            <Chip
              key={cat.key}
              label={cat.labelHi}
              clickable
              color={selectedCategory === cat.key ? 'primary' : 'default'}
              variant={selectedCategory === cat.key ? 'filled' : 'outlined'}
              onClick={() => setSelectedCategory(cat.key)}
              sx={{ fontWeight: selectedCategory === cat.key ? 600 : 400 }}
            />
          ))}
        </Stack>

        {/* State/Location Filters */}
        <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            स्थान / क्षेत्र:
          </Typography>
          {SCHEME_LOCATIONS.map((loc) => (
            <Chip
              key={loc.key}
              size="small"
              label={loc.labelHi}
              clickable
              color={selectedLocation === loc.key ? 'secondary' : 'default'}
              variant={selectedLocation === loc.key ? 'filled' : 'outlined'}
              onClick={() => setSelectedLocation(loc.key)}
              sx={{ fontWeight: selectedLocation === loc.key ? 600 : 400 }}
            />
          ))}
        </Box>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={loadSchemes} startIcon={<RefreshIcon />}>
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
      {!isLoading && !error && schemes.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, bgcolor: '#f8fafc', borderRadius: 3, p: 4 }}>
          <AccountBalanceIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="h6" fontWeight={600} color="text.secondary">
            कोई सरकारी योजना नहीं मिली / No Schemes Found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {searchQuery || selectedCategory !== 'ALL' || selectedLocation !== 'ALL'
              ? 'कृपया अपने खोज मापदंड या श्रेणी फ़िल्टर बदलकर पुनः प्रयास करें।'
              : 'वर्तमान में कोई सक्रिय योजनाएं सूचीबद्ध नहीं हैं।'}
          </Typography>
        </Box>
      )}

      {/* Schemes List */}
      {!isLoading && !error && schemes.length > 0 && (
        <Stack spacing={2.5}>
          {schemes.map((scheme) => (
            <SchemeCard key={scheme.id} scheme={scheme} />
          ))}
        </Stack>
      )}

      {/* Add Scheme Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => !isSubmitting && setCreateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          नई जनकल्याण योजना जोड़ें / Add Government Scheme
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
                label="योजना का नाम / Scheme Name *"
                placeholder="उदा. मुख्यमंत्री मेधावी विद्यार्थी योजना, पीएम स्वनिधि"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                disabled={isSubmitting}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="विभाग या मंत्रालय / Department"
                placeholder="उदा. उच्च शिक्षा विभाग, म.प्र. शासन"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                disabled={isSubmitting}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                size="small"
                label="श्रेणी / Category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                disabled={isSubmitting}
              >
                {SCHEME_CATEGORIES.filter((c) => c.key !== 'ALL').map((cat) => (
                  <MenuItem key={cat.key} value={cat.key}>
                    {cat.labelHi}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                size="small"
                label="स्थान / राज्य / Location"
                value={formData.locationState}
                onChange={(e) => setFormData({ ...formData, locationState: e.target.value })}
                disabled={isSubmitting}
              >
                {SCHEME_LOCATIONS.filter((l) => l.key !== 'ALL').map((loc) => (
                  <MenuItem key={loc.key} value={loc.key}>
                    {loc.labelHi}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="लक्षित लाभार्थी / Target Group"
                placeholder="उदा. 12वीं उत्तीर्ण छात्र, लघु उद्यमी, महिलाएं"
                value={formData.targetBeneficiaries}
                onChange={(e) => setFormData({ ...formData, targetBeneficiaries: e.target.value })}
                disabled={isSubmitting}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="पात्रता मानदंड / Eligibility Criteria"
                placeholder="उदा. 70% अंक, मध्य प्रदेश का मूल निवासी, आय 6 लाख से कम"
                value={formData.eligibility}
                onChange={(e) => setFormData({ ...formData, eligibility: e.target.value })}
                disabled={isSubmitting}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="मिलने वाले लाभ / Key Benefits"
                placeholder="उदा. उच्च शिक्षा की 100% ट्यूशन फीस शासन द्वारा वहन"
                value={formData.benefits}
                onChange={(e) => setFormData({ ...formData, benefits: e.target.value })}
                disabled={isSubmitting}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="आवश्यक दस्तावेज (अल्पविराम से अलग करें) / Documents Required"
                placeholder="उदा. आधार कार्ड, 12वीं अंकसूची, मूल निवासी प्रमाण पत्र, आय प्रमाण पत्र"
                value={documentsInput}
                onChange={(e) => setDocumentsInput(e.target.value)}
                disabled={isSubmitting}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="आधिकारिक वेबसाइट / Official Website URL"
                placeholder="उदा. https://scholarshipportal.mp.nic.in"
                value={formData.officialWebsite}
                onChange={(e) => setFormData({ ...formData, officialWebsite: e.target.value })}
                disabled={isSubmitting}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="हेल्पलाइन / Helpline Phone/Email"
                placeholder="उदा. 0755-2660064 या 181"
                value={formData.helpline}
                onChange={(e) => setFormData({ ...formData, helpline: e.target.value })}
                disabled={isSubmitting}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={4}
                label="योजना का संपूर्ण विवरण एवं आवेदन प्रक्रिया / Description & Process *"
                placeholder="योजना के नियम, लाभ, प्रक्रिया एवं दिशा-निर्देश का विस्तृत विवरण लिखें..."
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
            onClick={handleCreateScheme}
            disabled={isSubmitting}
            startIcon={isSubmitting ? <CircularProgress size={18} /> : null}
          >
            {isSubmitting ? 'जोड़ा जा रहा है...' : 'योजना जोड़ें / Add Scheme'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};
