import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActions,
  Grid,
  Avatar,
  Chip,
  Button,
  CircularProgress,
  Alert,
  Pagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Divider,
  Paper,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Visibility as VisibilityIcon,
  HourglassEmpty as HourglassEmptyIcon,
  Refresh as RefreshIcon,
  Person as PersonIcon,
  Phone as PhoneIcon,
  Undo as UndoIcon,
  Message as MessageIcon,
  CalendarToday as CalendarTodayIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import {
  MatrimonialInterestItem,
  MatrimonialInterestStatus,
} from '@apnasamaj/shared-types';
import {
  listSentInterestsApi,
  respondMatrimonialInterestApi,
  MatrimonialApiError,
} from '../../services/matrimonial.service';

interface SentInterestsListProps {
  onSuccessNotice?: (message: string) => void;
}

export const SentInterestsList: React.FC<SentInterestsListProps> = ({
  onSuccessNotice,
}) => {
  const navigate = useNavigate();
  const [interests, setInterests] = useState<MatrimonialInterestItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMigrationPending, setIsMigrationPending] = useState<boolean>(false);

  // Pagination state
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Action states
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<MatrimonialInterestItem | null>(null);

  const fetchSent = useCallback(async (targetPage: number) => {
    setIsLoading(true);
    setErrorMessage(null);
    setIsMigrationPending(false);

    try {
      const response = await listSentInterestsApi(targetPage, 10);
      setInterests(response.interests);
      setPage(response.pagination.page);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.total);
    } catch (err: unknown) {
      const apiErr = err as MatrimonialApiError;
      if (apiErr.isMigrationPending) {
        setIsMigrationPending(true);
      } else {
        setErrorMessage(apiErr.message || 'Failed to load sent interest requests.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSent(page);
  }, [fetchSent, page]);

  const handleConfirmWithdraw = async () => {
    if (!withdrawTarget) return;

    const interestId = withdrawTarget.id;
    setWithdrawTarget(null);
    setProcessingId(interestId);
    setErrorMessage(null);

    try {
      await respondMatrimonialInterestApi(interestId, 'WITHDRAWN');
      if (onSuccessNotice) {
        onSuccessNotice('Interest request withdrawn successfully.');
      }
      await fetchSent(page);
    } catch (err: unknown) {
      const apiErr = err as MatrimonialApiError;
      if (apiErr.isMigrationPending) {
        setIsMigrationPending(true);
      } else if (apiErr.isConflict) {
        setErrorMessage('This request has already been updated or is no longer pending.');
        await fetchSent(page);
      } else if (apiErr.isForbidden) {
        setErrorMessage('You are not authorized to withdraw this request.');
      } else {
        setErrorMessage(apiErr.message || 'Failed to withdraw interest request.');
      }
    } finally {
      setProcessingId(null);
    }
  };

  const renderStatusBadge = (status: MatrimonialInterestStatus) => {
    switch (status) {
      case 'PENDING':
        return (
          <Chip
            size="small"
            icon={<HourglassEmptyIcon fontSize="small" />}
            label="Pending Response"
            color="warning"
            sx={{ fontWeight: 600 }}
          />
        );
      case 'ACCEPTED':
        return (
          <Chip
            size="small"
            icon={<CheckCircleIcon fontSize="small" />}
            label="Accepted & Connected"
            color="success"
            sx={{ fontWeight: 600 }}
          />
        );
      case 'DECLINED':
        return (
          <Chip
            size="small"
            icon={<CancelIcon fontSize="small" />}
            label="Declined"
            variant="outlined"
            color="default"
            sx={{ fontWeight: 600 }}
          />
        );
      case 'WITHDRAWN':
        return (
          <Chip
            size="small"
            icon={<UndoIcon fontSize="small" />}
            label="Withdrawn"
            variant="outlined"
            color="default"
            sx={{ fontWeight: 600 }}
          />
        );
      default:
        return null;
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  if (isMigrationPending) {
    return (
      <Paper elevation={0} sx={{ p: 4, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2 }}>
        <HourglassEmptyIcon sx={{ fontSize: 48, color: 'warning.main', mb: 1.5 }} />
        <Typography variant="h6" fontWeight="bold" gutterBottom>
          Matrimonial Database Pending
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520, mx: 'auto', mb: 2 }}>
          The matrimonial interest management tables are currently being prepared. Please check back shortly.
        </Typography>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => fetchSent(page)}>
          Retry Connection
        </Button>
      </Paper>
    );
  }

  return (
    <Box sx={{ py: 1 }}>
      {/* Header Info */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h6" fontWeight="bold">
            Sent Interest Requests{totalCount > 0 ? ` (${totalCount})` : ''}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Track connection requests you have initiated with other community members.
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={isLoading ? <CircularProgress size={16} /> : <RefreshIcon />}
          onClick={() => fetchSent(page)}
          disabled={isLoading}
        >
          Refresh
        </Button>
      </Box>

      {/* Error alert */}
      {errorMessage && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}

      {/* Loading state */}
      {isLoading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6, gap: 2 }}>
          <CircularProgress size={36} />
          <Typography variant="body2" color="text.secondary">
            Loading sent requests...
          </Typography>
        </Box>
      )}

      {/* Empty state */}
      {!isLoading && interests.length === 0 && (
        <Paper
          elevation={0}
          sx={{
            py: 8,
            px: 3,
            textAlign: 'center',
            bgcolor: 'background.default',
            borderRadius: 2,
            border: '1px dashed',
            borderColor: 'divider',
          }}
        >
          <PersonIcon sx={{ fontSize: 56, color: 'text.disabled', mb: 1.5 }} />
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            No Sent Interests Yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 500, mx: 'auto', mb: 3 }}>
            You have not sent any matrimonial interest requests yet. Discover verified community profiles and express your interest.
          </Typography>
          <Button
            variant="contained"
            color="primary"
            startIcon={<SearchIcon />}
            onClick={() => navigate('/matrimonial')}
          >
            Explore Community Discovery
          </Button>
        </Paper>
      )}

      {/* List of sent interests */}
      {!isLoading && interests.length > 0 && (
        <Grid container spacing={2.5}>
          {interests.map((item) => {
            const profile = item.otherPartyProfile;
            const isPending = item.status === 'PENDING';
            const isAccepted = item.status === 'ACCEPTED';
            const isItemProcessing = processingId === item.id;

            return (
              <Grid item xs={12} key={item.id}>
                <Card
                  variant="outlined"
                  sx={{
                    borderRadius: 2,
                    borderColor: isPending ? 'warning.light' : isAccepted ? 'success.light' : 'divider',
                    bgcolor: 'background.paper',
                    transition: 'box-shadow 0.2s',
                    '&:hover': {
                      boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
                    },
                  }}
                >
                  <CardContent sx={{ pb: 1.5 }}>
                    {/* Top Row: Recipient Info & Status Badge */}
                    <Box
                      sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 2,
                        mb: 2,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Avatar
                          src={profile?.avatarUrl || undefined}
                          sx={{
                            width: 56,
                            height: 56,
                            bgcolor: 'primary.main',
                            fontSize: '1.25rem',
                            fontWeight: 'bold',
                          }}
                        >
                          {profile?.fullName?.charAt(0) || 'M'}
                        </Avatar>
                        <Box>
                          <Typography variant="subtitle1" fontWeight="bold" color="text.primary">
                            {profile?.fullName || 'Community Member'}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {[
                              profile?.age ? `${profile.age} yrs` : null,
                              profile?.heightCm ? `${profile.heightCm} cm` : null,
                              profile?.city || profile?.state || null,
                              profile?.subCaste || profile?.gotra || null,
                            ]
                              .filter(Boolean)
                              .join(' • ')}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {profile?.highestEducation || ''}
                            {profile?.occupation ? ` • ${profile.occupation}` : ''}
                          </Typography>
                        </Box>
                      </Box>

                      <Box sx={{ textAlign: 'right' }}>
                        {renderStatusBadge(item.status)}
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: 0.5,
                            mt: 0.75,
                          }}
                        >
                          <CalendarTodayIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                          <Typography variant="caption" color="text.secondary">
                            Sent {formatDate(item.createdAt)}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>

                    {/* Sender's Sent Note */}
                    {item.message && (
                      <Box
                        sx={{
                          p: 1.5,
                          mb: 2,
                          bgcolor: 'background.default',
                          borderRadius: 1.5,
                          borderLeft: '4px solid',
                          borderColor: 'primary.light',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <MessageIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                          <Typography variant="caption" fontWeight="bold" color="text.secondary">
                            Introductory message sent:
                          </Typography>
                        </Box>
                        <Typography variant="body2" color="text.primary" sx={{ fontStyle: 'italic' }}>
                          &ldquo;{item.message}&rdquo;
                        </Typography>
                      </Box>
                    )}

                    {/* Mutual Acceptance Notice */}
                    {isAccepted && (
                      <Box
                        sx={{
                          p: 1.5,
                          bgcolor: 'success.50',
                          border: '1px solid',
                          borderColor: 'success.light',
                          borderRadius: 1.5,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: 1.5,
                          mt: 1,
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />
                          <Typography variant="body2" color="success.dark" fontWeight="500">
                            Great news! This member accepted your interest. Mutual contact details are unlocked.
                          </Typography>
                        </Box>
                        {profile?.id && (
                          <Button
                            size="small"
                            variant="outlined"
                            color="success"
                            startIcon={<PhoneIcon />}
                            onClick={() => navigate(`/matrimonial/profiles/${profile.id}`)}
                          >
                            View Contact Details
                          </Button>
                        )}
                      </Box>
                    )}
                  </CardContent>

                  <Divider />

                  {/* Actions Bar */}
                  <CardActions sx={{ px: 2, py: 1.25, justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                    <Box>
                      {profile?.id && (
                        <Button
                          size="small"
                          variant="text"
                          startIcon={<VisibilityIcon />}
                          onClick={() => navigate(`/matrimonial/profiles/${profile.id}`)}
                        >
                          View Profile Details
                        </Button>
                      )}
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                      {isPending && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="warning"
                          startIcon={
                            isItemProcessing ? (
                              <CircularProgress size={16} color="inherit" />
                            ) : (
                              <UndoIcon />
                            )
                          }
                          disabled={isItemProcessing}
                          onClick={() => setWithdrawTarget(item)}
                        >
                          Withdraw Request
                        </Button>
                      )}

                      {!isPending && (
                        <Typography variant="caption" color="text.secondary">
                          {item.respondedAt ? `Responded on ${formatDate(item.respondedAt)}` : `Updated on ${formatDate(item.updatedAt)}`}
                        </Typography>
                      )}
                    </Box>
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, val) => setPage(val)}
            color="primary"
            shape="rounded"
          />
        </Box>
      )}

      {/* Confirmation Dialog for Withdraw */}
      <Dialog
        open={Boolean(withdrawTarget)}
        onClose={() => setWithdrawTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle fontWeight="bold">Withdraw Interest Request?</DialogTitle>
        <DialogContent>
          <DialogContentText variant="body2">
            Are you sure you want to withdraw your interest request to{' '}
            <strong>{withdrawTarget?.otherPartyProfile?.fullName || 'this member'}</strong>? You will not be
            able to send another request right away.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setWithdrawTarget(null)} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleConfirmWithdraw} color="warning" variant="contained">
            Confirm Withdraw
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
