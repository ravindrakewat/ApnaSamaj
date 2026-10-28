import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Tabs,
  Tab,
  Button,
  Chip,
  IconButton,
  Tooltip,
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
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Shield as ShieldIcon,
  Gavel as GavelIcon,
  CheckCircleOutline as CheckIcon,
  CancelOutlined as DismissIcon,
  DeleteForever as DeleteIcon,
  WarningAmber as WarningIcon,
  Visibility as VisibilityIcon,
  Person as PersonIcon,
  CalendarToday as CalendarIcon,
  Flag as FlagIcon,
  InfoOutlined as InfoIcon,
  Lock as LockIcon,
} from '@mui/icons-material';
import {
  ModerationQueueItem,
  ReportPostReason,
  ReportReviewStatus,
  ModerationQueueUpdatePayload,
} from '@apnasamaj/shared-types';
import {
  fetchModerationReports,
  reviewReportApi,
  actionDeleteReportedPostApi,
} from '../services/admin.moderation.service';
import { getActiveCommunitySlug } from '../services/api.client';
import { connectAdminSocket } from '../services/admin.socket';

const REASON_LABELS: Record<ReportPostReason, string> = {
  SPAM: 'Spam / Commercial Solicitation',
  HARASSMENT: 'Harassment or Bullying',
  HATE_SPEECH: 'Hate Speech / Slurs',
  INAPPROPRIATE_CONTENT: 'Inappropriate Content',
  MISINFORMATION: 'Misinformation',
  OTHER: 'Other Violation',
};

const REASON_COLORS: Record<ReportPostReason, 'default' | 'error' | 'warning' | 'info'> = {
  SPAM: 'warning',
  HARASSMENT: 'error',
  HATE_SPEECH: 'error',
  INAPPROPRIATE_CONTENT: 'warning',
  MISINFORMATION: 'info',
  OTHER: 'default',
};

export const ModerationQueuePage: React.FC = () => {
  const [reports, setReports] = useState<ModerationQueueItem[]>([]);
  const [totalReports, setTotalReports] = useState<number>(0);
  const [page, setPage] = useState<number>(0); // 0-indexed for TablePagination
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [statusTab, setStatusTab] = useState<'ALL' | 'PENDING' | 'DISMISSED' | 'ACTIONED'>('PENDING');
  const [selectedReason, setSelectedReason] = useState<string>('ALL');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog States
  const [selectedReport, setSelectedReport] = useState<ModerationQueueItem | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState<boolean>(false);
  const [isDismissDialogOpen, setIsDismissDialogOpen] = useState<boolean>(false);
  const [isActionDialogOpen, setIsActionDialogOpen] = useState<boolean>(false);
  const [actionNotes, setActionNotes] = useState<string>('');
  const [isSubmittingAction, setIsSubmittingAction] = useState<boolean>(false);

  // Toast Feedback
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  const activeCommunity = getActiveCommunitySlug() || 'kewat';

  const [isRealtimeActive, setIsRealtimeActive] = useState<boolean>(false);
  const reloadDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const loadReports = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const data = await fetchModerationReports({
        page: page + 1,
        limit: rowsPerPage,
        status: statusTab,
        reason: selectedReason !== 'ALL' ? (selectedReason as ReportPostReason) : undefined,
      });
      setReports(data.reports);
      setTotalReports(data.pagination.totalReports);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load community moderation queue.';
      setError(msg);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [page, rowsPerPage, statusTab, selectedReason]);

  const triggerDebouncedReload = useCallback(() => {
    if (reloadDebounceRef.current) {
      clearTimeout(reloadDebounceRef.current);
    }
    reloadDebounceRef.current = setTimeout(() => {
      loadReports(true);
    }, 400);
  }, [loadReports]);

  useEffect(() => {
    loadReports(false);
  }, [loadReports]);

  // Real-time socket event subscription & polling fallback
  useEffect(() => {
    const socket = connectAdminSocket();

    const handleConnect = () => {
      setIsRealtimeActive(true);
      triggerDebouncedReload();
    };

    const handleDisconnect = () => {
      setIsRealtimeActive(false);
    };

    const handleQueueUpdated = (_payload: ModerationQueueUpdatePayload) => {
      triggerDebouncedReload();
    };

    if (socket.connected) {
      setIsRealtimeActive(true);
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('moderation:queue-updated', handleQueueUpdated);

    // Fallback polling: polls every 30 seconds if socket is disconnected
    const pollingInterval = setInterval(() => {
      if (!socket.connected) {
        loadReports(true);
      }
    }, 30000);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('moderation:queue-updated', handleQueueUpdated);
      clearInterval(pollingInterval);
      if (reloadDebounceRef.current) {
        clearTimeout(reloadDebounceRef.current);
      }
    };
  }, [triggerDebouncedReload, loadReports, activeCommunity]);

  const handleTabChange = (_: React.SyntheticEvent, newTab: 'ALL' | 'PENDING' | 'DISMISSED' | 'ACTIONED') => {
    setStatusTab(newTab);
    setPage(0);
  };

  const handlePageChange = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Open Actions
  const handleOpenDismiss = (report: ModerationQueueItem) => {
    setSelectedReport(report);
    setActionNotes('');
    setIsDismissDialogOpen(true);
  };

  const handleOpenActionDelete = (report: ModerationQueueItem) => {
    setSelectedReport(report);
    setActionNotes('');
    setIsActionDialogOpen(true);
  };

  const handleOpenDetail = (report: ModerationQueueItem) => {
    setSelectedReport(report);
    setIsDetailDialogOpen(true);
  };

  // Submit Dismiss Action
  const handleConfirmDismiss = async () => {
    if (!selectedReport) return;
    setIsSubmittingAction(true);
    try {
      await reviewReportApi(selectedReport.id, {
        decision: 'DISMISSED',
        notes: actionNotes.trim() || undefined,
      });
      setSnackbarMessage('Report dismissed successfully.');
      setIsDismissDialogOpen(false);
      loadReports();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to dismiss report.';
      setError(msg);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Submit Action Takedown
  const handleConfirmActionDelete = async () => {
    if (!selectedReport) return;
    setIsSubmittingAction(true);
    try {
      await actionDeleteReportedPostApi(selectedReport.id, actionNotes.trim() || undefined);
      setSnackbarMessage('Reported post taken down and marked as actioned.');
      setIsActionDialogOpen(false);
      loadReports();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to take down post.';
      setError(msg);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const getStatusChip = (status: ReportReviewStatus) => {
    switch (status) {
      case 'PENDING':
        return <Chip label="Pending Review" color="warning" size="small" icon={<WarningIcon />} />;
      case 'DISMISSED':
        return <Chip label="Dismissed" color="default" size="small" icon={<CheckIcon />} />;
      case 'ACTIONED':
        return <Chip label="Actioned / Post Removed" color="error" size="small" icon={<DeleteIcon />} />;
      default:
        return <Chip label={status} size="small" />;
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <ShieldIcon color="secondary" sx={{ fontSize: 32 }} />
            <Typography variant="h5" fontWeight="bold">
              Content Moderation Queue
            </Typography>
            <Chip
              label={`${activeCommunity.toUpperCase()} SAMAJ`}
              color="secondary"
              variant="outlined"
              size="small"
              sx={{ fontWeight: 'bold' }}
            />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Review member reports, inspect reported posts, and take appropriate moderation actions.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Chip
            size="small"
            color={isRealtimeActive ? 'success' : 'default'}
            variant="outlined"
            label={isRealtimeActive ? '● Live' : '○ Polling'}
            sx={{ fontWeight: 'medium' }}
          />
          <Button
            variant="outlined"
            color="secondary"
            startIcon={<RefreshIcon />}
            onClick={() => loadReports(false)}
            disabled={isLoading}
          >
            Refresh Queue
          </Button>
        </Stack>
      </Box>

      {/* Error Notice */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Filter Tabs & Reason Selector */}
      <Paper sx={{ mb: 3, borderRadius: 2 }}>
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Tabs
            value={statusTab}
            onChange={handleTabChange}
            textColor="secondary"
            indicatorColor="secondary"
            sx={{ minHeight: 44 }}
          >
            <Tab label="Pending" value="PENDING" />
            <Tab label="All Reports" value="ALL" />
            <Tab label="Dismissed" value="DISMISSED" />
            <Tab label="Actioned" value="ACTIONED" />
          </Tabs>

          <Box sx={{ minWidth: 220 }}>
            <TextField
              select
              size="small"
              fullWidth
              label="Filter by Reason"
              value={selectedReason}
              onChange={(e) => {
                setSelectedReason(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="ALL">All Reasons</MenuItem>
              {Object.entries(REASON_LABELS).map(([key, label]) => (
                <MenuItem key={key} value={key}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </Box>
      </Paper>

      {/* Queue Content */}
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
          <CircularProgress color="secondary" size={44} />
        </Box>
      ) : reports.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 2 }}>
          <ShieldIcon sx={{ fontSize: 56, color: 'text.disabled', mb: 1.5 }} />
          <Typography variant="h6" color="text.secondary">
            No reports in queue
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
            {statusTab === 'PENDING'
              ? 'All community reports for this community have been reviewed.'
              : 'No matching report entries found with the selected criteria.'}
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={2.5}>
          {reports.map((item) => (
            <Card
              key={item.id}
              sx={{
                borderRadius: 2,
                boxShadow: 1,
                border: '1px solid',
                borderColor: item.status === 'PENDING' ? 'warning.light' : 'divider',
              }}
            >
              <CardContent sx={{ pb: 1.5 }}>
                {/* Card Top Row */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Chip
                      label={REASON_LABELS[item.reason] || item.reason}
                      color={REASON_COLORS[item.reason] || 'default'}
                      size="small"
                      icon={<FlagIcon />}
                    />
                    {getStatusChip(item.status)}
                    {item.advisoryFlags && item.advisoryFlags.length > 0 && (
                      <Chip
                        label={`Advisory Alert: ${item.advisoryFlags.join(', ')}`}
                        color="error"
                        variant="outlined"
                        size="small"
                        icon={<WarningIcon />}
                      />
                    )}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Reported on {new Date(item.createdAt).toLocaleString()}
                  </Typography>
                </Box>

                {/* Reporter & Post Info Grid */}
                <Grid container spacing={2}>
                  {/* Reported Content Column */}
                  <Grid item xs={12} md={8}>
                    <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="subtitle2" fontWeight="bold" color="text.secondary">
                          REPORTED POST CONTENT
                        </Typography>
                        {item.post?.isDeleted ? (
                          <Chip label="Post Removed" size="small" color="error" variant="outlined" />
                        ) : item.post?.group ? (
                          <Chip
                            label={`Group: ${item.post.group.name}${item.post.group.privacy === 'PRIVATE' ? ' (Private)' : ''}`}
                            size="small"
                            variant="outlined"
                            icon={item.post.group.privacy === 'PRIVATE' ? <LockIcon fontSize="small" /> : undefined}
                          />
                        ) : null}
                      </Box>

                      {item.post?.isDeleted ? (
                        <Typography variant="body2" color="text.disabled" fontStyle="italic">
                          [This post was removed from the community feed]
                        </Typography>
                      ) : (
                        <>
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', mb: 1.5 }}>
                            {item.post?.content || 'No text content.'}
                          </Typography>
                          {item.post?.author && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Avatar
                                src={item.post.author.avatarUrl || undefined}
                                sx={{ width: 22, height: 22, fontSize: 11 }}
                              >
                                {item.post.author.fullName.charAt(0)}
                              </Avatar>
                              <Typography variant="caption" color="text.secondary">
                                Author: <strong>{item.post.author.fullName}</strong> (ID: {item.post.author.id})
                              </Typography>
                            </Box>
                          )}
                        </>
                      )}
                    </Box>

                    {/* Reporter Notes */}
                    {item.details && (
                      <Box sx={{ mt: 1.5, px: 1 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight="bold">
                          Reporter Note:
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.25, color: 'text.primary', fontStyle: 'italic' }}>
                          &ldquo;{item.details}&rdquo;
                        </Typography>
                      </Box>
                    )}
                  </Grid>

                  {/* Metadata & Reporter Column */}
                  <Grid item xs={12} md={4}>
                    <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1.5, border: '1px solid', borderColor: 'divider', height: '100%' }}>
                      <Typography variant="subtitle2" fontWeight="bold" color="text.secondary" sx={{ mb: 1 }}>
                        AUDIT CONTEXT
                      </Typography>
                      <Typography variant="caption" display="block" color="text.secondary">
                        Post ID: <code>{item.postId}</code>
                      </Typography>
                      <Typography variant="caption" display="block" color="text.secondary">
                        Report Log ID: <code>{item.id}</code>
                      </Typography>
                      <Divider sx={{ my: 1 }} />
                      <Typography variant="caption" display="block" color="text.secondary">
                        Reporter: <strong>{item.reporter.fullName}</strong>
                      </Typography>
                      {item.reporter.phone && (
                        <Typography variant="caption" display="block" color="text.secondary">
                          Phone: {item.reporter.phone}
                        </Typography>
                      )}

                      {/* Review History */}
                      {item.latestReview && (
                        <Box sx={{ mt: 1.5, pt: 1, borderTop: '1px dashed', borderColor: 'divider' }}>
                          <Typography variant="caption" display="block" fontWeight="bold" color="secondary.main">
                            Reviewed by {item.latestReview.moderatorRole}
                          </Typography>
                          <Typography variant="caption" display="block" color="text.secondary">
                            At {new Date(item.latestReview.reviewedAt).toLocaleString()}
                          </Typography>
                          {item.latestReview.notes && (
                            <Typography variant="caption" display="block" fontStyle="italic" sx={{ mt: 0.5 }}>
                              Note: {item.latestReview.notes}
                            </Typography>
                          )}
                        </Box>
                      )}
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>

              {/* Action Buttons */}
              <Divider />
              <CardActions sx={{ px: 2, py: 1.25, justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                <Button
                  size="small"
                  variant="text"
                  color="secondary"
                  startIcon={<VisibilityIcon />}
                  onClick={() => handleOpenDetail(item)}
                >
                  View Details
                </Button>

                <Box sx={{ display: 'flex', gap: 1 }}>
                  {item.status === 'PENDING' ? (
                    <>
                      <Button
                        size="small"
                        variant="outlined"
                        color="inherit"
                        startIcon={<DismissIcon />}
                        onClick={() => handleOpenDismiss(item)}
                      >
                        Dismiss Report
                      </Button>
                      {!item.post?.isDeleted && (
                        <Button
                          size="small"
                          variant="contained"
                          color="error"
                          startIcon={<DeleteIcon />}
                          onClick={() => handleOpenActionDelete(item)}
                        >
                          Take Down Post
                        </Button>
                      )}
                    </>
                  ) : item.status === 'DISMISSED' && !item.post?.isDeleted ? (
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<DeleteIcon />}
                      onClick={() => handleOpenActionDelete(item)}
                    >
                      Re-Evaluate & Take Down
                    </Button>
                  ) : null}
                </Box>
              </CardActions>
            </Card>
          ))}
        </Stack>
      )}

      {/* Pagination */}
      <Paper sx={{ mt: 3, borderRadius: 2 }}>
        <TablePagination
          component="div"
          count={totalReports}
          page={page}
          onPageChange={handlePageChange}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleRowsPerPageChange}
          rowsPerPageOptions={[5, 10, 20, 50]}
        />
      </Paper>

      {/* Dismiss Dialog */}
      <Dialog open={isDismissDialogOpen} onClose={() => !isSubmittingAction && setIsDismissDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 'bold' }}>
          Dismiss Community Report
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Dismissing this report records that the content was reviewed and deemed compliant with community guidelines.
            The post will remain active.
          </Typography>
          <TextField
            fullWidth
            label="Review Note (Optional)"
            multiline
            rows={3}
            value={actionNotes}
            onChange={(e) => setActionNotes(e.target.value)}
            placeholder="e.g. Content reviewed and found to be standard community discussion."
            helperText="Recorded permanently in the administrative audit log."
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setIsDismissDialogOpen(false)} disabled={isSubmittingAction}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleConfirmDismiss}
            disabled={isSubmittingAction}
            startIcon={isSubmittingAction ? <CircularProgress size={18} /> : <CheckIcon />}
          >
            Confirm Dismissal
          </Button>
        </DialogActions>
      </Dialog>

      {/* Take Down Dialog */}
      <Dialog open={isActionDialogOpen} onClose={() => !isSubmittingAction && setIsActionDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 'bold', color: 'error.main' }}>
          Take Down Reported Post
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Are you sure you want to remove this post from <strong>{activeCommunity.toUpperCase()} Samaj</strong>?
          </Typography>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action will permanently delete the post and attached media, notify the post author, and record an immutable administrative audit log.
          </Alert>
          <TextField
            fullWidth
            label="Moderation Reason / Note"
            multiline
            rows={3}
            value={actionNotes}
            onChange={(e) => setActionNotes(e.target.value)}
            placeholder="e.g. Violates community policy on commercial spam."
            helperText="Recorded permanently in the administrative audit log."
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setIsActionDialogOpen(false)} disabled={isSubmittingAction}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmActionDelete}
            disabled={isSubmittingAction}
            startIcon={isSubmittingAction ? <CircularProgress size={18} /> : <DeleteIcon />}
          >
            Take Down Post
          </Button>
        </DialogActions>
      </Dialog>

      {/* Details Dialog */}
      {selectedReport && (
        <Dialog open={isDetailDialogOpen} onClose={() => setIsDetailDialogOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle sx={{ fontWeight: 'bold' }}>
            Report #{selectedReport.id.slice(0, 8)} Details
          </DialogTitle>
          <DialogContent dividers>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Reason</Typography>
                <Typography variant="body2" fontWeight="bold">
                  {REASON_LABELS[selectedReport.reason] || selectedReport.reason}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Current Status</Typography>
                <Box sx={{ mt: 0.5 }}>{getStatusChip(selectedReport.status)}</Box>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Submission Time</Typography>
                <Typography variant="body2">
                  {new Date(selectedReport.createdAt).toLocaleString()}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Reporter Information</Typography>
                <Typography variant="body2">
                  {selectedReport.reporter.fullName} ({selectedReport.reporter.phone || 'Phone hidden'})
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <Divider sx={{ my: 1 }} />
                <Typography variant="caption" color="text.secondary">Reported Post Content</Typography>
                <Paper variant="outlined" sx={{ p: 2, mt: 0.5, bgcolor: 'background.default' }}>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {selectedReport.post?.content || '[Post removed or unavailable]'}
                  </Typography>
                </Paper>
              </Grid>
              {selectedReport.details && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">Reporter Additional Note</Typography>
                  <Typography variant="body2" sx={{ fontStyle: 'italic', mt: 0.5 }}>
                    &ldquo;{selectedReport.details}&rdquo;
                  </Typography>
                </Grid>
              )}
            </Grid>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setIsDetailDialogOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Snackbar Toast */}
      <Snackbar
        open={Boolean(snackbarMessage)}
        autoHideDuration={4000}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage}
      />
    </Box>
  );
};

export default ModerationQueuePage;
