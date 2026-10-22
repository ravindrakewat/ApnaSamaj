import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  MenuItem,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Grid,
  Divider,
  Alert,
  CircularProgress,
  Avatar,
  InputAdornment,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Visibility as VisibilityIcon,
  Block as BlockIcon,
  CheckCircle as CheckCircleIcon,
  Verified as VerifiedIcon,
  Phone as PhoneIcon,
  CalendarToday as CalendarIcon,
  LocationOn as LocationIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import {
  AdminUserDetails,
  AdminUserListItem,
  UserRole,
  UserStatus,
} from '@apnasamaj/shared-types';
import { useAuth } from '../context/AuthContext';
import {
  fetchAdminUsers,
  fetchAdminUserDetails,
  updateAdminUserStatus,
} from '../services/admin.users.service';

export const MemberManagementPage: React.FC = () => {
  const { user: currentAdmin } = useAuth();

  // List State
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [page, setPage] = useState(0); // 0-indexed for MUI TablePagination
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalUsers, setTotalUsers] = useState(0);

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // User Details Dialog State
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userDetails, setUserDetails] = useState<AdminUserDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Status Action Confirmation Dialog State
  const [statusDialogTarget, setStatusDialogTarget] = useState<AdminUserListItem | null>(null);
  const [statusDialogAction, setStatusDialogAction] = useState<'ACTIVE' | 'SUSPENDED'>('SUSPENDED');
  const [statusReason, setStatusReason] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(0); // Reset to first page on search
    }, 400);

    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Load members data with stale-response protection
  const activeRequestRef = React.useRef(0);

  const loadUsers = useCallback(async () => {
    const requestId = ++activeRequestRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAdminUsers({
        page: page + 1, // API is 1-indexed
        limit: rowsPerPage,
        search: debouncedSearch,
        role: selectedRole || undefined,
        status: selectedStatus || undefined,
      });

      // Ignore response if a newer request was dispatched
      if (requestId === activeRequestRef.current) {
        setUsers(data.users);
        setTotalUsers(data.pagination.totalUsers);
      }
    } catch (err: unknown) {
      if (requestId === activeRequestRef.current) {
        const message = err instanceof Error ? err.message : 'Failed to load members.';
        setError(message);
      }
    } finally {
      if (requestId === activeRequestRef.current) {
        setIsLoading(false);
      }
    }
  }, [page, rowsPerPage, debouncedSearch, selectedRole, selectedStatus]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Handle open user details
  const handleOpenDetails = async (userId: string) => {
    setSelectedUserId(userId);
    setIsLoadingDetails(true);
    try {
      const details = await fetchAdminUserDetails(userId);
      setUserDetails(details);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not fetch user details.');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleCloseDetails = () => {
    setSelectedUserId(null);
    setUserDetails(null);
  };

  // Handle status toggle dialog
  const handleOpenStatusDialog = (targetUser: AdminUserListItem) => {
    const nextAction = targetUser.status === UserStatus.SUSPENDED ? 'ACTIVE' : 'SUSPENDED';
    setStatusDialogTarget(targetUser);
    setStatusDialogAction(nextAction);
    setStatusReason('');
  };

  const handleCloseStatusDialog = () => {
    setStatusDialogTarget(null);
    setStatusReason('');
  };

  const handleConfirmStatusChange = async () => {
    if (!statusDialogTarget) return;

    setIsUpdatingStatus(true);
    setError(null);
    try {
      await updateAdminUserStatus(statusDialogTarget.id, statusDialogAction, statusReason);
      setSuccessMessage(
        `Successfully ${statusDialogAction === 'SUSPENDED' ? 'suspended' : 'reactivated'} account for ${
          statusDialogTarget.profile?.fullName || statusDialogTarget.phone
        }.`
      );
      handleCloseStatusDialog();
      loadUsers(); // Refresh list
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update member status.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const getRoleChip = (role: UserRole) => {
    switch (role) {
      case UserRole.SUPER_ADMIN:
        return <Chip label="Super Admin" color="secondary" size="small" sx={{ fontWeight: 'bold' }} />;
      case UserRole.COMMUNITY_ADMIN:
        return <Chip label="Admin" color="primary" size="small" sx={{ fontWeight: 'bold' }} />;
      case UserRole.MODERATOR:
        return <Chip label="Moderator" color="info" size="small" />;
      default:
        return <Chip label="Member" variant="outlined" size="small" />;
    }
  };

  const getStatusChip = (status: UserStatus) => {
    switch (status) {
      case UserStatus.ACTIVE:
        return <Chip label="Active" color="success" size="small" />;
      case UserStatus.SUSPENDED:
        return <Chip label="Suspended" color="error" size="small" />;
      case UserStatus.PENDING:
        return <Chip label="Pending" color="warning" size="small" />;
      default:
        return <Chip label={status} size="small" />;
    }
  };

  return (
    <Box>
      {/* Page Title & Controls */}
      <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2} mb={3}>
        <Box>
          <Typography variant="h5" component="h1" fontWeight="bold">
            Member Management
          </Typography>
          <Typography variant="body2" color="text.secondary">
            View member profiles, verify identities, manage community privileges, and moderate access.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          color="secondary"
          startIcon={<RefreshIcon />}
          onClick={() => loadUsers()}
          disabled={isLoading}
          sx={{ textTransform: 'none' }}
        >
          Refresh List
        </Button>
      </Box>

      {/* Notifications */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {successMessage && (
        <Alert severity="success" onClose={() => setSuccessMessage(null)} sx={{ mb: 3 }}>
          {successMessage}
        </Alert>
      )}

      {/* Search and Filter Panel */}
      <Paper elevation={1} sx={{ p: 2.5, mb: 3, borderRadius: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={5}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search by full name or phone number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <TextField
              fullWidth
              size="small"
              select
              label="Filter by Role"
              value={selectedRole}
              onChange={(e) => {
                setSelectedRole(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="">All Roles</MenuItem>
              <MenuItem value="SUPER_ADMIN">Super Admin</MenuItem>
              <MenuItem value="COMMUNITY_ADMIN">Community Admin</MenuItem>
              <MenuItem value="MODERATOR">Moderator</MenuItem>
              <MenuItem value="MEMBER">Member</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={6} md={3}>
            <TextField
              fullWidth
              size="small"
              select
              label="Filter by Status"
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="">All Statuses</MenuItem>
              <MenuItem value="ACTIVE">Active</MenuItem>
              <MenuItem value="PENDING">Pending</MenuItem>
              <MenuItem value="SUSPENDED">Suspended</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} md={1}>
            <Button
              fullWidth
              size="small"
              variant="text"
              onClick={() => {
                setSearchTerm('');
                setSelectedRole('');
                setSelectedStatus('');
                setPage(0);
              }}
              sx={{ textTransform: 'none' }}
            >
              Reset
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Members Data Table */}
      <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <TableContainer sx={{ minHeight: 360 }}>
          <Table aria-label="members table">
            <TableHead sx={{ bgcolor: '#f1f5f9' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Member</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Phone Number</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Role</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Joined</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <CircularProgress color="secondary" size={36} />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                      Loading member directory...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      No members found
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Try adjusting your search criteria or filter options.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((member) => {
                  const isSelf = currentAdmin?.id === member.id;
                  const isSuperAdminTarget = member.role === UserRole.SUPER_ADMIN;
                  const canAlterStatus = !isSelf && (currentAdmin?.role === UserRole.SUPER_ADMIN || !isSuperAdminTarget);

                  return (
                    <TableRow key={member.id} hover>
                      {/* Name & Avatar */}
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1.5}>
                          <Avatar
                            src={member.profile?.avatarUrl || undefined}
                            sx={{ bgcolor: 'secondary.light', width: 38, height: 38 }}
                          >
                            {member.profile?.fullName?.charAt(0) || <PersonIcon />}
                          </Avatar>
                          <Box>
                            <Typography variant="body2" fontWeight="bold">
                              {member.profile?.fullName || 'Unnamed Member'}
                              {isSelf && (
                                <Typography component="span" variant="caption" color="secondary" sx={{ ml: 1 }}>
                                  (You)
                                </Typography>
                              )}
                            </Typography>
                            {member.profile?.city && (
                              <Typography variant="caption" color="text.secondary">
                                {member.profile.city}
                                {member.profile.state ? `, ${member.profile.state}` : ''}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </TableCell>

                      {/* Phone */}
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {member.phone}
                          </Typography>
                          {member.isPhoneVerified && (
                            <Tooltip title="Verified Mobile">
                              <VerifiedIcon color="primary" sx={{ fontSize: 16 }} />
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>

                      {/* Role */}
                      <TableCell>{getRoleChip(member.role)}</TableCell>

                      {/* Status */}
                      <TableCell>{getStatusChip(member.status)}</TableCell>

                      {/* Joined Date */}
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {new Date(member.createdAt).toLocaleDateString()}
                        </Typography>
                      </TableCell>

                      {/* Actions */}
                      <TableCell align="right">
                        <Tooltip title="View Safe Details">
                          <IconButton
                            size="small"
                            color="secondary"
                            onClick={() => handleOpenDetails(member.id)}
                          >
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>

                        {canAlterStatus && (
                          <Tooltip
                            title={
                              member.status === UserStatus.SUSPENDED
                                ? 'Reactivate Account'
                                : 'Suspend Account'
                            }
                          >
                            <IconButton
                              size="small"
                              color={member.status === UserStatus.SUSPENDED ? 'success' : 'error'}
                              onClick={() => handleOpenStatusDialog(member)}
                            >
                              {member.status === UserStatus.SUSPENDED ? (
                                <CheckCircleIcon fontSize="small" />
                              ) : (
                                <BlockIcon fontSize="small" />
                              )}
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        <TablePagination
          rowsPerPageOptions={[5, 10, 25, 50]}
          component="div"
          count={totalUsers}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(_e, newPage) => setPage(newPage)}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
        />
      </Paper>

      {/* Member Details Dialog */}
      <Dialog
        open={Boolean(selectedUserId)}
        onClose={handleCloseDetails}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 'bold' }}>
          Member Profile Details
        </DialogTitle>
        <DialogContent dividers>
          {isLoadingDetails || !userDetails ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress color="secondary" />
            </Box>
          ) : (
            <Box>
              <Box display="flex" alignItems="center" gap={2} mb={2.5}>
                <Avatar
                  src={userDetails.profile?.avatarUrl || undefined}
                  sx={{ width: 56, height: 56, bgcolor: 'secondary.light' }}
                >
                  {userDetails.profile?.fullName?.charAt(0) || <PersonIcon fontSize="large" />}
                </Avatar>
                <Box>
                  <Typography variant="h6" fontWeight="bold">
                    {userDetails.profile?.fullName || 'Unnamed Member'}
                  </Typography>
                  <Box display="flex" gap={1} mt={0.5}>
                    {getRoleChip(userDetails.role)}
                    {getStatusChip(userDetails.status)}
                  </Box>
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Phone Number
                  </Typography>
                  <Box display="flex" alignItems="center" gap={0.5} mt={0.5}>
                    <PhoneIcon fontSize="small" color="action" />
                    <Typography variant="body2" fontWeight="medium">
                      {userDetails.phone}
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Phone Verification
                  </Typography>
                  <Typography variant="body2" fontWeight="medium" mt={0.5}>
                    {userDetails.isPhoneVerified ? 'Verified' : 'Unverified'}
                  </Typography>
                </Grid>

                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Gender
                  </Typography>
                  <Typography variant="body2" mt={0.5}>
                    {userDetails.profile?.gender || 'Not specified'}
                  </Typography>
                </Grid>

                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Location
                  </Typography>
                  <Box display="flex" alignItems="center" gap={0.5} mt={0.5}>
                    <LocationIcon fontSize="small" color="action" />
                    <Typography variant="body2">
                      {userDetails.profile?.city
                        ? `${userDetails.profile.city}, ${userDetails.profile.state || ''}`
                        : 'Not specified'}
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Sub-Caste
                  </Typography>
                  <Typography variant="body2" mt={0.5}>
                    {userDetails.profile?.subCaste || 'Not specified'}
                  </Typography>
                </Grid>

                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Gotra
                  </Typography>
                  <Typography variant="body2" mt={0.5}>
                    {userDetails.profile?.gotra || 'Not specified'}
                  </Typography>
                </Grid>

                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Bio
                  </Typography>
                  <Typography variant="body2" mt={0.5} sx={{ fontStyle: userDetails.profile?.bio ? 'normal' : 'italic' }}>
                    {userDetails.profile?.bio || 'No bio provided'}
                  </Typography>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              {/* Engagement Stats */}
              <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                Community Engagement
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={4}>
                  <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                    <Typography variant="h6" fontWeight="bold">
                      {userDetails._count?.posts || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Posts
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={4}>
                  <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                    <Typography variant="h6" fontWeight="bold">
                      {userDetails._count?.groupMemberships || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Groups
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={4}>
                  <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                    <Typography variant="h6" fontWeight="bold">
                      {userDetails._count?.comments || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Comments
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>

              <Box sx={{ mt: 2, pt: 1 }}>
                <Typography variant="caption" color="text.secondary" display="block">
                  User ID: <span style={{ fontFamily: 'monospace' }}>{userDetails.id}</span>
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDetails}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Status Confirmation Dialog */}
      <Dialog
        open={Boolean(statusDialogTarget)}
        onClose={handleCloseStatusDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 'bold' }}>
          {statusDialogAction === 'SUSPENDED' ? 'Suspend Member Account' : 'Reactivate Member Account'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {statusDialogAction === 'SUSPENDED' ? (
              <>
                Are you sure you want to suspend the account of{' '}
                <strong>{statusDialogTarget?.profile?.fullName || statusDialogTarget?.phone}</strong>?
                This will immediately terminate all active sessions and block community access.
              </>
            ) : (
              <>
                Are you sure you want to reactivate the account of{' '}
                <strong>{statusDialogTarget?.profile?.fullName || statusDialogTarget?.phone}</strong>?
                They will regain full community permissions based on their role.
              </>
            )}
          </DialogContentText>

          <TextField
            fullWidth
            label="Reason for Status Change (Audit Log)"
            multiline
            rows={3}
            placeholder="e.g. Terms violation, account verification resolved..."
            value={statusReason}
            onChange={(e) => setStatusReason(e.target.value)}
            disabled={isUpdatingStatus}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseStatusDialog} disabled={isUpdatingStatus}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color={statusDialogAction === 'SUSPENDED' ? 'error' : 'success'}
            onClick={handleConfirmStatusChange}
            disabled={isUpdatingStatus}
            startIcon={isUpdatingStatus ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {isUpdatingStatus ? 'Updating...' : statusDialogAction === 'SUSPENDED' ? 'Confirm Suspension' : 'Confirm Activation'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MemberManagementPage;
