import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Stack,
  Divider,
  Snackbar,
} from '@mui/material';
import {
  Gavel as GavelIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
  HourglassEmpty as PendingIcon,
  RateReview as ReviewIcon,
  CheckCircleOutline as ApprovedIcon,
  CancelOutlined as RejectedIcon,
  CalendarToday as CalendarIcon,
  InfoOutlined as InfoIcon,
} from '@mui/icons-material';
import { PostAppealItem, PostAppealStatus } from '@apnasamaj/shared-types';
import { fetchMyAppealsApi } from '../services/appeals.service';
import { AppealSubmissionModal } from '../components/AppealSubmissionModal';

const STATUS_CONFIG: Record<
  PostAppealStatus,
  { label: string; color: 'warning' | 'info' | 'success' | 'error'; icon: React.ReactElement }
> = {
  PENDING: { label: 'Pending Review', color: 'warning', icon: <PendingIcon fontSize="small" /> },
  UNDER_REVIEW: { label: 'Under Review', color: 'info', icon: <ReviewIcon fontSize="small" /> },
  APPROVED: { label: 'Appeal Approved', color: 'success', icon: <ApprovedIcon fontSize="small" /> },
  REJECTED: { label: 'Appeal Rejected', color: 'error', icon: <RejectedIcon fontSize="small" /> },
};

export const MyAppealsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPostId = searchParams.get('postId');

  const [appeals, setAppeals] = useState<PostAppealItem[]>([]);
  const [totalAppeals, setTotalAppeals] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalPostId, setModalPostId] = useState<string>('');
  const [isModalLocked, setIsModalLocked] = useState<boolean>(false);

  // Duplicate active warning
  const [duplicateActiveAlert, setDuplicateActiveAlert] = useState<{
    postId: string;
    status: PostAppealStatus;
  } | null>(null);

  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  const loadAppeals = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchMyAppealsApi({ page: 1, limit: 50 });
      setAppeals(data.appeals);
      setTotalAppeals(data.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load your appeals.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAppeals();
  }, [loadAppeals]);

  // Handle URL deep-link with postId
  useEffect(() => {
    if (urlPostId && !isLoading) {
      const trimmedId = urlPostId.trim();

      // Check if an active appeal already exists for this post
      const existingActive = appeals.find(
        (a) => a.postId === trimmedId && (a.status === 'PENDING' || a.status === 'UNDER_REVIEW')
      );

      if (existingActive) {
        setDuplicateActiveAlert({
          postId: trimmedId,
          status: existingActive.status,
        });
        setIsModalOpen(false);
      } else {
        setModalPostId(trimmedId);
        setIsModalLocked(true);
        setIsModalOpen(true);
        setDuplicateActiveAlert(null);
      }
    }
  }, [urlPostId, isLoading, appeals]);

  const handleOpenManualModal = () => {
    setModalPostId('');
    setIsModalLocked(false);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setModalPostId('');
    setIsModalLocked(false);

    // Clean up query param if one was used
    if (searchParams.has('postId')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('postId');
      setSearchParams(nextParams, { replace: true });
    }
  };

  const handleAppealSubmitted = (newAppeal: PostAppealItem) => {
    setSnackbarMessage(`Appeal for post ${newAppeal.postId.slice(0, 8)} submitted successfully.`);
    handleCloseModal();
    loadAppeals();
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {/* Page Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
            <GavelIcon color="primary" /> My Moderation Appeals
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Track appeals submitted for posts removed by community moderation.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadAppeals}
            disabled={isLoading}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleOpenManualModal}
          >
            Submit Appeal
          </Button>
        </Box>
      </Box>

      {/* Duplicate Active Alert (from deep link) */}
      {duplicateActiveAlert && (
        <Alert
          severity="info"
          icon={<InfoIcon />}
          sx={{ mb: 3 }}
          onClose={() => setDuplicateActiveAlert(null)}
        >
          An active appeal for post <code>{duplicateActiveAlert.postId.slice(0, 8)}...</code> is already pending review (Status: <strong>{duplicateActiveAlert.status.replace('_', ' ')}</strong>). Our moderation team is currently reviewing your submission.
        </Alert>
      )}

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Loading */}
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
          <CircularProgress />
        </Box>
      ) : appeals.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 2 }}>
          <Typography variant="h6" color="text.secondary">
            You haven't submitted any appeals yet.
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mt: 1, mb: 3 }}>
            If one of your posts was removed by community moderation, you can submit an appeal here.
          </Typography>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleOpenManualModal}
          >
            Submit Appeal
          </Button>
        </Paper>
      ) : (
        <Stack spacing={2}>
          {appeals.map((appeal) => {
            const config = STATUS_CONFIG[appeal.status];
            return (
              <Card key={appeal.id} variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Post ID: <code>{appeal.postId}</code>
                      </Typography>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 0.5 }}>
                        Reason: {appeal.reason}
                      </Typography>
                    </Box>
                    <Chip
                      label={config.label}
                      color={config.color}
                      icon={config.icon}
                      size="small"
                      sx={{ fontWeight: 600 }}
                    />
                  </Box>

                  {appeal.details && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Details: {appeal.details}
                    </Typography>
                  )}

                  <Divider sx={{ my: 1.5 }} />

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <CalendarIcon fontSize="inherit" /> Submitted on: {new Date(appeal.createdAt).toLocaleString()}
                    </Typography>
                    {appeal.reviewedAt && (
                      <Typography variant="caption" color="text.secondary">
                        Resolved on: {new Date(appeal.reviewedAt).toLocaleString()}
                      </Typography>
                    )}
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}

      {/* Appeal Submission Modal */}
      <AppealSubmissionModal
        open={isModalOpen}
        postId={modalPostId}
        isLocked={isModalLocked}
        onClose={handleCloseModal}
        onSuccess={handleAppealSubmitted}
      />

      {/* Snackbar */}
      <Snackbar
        open={Boolean(snackbarMessage)}
        autoHideDuration={4000}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage}
      />
    </Container>
  );
};

export default MyAppealsPage;
