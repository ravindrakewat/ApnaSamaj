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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BusinessIcon from '@mui/icons-material/Business';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import PaymentsIcon from '@mui/icons-material/Payments';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import ChatIcon from '@mui/icons-material/Chat';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import ShareIcon from '@mui/icons-material/Share';
import DeleteIcon from '@mui/icons-material/Delete';
import { useAuth } from '../context/AuthContext';
import { employmentService, ParsedJobListing } from '../services/employment.service';
import { createOrGetDirectConversation } from '../services/chat.service';
import { resolveAttachmentDisplayUrl } from '../utils/attachment';

export const EmploymentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [job, setJob] = useState<ParsedJobListing | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [contactSuccessMsg, setContactSuccessMsg] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    employmentService
      .getJobById(id)
      .then((data) => setJob(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'नौकरी विवरण लोड करने में असमर्थ'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleMessageEmployer = async () => {
    if (!job || !user) {
      navigate('/login');
      return;
    }
    if (job.authorId === user.id) {
      setContactSuccessMsg('आप स्वयं इस रोजगार पोस्टिंग के नियोक्ता हैं।');
      return;
    }
    try {
      const convo = await createOrGetDirectConversation(job.authorId);
      navigate(`/chat/${convo.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'चैट शुरू करने में विफल');
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: job?.title,
        text: `${job?.title} at ${job?.company} - Apna Samaj Jobs`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setContactSuccessMsg('लिंक क्लिपबोर्ड पर कॉपी हो गया! / Link copied to clipboard!');
      setTimeout(() => setContactSuccessMsg(null), 3000);
    }
  };

  const handleDeleteJob = async () => {
    if (!job) return;
    setIsDeleting(true);
    try {
      await employmentService.deleteJob(job.id);
      navigate('/employment');
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

  if (error || !job) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/employment')} sx={{ mb: 2 }}>
          वापस जाएं / Back to Jobs
        </Button>
        <Alert severity="error">{error || 'Job not found'}</Alert>
      </Container>
    );
  }

  const isAuthor = user?.id === job.authorId;
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'COMMUNITY_ADMIN';
  const canDelete = isAuthor || isAdmin;

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {/* Back Button & Actions Bar */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/employment')}
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          सभी नौकरियां / Back to Jobs
        </Button>

        <Stack direction="row" spacing={1}>
          <IconButton onClick={handleShare} title="Share job">
            <ShareIcon />
          </IconButton>
          {canDelete && (
            <IconButton color="error" onClick={() => setDeleteDialogOpen(true)} title="Delete job">
              <DeleteIcon />
            </IconButton>
          )}
        </Stack>
      </Box>

      {contactSuccessMsg && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setContactSuccessMsg(null)}>
          {contactSuccessMsg}
        </Alert>
      )}

      {/* Main Job Card */}
      <Paper elevation={2} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 3, mb: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2} mb={2}>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: 'primary.light', color: 'primary.main', width: 56, height: 56 }}>
              <BusinessIcon fontSize="medium" />
            </Avatar>
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
                {job.company}
              </Typography>
              <Typography variant="h5" fontWeight={700}>
                {job.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                पोस्ट किया गया: {new Date(job.createdAt).toLocaleDateString('hi-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </Typography>
            </Box>
          </Box>

          <Chip
            label={job.employmentType}
            color="primary"
            variant="filled"
            sx={{ fontWeight: 600, px: 1, py: 0.5, borderRadius: 2 }}
          />
        </Box>

        {/* Highlights Row */}
        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ my: 2.5 }}>
          <Chip
            icon={<LocationOnIcon />}
            label={`स्थान: ${job.location}`}
            sx={{ bgcolor: '#f1f5f9', fontWeight: 600, py: 1 }}
          />
          <Chip
            icon={<PaymentsIcon />}
            label={`वेतन: ${job.salary}`}
            color="success"
            variant="outlined"
            sx={{ fontWeight: 600, py: 1 }}
          />
          <Chip
            icon={<WorkOutlineIcon />}
            label={`अनुभव: ${job.experience}`}
            sx={{ bgcolor: '#f8fafc', fontWeight: 500, py: 1 }}
          />
        </Stack>

        <Divider sx={{ my: 2.5 }} />

        {/* Job Description */}
        <Typography variant="h6" fontWeight={700} gutterBottom>
          कार्य विवरण एवं आवश्यकताएं / Job Description
        </Typography>
        <Typography
          variant="body1"
          sx={{ whiteSpace: 'pre-line', lineHeight: 1.8, color: '#334155', mb: 3 }}
        >
          {job.description}
        </Typography>

        {/* Media Attachments */}
        {job.mediaUrls.length > 0 && (
          <Box mb={3}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              संलग्न दस्तावेज एवं चित्र / Attachments:
            </Typography>
            <Box display="flex" gap={1.5} flexWrap="wrap">
              {job.mediaUrls.map((mUrl, idx) => (
                <Box
                  key={idx}
                  component="img"
                  src={resolveAttachmentDisplayUrl(mUrl)}
                  alt="Job attachment"
                  sx={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 2, border: '1px solid #cbd5e1' }}
                />
              ))}
            </Box>
          </Box>
        )}

        <Divider sx={{ my: 2.5 }} />

        {/* Employer Contact & Direct Application Section */}
        <Box
          sx={{
            bgcolor: '#f8fafc',
            p: 2.5,
            borderRadius: 2.5,
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'stretch', sm: 'center' },
            gap: 2,
          }}
        >
          <Box display="flex" alignItems="center" gap={1.5}>
            <Avatar
              src={job.authorAvatarUrl || undefined}
              sx={{ width: 44, height: 44, bgcolor: 'primary.main', fontWeight: 'bold' }}
            >
              {job.authorName.charAt(0)}
            </Avatar>
            <Box>
              <Typography variant="subtitle2" fontWeight={700}>
                {job.authorName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {job.contactInfo ? `संपर्क: ${job.contactInfo}` : 'कम्युनिटी सदस्य / Verified Member'}
              </Typography>
            </Box>
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            {job.contactInfo && job.contactInfo.includes('@') && (
              <Button
                variant="outlined"
                color="primary"
                startIcon={<EmailIcon />}
                href={`mailto:${job.contactInfo}?subject=Application for ${encodeURIComponent(job.title)}`}
                sx={{ borderRadius: 2, textTransform: 'none' }}
              >
                ईमेल करें
              </Button>
            )}

            {job.contactInfo && /\d{10}/.test(job.contactInfo) && (
              <Button
                variant="outlined"
                color="success"
                startIcon={<PhoneIcon />}
                href={`tel:${job.contactInfo.match(/\d{10}/)?.[0]}`}
                sx={{ borderRadius: 2, textTransform: 'none' }}
              >
                कॉल करें
              </Button>
            )}

            <Button
              variant="contained"
              color="primary"
              startIcon={<ChatIcon />}
              onClick={handleMessageEmployer}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 2.5 }}
            >
              संदेश भेजें / Message
            </Button>
          </Stack>
        </Box>
      </Paper>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>क्या आप यह रोजगार पोस्टिंग हटाना चाहते हैं?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            यह पोस्टिंग हमेशा के लिए हटा दी जाएगी। इस क्रिया को वापस नहीं किया जा सकता।
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
            रद्द करें
          </Button>
          <Button variant="contained" color="error" onClick={handleDeleteJob} disabled={isDeleting}>
            {isDeleting ? 'हटाया जा रहा है...' : 'हटाएं / Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};
