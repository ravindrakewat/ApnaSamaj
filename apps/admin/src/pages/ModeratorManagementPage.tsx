import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
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
  Divider,
  Alert,
  CircularProgress,
  Avatar,
  InputAdornment,
  Snackbar,
  Stack,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Shield as ShieldIcon,
  Security as SecurityIcon,
  AdminPanelSettings as AdminIcon,
  Person as PersonIcon,
  CheckCircle as CheckCircleIcon,
  Block as BlockIcon,
  Phone as PhoneIcon,
  VerifiedUser as VerifiedIcon,
  WarningAmber as WarningIcon,
  RemoveCircleOutline as RevokeIcon,
  AddModerator as PromoteIcon,
} from '@mui/icons-material';
import {
  AdminUserListItem,
  UserRole,
  UserStatus,
} from '@apnasamaj/shared-types';
import { useAuth } from '../context/AuthContext';
import {
  fetchAdminUsers,
  updateAdminUserRole,
} from '../services/admin.users.service';
import { getActiveCommunitySlug } from '../services/api.client';

export const ModeratorManagementPage: React.FC = () => {
  const { user: currentAdmin } = useAuth();
  const activeCommunitySlug = getActiveCommunitySlug() || currentAdmin?.communitySlug || 'kewat';

  // List State
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [page, setPage] = useState(0); // 0-indexed for MUI TablePagination
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalUsers, setTotalUsers] = useState(0);

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilterTab, setRoleFilterTab] = useState<'ALL' | 'MODERATORS' | 'MEMBERS'>('ALL');

  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<{ text: string; severity: 'success' | 'error' } | null>(null);

  // Privilege Change Dialog State
  const [targetUser, setTargetUser] = useState<AdminUserListItem | null>(null);
  const [targetNewRole, setTargetNewRole] = useState<'MODERATOR' | 'MEMBER' | null>(null);
  const [changeReason, setChangeReason] = useState('');
  const [isSubmittingRoleChange, setIsSubmittingRoleChange] = useState(false);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(0);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const roleParam =
        roleFilterTab === 'MODERATORS'
          ? UserRole.MODERATOR
          : roleFilterTab === 'MEMBERS'
          ? UserRole.MEMBER
          : undefined;

      const data = await fetchAdminUsers({
        page: page + 1,
        limit: rowsPerPage,
        search: debouncedSearch || undefined,
        role: roleParam,
      });

      setUsers(data.users);
      setTotalUsers(data.pagination.totalUsers);
    } catch (err: unknown) {
      console.error('[Moderator Management] Failed to load users:', err);
      const msg = err instanceof Error ? err.message : 'Failed to load community members.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [page, rowsPerPage, debouncedSearch, roleFilterTab]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleOpenRoleChangeDialog = (user: AdminUserListItem, newRole: 'MODERATOR' | 'MEMBER') => {
    setTargetUser(user);
    setTargetNewRole(newRole);
    setChangeReason('');
  };

  const handleCloseRoleChangeDialog = () => {
    if (isSubmittingRoleChange) return;
    setTargetUser(null);
    setTargetNewRole(null);
    setChangeReason('');
  };

  const handleConfirmRoleChange = async () => {
    if (!targetUser || !targetNewRole) return;

    setIsSubmittingRoleChange(true);
    try {
      await updateAdminUserRole(
        targetUser.id,
        targetNewRole,
        changeReason.trim() ? changeReason.trim() : undefined
      );

      const actionText = targetNewRole === 'MODERATOR' ? 'promoted to Moderator' : 'restored to Member';
      setSnackbarMessage({
        text: `User ${targetUser.profile?.fullName || targetUser.phone} was successfully ${actionText}.`,
        severity: 'success',
      });

      handleCloseRoleChangeDialog();
      await loadUsers();
    } catch (err: unknown) {
      console.error('[Moderator Management] Role update failed:', err);
      const msg = err instanceof Error ? err.message : 'Failed to update user role.';
      setSnackbarMessage({
        text: msg,
        severity: 'error',
      });
    } finally {
      setIsSubmittingRoleChange(false);
    }
  };

  const getRoleChip = (role: UserRole) => {
    switch (role) {
      case UserRole.SUPER_ADMIN:
        return (
          <Chip
            icon={<SecurityIcon sx={{ fontSize: '1rem !important' }} />}
            label="Super Admin"
            color="secondary"
            variant="filled"
            size="small"
            sx={{ fontWeight: 700 }}
          />
        );
      case UserRole.COMMUNITY_ADMIN:
        return (
          <Chip
            icon={<AdminIcon sx={{ fontSize: '1rem !important' }} />}
            label="Community Admin"
            color="primary"
            variant="filled"
            size="small"
            sx={{ fontWeight: 700 }}
          />
        );
      case UserRole.MODERATOR:
        return (
          <Chip
            icon={<ShieldIcon sx={{ fontSize: '1rem !important' }} />}
            label="Moderator"
            color="info"
            variant="filled"
            size="small"
            sx={{ fontWeight: 700 }}
          />
        );
      case UserRole.MEMBER:
      default:
        return (
          <Chip
            icon={<PersonIcon sx={{ fontSize: '1rem !important' }} />}
            label="Member"
            variant="outlined"
            size="small"
          />
        );
    }
  };

  const getStatusChip = (status: UserStatus) => {
    switch (status) {
      case UserStatus.ACTIVE:
        return (
          <Chip
            icon={<CheckCircleIcon sx={{ fontSize: '0.9rem !important' }} />}
            label="Active"
            color="success"
            size="small"
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
        );
      case UserStatus.SUSPENDED:
        return (
          <Chip
            icon={<BlockIcon sx={{ fontSize: '0.9rem !important' }} />}
            label="Suspended"
            color="error"
            size="small"
            variant="filled"
            sx={{ fontWeight: 600 }}
          />
        );
      default:
        return <Chip label={status} size="small" variant="outlined" />;
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Page Header */}
      <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }} elevation={1}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          spacing={2}
        >
          <Box>
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <ShieldIcon color="primary" sx={{ fontSize: 32 }} />
              <Typography variant="h5" component="h1" fontWeight={700}>
                Community Moderator Management
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Assign and revoke community moderator privileges for verified members of{' '}
              <strong>{activeCommunitySlug.toUpperCase()} Samaj</strong>.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Chip
              label={`Active Community: ${activeCommunitySlug.toUpperCase()}`}
              color="primary"
              variant="outlined"
              sx={{ fontWeight: 600 }}
            />
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={loadUsers}
              disabled={isLoading}
              size="small"
            >
              Refresh
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* Filter & Search Bar */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }} elevation={1}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', md: 'center' }}
          spacing={2}
        >
          <Tabs
            value={roleFilterTab}
            onChange={(_, val) => {
              setRoleFilterTab(val);
              setPage(0);
            }}
            indicatorColor="primary"
            textColor="primary"
            sx={{ minHeight: 44 }}
          >
            <Tab label="All Members" value="ALL" sx={{ fontWeight: 600 }} />
            <Tab
              label="Active Moderators"
              value="MODERATORS"
              icon={<ShieldIcon sx={{ fontSize: '1rem !important' }} />}
              iconPosition="start"
              sx={{ fontWeight: 600 }}
            />
            <Tab label="Eligible Members" value="MEMBERS" sx={{ fontWeight: 600 }} />
          </Tabs>

          <TextField
            size="small"
            placeholder="Search by full name or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ minWidth: { xs: '100%', md: 320 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
            }}
          />
        </Stack>
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={loadUsers}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {/* Main Table */}
      <TableContainer component={Paper} elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Table sx={{ minWidth: 700 }}>
          <TableHead sx={{ bgcolor: 'action.hover' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Member</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Phone</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Location</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Current Role</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Account Status</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>
                Moderator Privileges
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={36} />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                    Loading community members...
                  </Typography>
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                  <Typography variant="subtitle1" fontWeight={600} color="text.secondary">
                    No matching members found
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {debouncedSearch
                      ? 'Try adjusting your search criteria.'
                      : 'There are no members listed in this category.'}
                  </Typography>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<RefreshIcon />}
                    onClick={loadUsers}
                    sx={{ mt: 2 }}
                  >
                    Reload
                  </Button>
                </TableCell>
              </TableRow>
            ) : (
              users.map((member) => {
                const isCurrentSelf = currentAdmin?.id === member.id;
                const isProtectedAdmin =
                  member.role === UserRole.COMMUNITY_ADMIN || member.role === UserRole.SUPER_ADMIN;
                const isSuspended = member.status === UserStatus.SUSPENDED;

                return (
                  <TableRow
                    key={member.id}
                    hover
                    sx={{
                      bgcolor: isCurrentSelf ? 'action.selected' : 'inherit',
                      '&:last-child td, &:last-child th': { border: 0 },
                    }}
                  >
                    {/* Member Info */}
                    <TableCell>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Avatar
                          src={member.profile?.avatarUrl || undefined}
                          sx={{ width: 36, height: 36, bgcolor: 'primary.light' }}
                        >
                          {member.profile?.fullName?.charAt(0) || <PersonIcon />}
                        </Avatar>
                        <Box>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <Typography variant="body2" fontWeight={600}>
                              {member.profile?.fullName || 'Unnamed Member'}
                            </Typography>
                            {isCurrentSelf && (
                              <Chip
                                label="You"
                                size="small"
                                color="info"
                                variant="outlined"
                                sx={{ height: 18, fontSize: '0.65rem' }}
                              />
                            )}
                          </Stack>
                          {member.profile?.subCaste && (
                            <Typography variant="caption" color="text.secondary">
                              Sub-caste: {member.profile.subCaste}
                            </Typography>
                          )}
                        </Box>
                      </Stack>
                    </TableCell>

                    {/* Phone */}
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {member.phone}
                      </Typography>
                    </TableCell>

                    {/* Location */}
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {member.profile?.city && member.profile?.state
                          ? `${member.profile.city}, ${member.profile.state}`
                          : member.profile?.city || member.profile?.state || '—'}
                      </Typography>
                    </TableCell>

                    {/* Current Role */}
                    <TableCell>{getRoleChip(member.role)}</TableCell>

                    {/* Account Status */}
                    <TableCell>{getStatusChip(member.status)}</TableCell>

                    {/* Moderator Privilege Action */}
                    <TableCell align="right">
                      {isCurrentSelf ? (
                        <Tooltip title="You cannot modify your own administrative role">
                          <span>
                            <Button size="small" disabled variant="text">
                              Cannot Edit Self
                            </Button>
                          </span>
                        </Tooltip>
                      ) : isProtectedAdmin ? (
                        <Tooltip title="Community administrators and super admins cannot have roles altered here">
                          <span>
                            <Button size="small" disabled variant="text">
                              Protected Admin
                            </Button>
                          </span>
                        </Tooltip>
                      ) : member.role === UserRole.MODERATOR ? (
                        <Tooltip title="Revoke moderator permissions and restore to regular member">
                          <Button
                            variant="outlined"
                            color="error"
                            size="small"
                            startIcon={<RevokeIcon />}
                            onClick={() => handleOpenRoleChangeDialog(member, 'MEMBER')}
                          >
                            Revoke Moderator
                          </Button>
                        </Tooltip>
                      ) : member.role === UserRole.MEMBER ? (
                        <Tooltip
                          title={
                            isSuspended
                              ? 'Suspended accounts should be reviewed before granting moderator privileges'
                              : 'Promote this member to community moderator'
                          }
                        >
                          <Button
                            variant="contained"
                            color="primary"
                            size="small"
                            startIcon={<PromoteIcon />}
                            onClick={() => handleOpenRoleChangeDialog(member, 'MODERATOR')}
                          >
                            Promote to Moderator
                          </Button>
                        </Tooltip>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          No actions available
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        <TablePagination
          component="div"
          count={totalUsers}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[5, 10, 25, 50]}
        />
      </TableContainer>

      {/* Confirmation Dialog for Role Promotion / Revocation */}
      <Dialog
        open={Boolean(targetUser && targetNewRole)}
        onClose={handleCloseRoleChangeDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            {targetNewRole === 'MODERATOR' ? (
              <ShieldIcon color="primary" sx={{ fontSize: 28 }} />
            ) : (
              <WarningIcon color="warning" sx={{ fontSize: 28 }} />
            )}
            <Typography variant="h6" fontWeight={700}>
              {targetNewRole === 'MODERATOR'
                ? 'Confirm Moderator Promotion'
                : 'Confirm Moderator Revocation'}
            </Typography>
          </Stack>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          {targetUser && (
            <Box>
              <Alert
                severity={targetNewRole === 'MODERATOR' ? 'info' : 'warning'}
                sx={{ mb: 2.5 }}
              >
                {targetNewRole === 'MODERATOR' ? (
                  <>
                    Granting <strong>Moderator</strong> privileges enables this member to review the
                    moderation queue, delete reported posts and comments, and pin announcements
                    within the <strong>{activeCommunitySlug.toUpperCase()} Samaj</strong> community.
                  </>
                ) : (
                  <>
                    Revoking moderator privileges will return this account to standard{' '}
                    <strong>Member</strong> status. They will immediately lose access to the
                    moderation queue and administrative actions.
                  </>
                )}
              </Alert>

              <Typography variant="body2" sx={{ mb: 2 }}>
                Target Member:{' '}
                <strong>{targetUser.profile?.fullName || 'Unnamed Member'}</strong> (
                <code>{targetUser.phone}</code>)
              </Typography>

              <TextField
                label="Reason or Administrative Note (Optional)"
                fullWidth
                multiline
                rows={3}
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                placeholder={
                  targetNewRole === 'MODERATOR'
                    ? 'e.g., Appointed community youth volunteer moderator'
                    : 'e.g., Term ended or voluntary resignation'
                }
                helperText="This reason will be recorded in the immutable audit log."
                disabled={isSubmittingRoleChange}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={handleCloseRoleChangeDialog} disabled={isSubmittingRoleChange}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color={targetNewRole === 'MODERATOR' ? 'primary' : 'error'}
            onClick={handleConfirmRoleChange}
            disabled={isSubmittingRoleChange}
            startIcon={
              isSubmittingRoleChange ? (
                <CircularProgress size={18} color="inherit" />
              ) : targetNewRole === 'MODERATOR' ? (
                <PromoteIcon />
              ) : (
                <RevokeIcon />
              )
            }
          >
            {isSubmittingRoleChange
              ? 'Saving...'
              : targetNewRole === 'MODERATOR'
              ? 'Confirm Promotion'
              : 'Confirm Revocation'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Notification Snackbar */}
      <Snackbar
        open={Boolean(snackbarMessage)}
        autoHideDuration={5000}
        onClose={() => setSnackbarMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snackbarMessage ? (
          <Alert
            onClose={() => setSnackbarMessage(null)}
            severity={snackbarMessage.severity}
            sx={{ width: '100%' }}
          >
            {snackbarMessage.text}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
};

export default ModeratorManagementPage;
