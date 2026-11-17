import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  Avatar,
  Stack,
  Divider,
  CircularProgress,
  Alert,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import LaunchIcon from '@mui/icons-material/Launch';
import PhoneIcon from '@mui/icons-material/Phone';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import GroupIcon from '@mui/icons-material/Group';
import EventIcon from '@mui/icons-material/Event';
import ShareIcon from '@mui/icons-material/Share';
import DeleteIcon from '@mui/icons-material/Delete';
import { useAuth } from '../context/AuthContext';
import {
  governmentSchemesService,
  ParsedGovernmentScheme,
  SCHEME_CATEGORIES,
  validateOfficialUrl,
} from '../services/government-schemes.service';
import { resolveAttachmentDisplayUrl } from '../utils/attachment';

export const SchemeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [scheme, setScheme] = useState<ParsedGovernmentScheme | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    governmentSchemesService
      .getSchemeById(id)
      .then((data) => setScheme(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'योजना विवरण लोड करने में असमर्थ'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: scheme?.title,
        text: `${scheme?.title} - Apna Samaj Welfare Schemes`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setShareMsg('लिंक क्लिपबोर्ड पर कॉपी हो गया! / Link copied to clipboard!');
      setTimeout(() => setShareMsg(null), 3000);
    }
  };

  const handleDeleteScheme = async () => {
    if (!scheme) return;
    setIsDeleting(true);
    try {
      await governmentSchemesService.deleteScheme(scheme.id);
      navigate('/government-schemes');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'हटाने में विफल');
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ py: 6, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (error || !scheme) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/government-schemes')} sx={{ mb: 2 }}>
          वापस जाएं / Back to Schemes
        </Button>
        <Alert severity="error">{error || 'Scheme not found'}</Alert>
      </Container>
    );
  }

  const isAuthor = user?.id === scheme.authorId;
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'COMMUNITY_ADMIN' || user?.role === 'MODERATOR';
  const canDelete = isAuthor || isAdmin;

  const categoryObj = SCHEME_CATEGORIES.find((c) => c.key === scheme.category);
  const categoryLabel = categoryObj ? categoryObj.labelHi : scheme.category;
  const officialUrlCheck = scheme.officialWebsite ? validateOfficialUrl(scheme.officialWebsite) : null;

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {/* Top Navigation Bar */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/government-schemes')}
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          सभी योजनाएं / All Schemes
        </Button>

        <Stack direction="row" spacing={1}>
          <IconButton onClick={handleShare} title="Share scheme">
            <ShareIcon />
          </IconButton>
          {canDelete && (
            <IconButton color="error" onClick={() => setDeleteDialogOpen(true)} title="Delete scheme">
              <DeleteIcon />
            </IconButton>
          )}
        </Stack>
      </Box>

      {shareMsg && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setShareMsg(null)}>
          {shareMsg}
        </Alert>
      )}

      {/* Main Scheme Content Paper */}
      <Paper elevation={2} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 3, mb: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2} mb={2}>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: 'secondary.light', color: 'secondary.main', width: 56, height: 56 }}>
              <AccountBalanceIcon fontSize="medium" />
            </Avatar>
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
                {scheme.department}
              </Typography>
              <Typography variant="h5" fontWeight={700}>
                {scheme.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                क्षेत्र / स्थान: {scheme.locationState}
              </Typography>
            </Box>
          </Box>

          <Chip
            label={categoryLabel}
            color="primary"
            variant="filled"
            sx={{ fontWeight: 600, px: 1, py: 0.5, borderRadius: 2 }}
          />
        </Box>

        {/* Highlights Row */}
        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ my: 2 }}>
          <Chip
            icon={<GroupIcon />}
            label={`लक्षित वर्ग: ${scheme.targetBeneficiaries}`}
            sx={{ bgcolor: '#f1f5f9', fontWeight: 500 }}
          />
          <Chip
            icon={<LocationOnIcon />}
            label={`राज्य: ${scheme.locationState}`}
            sx={{ bgcolor: '#f8fafc', fontWeight: 500 }}
          />
          {scheme.deadline && (
            <Chip
              icon={<EventIcon />}
              label={`अंतिम तिथि: ${scheme.deadline}`}
              color="warning"
              variant="outlined"
              sx={{ fontWeight: 600 }}
            />
          )}
        </Stack>

        {/* Key Benefits Highlight Box */}
        {scheme.benefits && (
          <Box sx={{ bgcolor: '#f0fdf4', border: '1px solid #bbf7d0', p: 2.5, borderRadius: 2.5, my: 3 }}>
            <Typography variant="subtitle2" fontWeight={700} color="#166534" gutterBottom>
              ✨ मिलने वाले लाभ एवं सहायता / Scheme Benefits:
            </Typography>
            <Typography variant="body1" color="#15803d" sx={{ fontWeight: 500, lineHeight: 1.7 }}>
              {scheme.benefits}
            </Typography>
          </Box>
        )}

        {/* Eligibility Criteria */}
        {scheme.eligibility && (
          <Box sx={{ my: 3 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>
              पात्रता मानदंड / Eligibility Criteria:
            </Typography>
            <Typography variant="body1" color="text.primary" sx={{ lineHeight: 1.8, bgcolor: '#f8fafc', p: 2, borderRadius: 2 }}>
              {scheme.eligibility}
            </Typography>
            {(scheme.ageCriteria || scheme.incomeCriteria) && (
              <Stack direction="row" spacing={1.5} mt={1.5} flexWrap="wrap" useFlexGap>
                {scheme.ageCriteria && (
                  <Chip label={`आयु सीमा: ${scheme.ageCriteria}`} variant="outlined" sx={{ fontWeight: 500 }} />
                )}
                {scheme.incomeCriteria && (
                  <Chip label={`आय सीमा: ${scheme.incomeCriteria}`} variant="outlined" sx={{ fontWeight: 500 }} />
                )}
              </Stack>
            )}
          </Box>
        )}

        {/* Required Documents */}
        {scheme.requiredDocuments.length > 0 && (
          <Box sx={{ my: 3 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>
              आवश्यक दस्तावेज / Required Documents:
            </Typography>
            <List dense disablePadding>
              {scheme.requiredDocuments.map((doc, idx) => (
                <ListItem key={idx} disableGutters sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CheckCircleOutlineIcon color="primary" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary={doc} />
                </ListItem>
              ))}
            </List>
          </Box>
        )}

        <Divider sx={{ my: 3 }} />

        {/* Full Description & Application Process */}
        <Typography variant="h6" fontWeight={700} gutterBottom>
          विस्तृत विवरण एवं आवेदन प्रक्रिया / How to Apply:
        </Typography>
        <Typography variant="body1" sx={{ whiteSpace: 'pre-line', lineHeight: 1.8, color: '#334155', mb: 3 }}>
          {scheme.description}
        </Typography>

        {/* Attachments */}
        {scheme.mediaUrls.length > 0 && (
          <Box mb={3}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              संलग्न दिशानिर्देश एवं दस्तावेज / Attachments:
            </Typography>
            <Box display="flex" gap={1.5} flexWrap="wrap">
              {scheme.mediaUrls.map((mUrl, idx) => (
                <Box
                  key={idx}
                  component="img"
                  src={resolveAttachmentDisplayUrl(mUrl)}
                  alt="Scheme attachment"
                  sx={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 2, border: '1px solid #cbd5e1' }}
                />
              ))}
            </Box>
          </Box>
        )}

        <Divider sx={{ my: 3 }} />

        {/* Official Portal Action Box */}
        <Box
          sx={{
            bgcolor: '#f1f5f9',
            p: 3,
            borderRadius: 2.5,
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'stretch', sm: 'center' },
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              ऑनलाइन आवेदन एवं आधिकारिक जानकारी
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {scheme.helpline ? `हेल्पलाइन: ${scheme.helpline}` : 'शासकीय पोर्टल पर सीधे आवेदन करें'}
            </Typography>
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            {scheme.helpline && (
              <Button
                variant="outlined"
                color="primary"
                startIcon={<PhoneIcon />}
                href={`tel:${scheme.helpline.replace(/[^\d]/g, '')}`}
                sx={{ borderRadius: 2, textTransform: 'none' }}
              >
                हेल्पलाइन
              </Button>
            )}

            {officialUrlCheck?.isValid && (
              <Button
                variant="contained"
                color="primary"
                endIcon={<LaunchIcon />}
                href={officialUrlCheck.normalizedUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
              >
                आधिकारिक पोर्टल पर जाएं / Visit Portal
              </Button>
            )}
          </Stack>
        </Box>
      </Paper>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>क्या आप यह योजना हटाना चाहते हैं?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            यह योजना हमेशा के लिए हटा दी जाएगी। इस क्रिया को वापस नहीं किया जा सकता।
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
            रद्द करें
          </Button>
          <Button variant="contained" color="error" onClick={handleDeleteScheme} disabled={isDeleting}>
            {isDeleting ? 'हटाया जा रहा है...' : 'हटाएं / Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};
