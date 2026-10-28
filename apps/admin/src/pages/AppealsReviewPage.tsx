import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Tabs,
  Tab,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Divider,
  Alert,
  CircularProgress,
  Avatar,
  Card,
  CardContent,
  CardActions,
  TextField,
  MenuItem,
  Snackbar,
  Stack,
  TablePagination,
  Tooltip,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Gavel as GavelIcon,
  CheckCircleOutline as CheckIcon,
  CancelOutlined as RejectIcon,
  HourglassEmpty as PendingIcon,
  RateReview as ReviewIcon,
  Person as PersonIcon,
  CalendarToday as CalendarIcon,
  Lock as LockIcon,
} from '@mui/icons-material';
import {
  PostAppealItem,
  PostAppealStatus,
  ReviewPostAppealRequest,
} from '@apnasamaj/shared-types';
import { useAuth } from '../context/AuthContext';
import {
  fetchAdminAppeals,
  reviewAppealApi,
} from '../services/admin.appeals.service';

const STATUS_COLORS: Record<PostAppealStatus, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  PENDING: 'warning',
  UNDER_REVIEW: 'info',
  APPROVED: 'success',
  REJECTED: 'error',
};

const STATUS_ICONS: Record<PostAppealStatus, React.ReactElement> = {
  PENDING: <PendingIcon fontSize="small" />,
  UNDER_REVIEW: <ReviewIcon fontSize="small" />,
  APPROVED: <CheckIcon fontSize="small" />,
  REJECTED: <RejectIcon fontSize="small" />,
};

export const AppealsReviewPage: React.FC = () => {
  const { user } = useAuth();
  const [appeals, setAppeals] = useState<PostAppealItem[]>([]);
  const [totalAppeals, setTotalAppeals] = useState<number>(0);
  const [page, setPage] = useState<number>(0);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [statusFilter, setStatusFilter] = useState<PostAppealStatus | 'ALL'>('ALL');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Review Dialog State
  const [reviewDialogOpen, setReviewDialogOpen] = useState<boolean>(false);
  const [selectedAppeal, setSelectedAppeal] = useState<PostAppealItem | null>(null);
  const [reviewStatus, setReviewStatus] = useState<'UNDER_REVIEW' | 'APPROVED' | 'REJECTED'>('APPROVED');
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);

  // Snackbar State
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info';
  }>({
    open: false,
    message: '',
    severity: 'info',
  });

  const loadAppeals = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAdminAppeals({
        page: page + 1,
        limit: rowsPerPage,
        status: statusFilter,
      });
      setAppeals(data.appeals);
      setTotalAppeals(data.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load post appeals.');
    } finally {
      setIsLoading(false);
    }
  }, [page, rowsPerPage, statusFilter]);

  useEffect(() => {
    loadAppeals();
  }, [loadAppeals]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: PostAppealStatus | 'ALL') => {
    setStatusFilter(newValue);
    setPage(0);
  };

  const handleOpenReview = (appeal: PostAppealItem) => {
    setSelectedAppeal(appeal);
    setReviewStatus(appeal.status === 'PENDING' ? 'UNDER_REVIEW' : 'APPROVED');
    setReviewNotes(appeal.reviewNotes || '');
    setReviewDialogOpen(true);
  };

  const handleCloseReview = () => {
    setReviewDialogOpen(false);
    setSelectedAppeal(null);
    setReviewNotes('');
  };

  const handleSubmitReview = async () => {
    if (!selectedAppeal) return;

    setIsSubmittingReview(true);
    try {
      const payload: ReviewPostAppealRequest = {
        status: reviewStatus,
        reviewNotes: reviewNotes.trim() || undefined,
      };

      const updated = await reviewAppealApi(selectedAppeal.id, payload);
      setSnackbar({
        open: true,
        message: `Appeal for post ${selectedAppeal.postId.slice(0, 8)} updated to ${updated.status}.`,
        severity: 'success',
      });
      handleCloseReview();
      loadAppeals();
    } catch (err: any) {
      setSnackbar({
        open: true,
        message: err.message || 'Failed to submit review.',
        severity: 'error',
      });
    } finally {
      setIsSubmittingReview(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Page Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
            <GavelIcon color="primary" /> Member Appeals Review
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Review appeals submitted by community members for posts removed by moderation.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={loadAppeals}
          disabled={isLoading}
        >
          Refresh
        </Button>
      </Box>

      {/* Filter Tabs */}
      <Paper sx={{ mb: 3, borderRadius: 2 }}>
        <Tabs
          value={statusFilter}
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label={`All (${totalAppeals})`} value="ALL" />
          <Tab label="Pending" value="PENDING" />
          <Tab label="Under Review" value="UNDER_REVIEW" />
          <Tab label="Approved" value="APPROVED" />
          <Tab label="Rejected" value="REJECTED" />
        </Tabs>
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Loading Indicator */}
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
          <CircularProgress />
        </Box>
      ) : appeals.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 2 }}>
          <Typography variant="h6" color="text.secondary">
            No appeals found matching the selected filter.
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
            When community members appeal post removals, they will appear in this review queue.
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={2}>
          {appeals.map((appeal) => {
            const isOwnAppeal = Boolean(user?.id && appeal.authorId && user.id === appeal.authorId);
            const isFinalized = appeal.status === 'APPROVED' || appeal.status === 'REJECTED';

            return (
              <Card key={appeal.id} variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={8}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.light', fontSize: '0.875rem' }}>
                          <PersonIcon fontSize="inherit" />
                        </Avatar>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                          {appeal.authorName || 'Community Member'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          (Author ID: {appeal.authorId ? `${appeal.authorId.slice(0, 8)}...` : 'Deleted Member'})
                        </Typography>
                        <Chip
                          size="small"
                          label={appeal.status.replace('_', ' ')}
                          color={STATUS_COLORS[appeal.status]}
                          icon={STATUS_ICONS[appeal.status]}
                          sx={{ fontWeight: 600, ml: 'auto' }}
                        />
                      </Box>

                      <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary', mt: 1 }}>
                        Reason: {appeal.reason}
                      </Typography>

                      {appeal.details && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          Details: {appeal.details}
                        </Typography>
                      )}

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2, color: 'text.secondary' }}>
                        <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <CalendarIcon fontSize="inherit" /> Submitted: {new Date(appeal.createdAt).toLocaleString()}
                        </Typography>
                        <Typography variant="caption">
                          Post ID: <code>{appeal.postId}</code>
                        </Typography>
                      </Box>

                      {appeal.reviewNotes && (
                        <Paper variant="outlined" sx={{ mt: 2, p: 1.5, bgcolor: 'action.hover' }}>
                          <Typography variant="caption" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <LockIcon fontSize="inherit" /> Internal Review Notes:
                          </Typography>
                          <Typography variant="body2" sx={{ mt: 0.5, fontStyle: 'italic' }}>
                            {appeal.reviewNotes}
                          </Typography>
                          {appeal.reviewedAt && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                              Reviewed on: {new Date(appeal.reviewedAt).toLocaleString()}
                            </Typography>
                          )}
                        </Paper>
                      )}
                    </Grid>

                    <Grid item xs={12} sm={4} sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: { sm: 'flex-end' } }}>
                      {isOwnAppeal ? (
                        <Tooltip title="Self-review prohibited: Reviewers cannot review appeals on their own posts.">
                          <span>
                            <Button variant="outlined" disabled size="small" startIcon={<GavelIcon />}>
                              Self Review Blocked
                            </Button>
                          </span>
                        </Tooltip>
                      ) : isFinalized ? (
                        <Chip
                          variant="outlined"
                          label="Appeal Finalized"
                          color={appeal.status === 'APPROVED' ? 'success' : 'default'}
                          size="small"
                        />
                      ) : (
                        <Button
                          variant="contained"
                          color="primary"
                          startIcon={<GavelIcon />}
                          onClick={() => handleOpenReview(appeal)}
                        >
                          Review Appeal
                        </Button>
                      )}
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            );
          })}

          {/* Pagination */}
          <TablePagination
            component="div"
            count={totalAppeals}
            page={page}
            onPageChange={(_e, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[5, 10, 20]}
          />
        </Stack>
      )}

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onClose={handleCloseReview} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <GavelIcon color="primary" /> Review Post Appeal
        </DialogTitle>
        <DialogContent dividers>
          {selectedAppeal && (
            <Stack spacing={2.5}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Target Post ID
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                  {selectedAppeal.postId}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Appellant Statement
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {selectedAppeal.reason}
                </Typography>
                {selectedAppeal.details && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {selectedAppeal.details}
                  </Typography>
                )}
              </Box>

              <Divider />

              <TextField
                select
                fullWidth
                label="Decision Outcome"
                value={reviewStatus}
                onChange={(e) => setReviewStatus(e.target.value as any)}
              >
                {selectedAppeal.status === 'PENDING' && (
                  <MenuItem value="UNDER_REVIEW">Mark Under Review (Investigation Ongoing)</MenuItem>
                )}
                <MenuItem value="APPROVED">Approve Appeal (Post Removal Rescinded)</MenuItem>
                <MenuItem value="REJECTED">Reject Appeal (Uphold Moderation Removal)</MenuItem>
              </TextField>

              <TextField
                fullWidth
                multiline
                rows={3}
                label="Private Review Notes"
                placeholder="Internal reasoning (visible only to moderators/administrators; kept confidential from appellant)..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                helperText="Internal records only. Not shared with the member."
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleCloseReview} disabled={isSubmittingReview}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color={reviewStatus === 'REJECTED' ? 'error' : 'primary'}
            onClick={handleSubmitReview}
            disabled={isSubmittingReview}
            startIcon={isSubmittingReview ? <CircularProgress size={18} /> : <CheckIcon />}
          >
            {isSubmittingReview ? 'Submitting...' : 'Confirm Decision'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Feedback Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AppealsReviewPage;

