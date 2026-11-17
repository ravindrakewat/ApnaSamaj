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
  Stack,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  People as PeopleIcon,
  Lock as LockIcon,
  Public as PublicIcon,
  Security as SecurityIcon,
  PersonRemove as PersonRemoveIcon,
} from '@mui/icons-material';
import {
  GroupListItem,
  GroupDetails,
  GroupPrivacy,
  GroupMemberRole,
  GroupMemberItem,
} from '@apnasamaj/shared-types';
import {
  fetchAdminGroups,
  fetchAdminGroupBySlug,
  createAdminGroup,
  updateAdminGroup,
  deleteAdminGroup,
  fetchAdminGroupMembers,
  updateAdminGroupMemberRole,
  removeAdminGroupMember,
} from '../services/admin.groups.service';

export const GroupManagementPage: React.FC = () => {
  // List State
  const [groups, setGroups] = useState<GroupListItem[]>([]);
  const [page, setPage] = useState(0); // 0-indexed for TablePagination
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalGroups, setTotalGroups] = useState(0);

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedPrivacy, setSelectedPrivacy] = useState<string>('ALL');

  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Create/Edit Group Dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPrivacy, setFormPrivacy] = useState<GroupPrivacy>(GroupPrivacy.PUBLIC);
  const [isSavingGroup, setIsSavingGroup] = useState(false);

  // Delete Group Dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<GroupListItem | null>(null);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);

  // Roster Management Dialog
  const [rosterDialogOpen, setRosterDialogOpen] = useState(false);
  const [rosterGroup, setRosterGroup] = useState<GroupListItem | null>(null);
  const [members, setMembers] = useState<GroupMemberItem[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(0);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const loadGroups = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAdminGroups({
        page: page + 1,
        limit: rowsPerPage,
        search: debouncedSearch.trim() || undefined,
      });

      let list = data.groups;
      if (selectedPrivacy !== 'ALL') {
        list = list.filter((g) => g.privacy === selectedPrivacy);
      }

      setGroups(list);
      setTotalGroups(data.pagination.totalGroups);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load community groups.');
    } finally {
      setIsLoading(false);
    }
  }, [page, rowsPerPage, debouncedSearch, selectedPrivacy]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  // Open Create Dialog
  const handleOpenCreate = () => {
    setIsEditing(false);
    setActiveGroupId(null);
    setFormName('');
    setFormDescription('');
    setFormPrivacy(GroupPrivacy.PUBLIC);
    setEditDialogOpen(true);
  };

  // Open Edit Dialog
  const handleOpenEdit = (group: GroupListItem) => {
    setIsEditing(true);
    setActiveGroupId(group.id);
    setFormName(group.name);
    setFormDescription(group.description || '');
    setFormPrivacy(group.privacy);
    setEditDialogOpen(true);
  };

  // Submit Create or Edit Group
  const handleSaveGroup = async () => {
    if (!formName.trim()) {
      setError('Group name is required.');
      return;
    }

    setIsSavingGroup(true);
    setError(null);
    try {
      if (isEditing && activeGroupId) {
        await updateAdminGroup(activeGroupId, {
          name: formName.trim(),
          description: formDescription.trim() || null,
          privacy: formPrivacy,
        });
        setSuccessMessage('Group settings updated successfully.');
      } else {
        await createAdminGroup({
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          privacy: formPrivacy,
        });
        setSuccessMessage('New community group created successfully.');
      }
      setEditDialogOpen(false);
      loadGroups();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save group.');
    } finally {
      setIsSavingGroup(false);
    }
  };

  // Open Delete Confirmation
  const handleOpenDelete = (group: GroupListItem) => {
    setGroupToDelete(group);
    setDeleteDialogOpen(true);
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!groupToDelete) return;
    setIsDeletingGroup(true);
    setError(null);
    try {
      await deleteAdminGroup(groupToDelete.id);
      setSuccessMessage(`Group "${groupToDelete.name}" deleted successfully.`);
      setDeleteDialogOpen(false);
      setGroupToDelete(null);
      loadGroups();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete group.');
    } finally {
      setIsDeletingGroup(false);
    }
  };

  // Open Roster
  const handleOpenRoster = async (group: GroupListItem) => {
    setRosterGroup(group);
    setRosterDialogOpen(true);
    setIsLoadingMembers(true);
    try {
      const data = await fetchAdminGroupMembers(group.id);
      setMembers(data.members || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch roster.');
    } finally {
      setIsLoadingMembers(false);
    }
  };

  // Change Member Role
  const handleChangeMemberRole = async (userId: string, role: GroupMemberRole) => {
    if (!rosterGroup) return;
    try {
      await updateAdminGroupMemberRole(rosterGroup.id, userId, role);
      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, role } : m))
      );
      setSuccessMessage('Member role updated.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update member role.');
    }
  };

  // Remove Member
  const handleRemoveMember = async (userId: string) => {
    if (!rosterGroup) return;
    try {
      await removeAdminGroupMember(rosterGroup.id, userId);
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
      setSuccessMessage('Member removed from group.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove member.');
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h5" fontWeight="bold">
            Group Governance / समूह प्रबंधन
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage community groups, privacy settings, member rosters, and access policies.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenCreate}
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          Create Group / नया समूह
        </Button>
      </Box>

      {/* Alerts */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {successMessage && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}

      {/* Filters Bar */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={8}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search groups by name or slug..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={3}>
            <TextField
              select
              fullWidth
              size="small"
              label="Privacy"
              value={selectedPrivacy}
              onChange={(e) => setSelectedPrivacy(e.target.value)}
            >
              <MenuItem value="ALL">All Privacy</MenuItem>
              <MenuItem value={GroupPrivacy.PUBLIC}>Public (खुला)</MenuItem>
              <MenuItem value={GroupPrivacy.PRIVATE}>Private (निजी)</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={2} md={1}>
            <Tooltip title="Refresh List">
              <IconButton onClick={loadGroups} color="primary" disabled={isLoading}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Grid>
        </Grid>
      </Paper>

      {/* Groups Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell sx={{ fontWeight: 'bold' }}>Group Name / Slug</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Privacy</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Members</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Posts</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Created</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={32} />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Loading groups...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : groups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <Typography variant="body1" color="text.secondary">
                      No groups found matching your criteria.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                groups.map((group) => (
                  <TableRow key={group.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar
                          src={group.coverUrl || undefined}
                          sx={{ width: 40, height: 40, bgcolor: 'primary.light', fontWeight: 'bold' }}
                        >
                          {group.name.charAt(0).toUpperCase()}
                        </Avatar>
                        <Box>
                          <Typography variant="subtitle2" fontWeight="bold">
                            {group.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            /{group.slug}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        icon={group.privacy === GroupPrivacy.PRIVATE ? <LockIcon fontSize="small" /> : <PublicIcon fontSize="small" />}
                        label={group.privacy === GroupPrivacy.PRIVATE ? 'Private' : 'Public'}
                        color={group.privacy === GroupPrivacy.PRIVATE ? 'secondary' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {group.membersCount ?? 0}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {group.postsCount ?? 0}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(group.createdAt).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip title="Manage Roster">
                          <IconButton
                            size="small"
                            color="info"
                            onClick={() => handleOpenRoster(group)}
                          >
                            <PeopleIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit Settings">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleOpenEdit(group)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete Group">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleOpenDelete(group)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={totalGroups}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[5, 10, 25, 50]}
        />
      </Paper>

      {/* Create / Edit Group Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 'bold' }}>
          {isEditing ? 'Edit Group Settings / समूह संपादन' : 'Create New Group / नया समूह बनाएं'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField
              fullWidth
              label="Group Name / समूह का नाम"
              required
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Samaj Youth Club"
            />

            <TextField
              fullWidth
              multiline
              rows={3}
              label="Description / विवरण"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="State the purpose and objectives of this group..."
            />

            <FormControl fullWidth>
              <InputLabel id="group-privacy-label">Privacy / गोपनीयता</InputLabel>
              <Select
                labelId="group-privacy-label"
                value={formPrivacy}
                label="Privacy / गोपनीयता"
                onChange={(e) => setFormPrivacy(e.target.value as GroupPrivacy)}
              >
                <MenuItem value={GroupPrivacy.PUBLIC}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PublicIcon fontSize="small" color="primary" />
                    <Box>
                      <Typography variant="body2" fontWeight="bold">
                        Public (खुला समूह)
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Visible to all community members; anyone can join and participate.
                      </Typography>
                    </Box>
                  </Box>
                </MenuItem>
                <MenuItem value={GroupPrivacy.PRIVATE}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LockIcon fontSize="small" color="secondary" />
                    <Box>
                      <Typography variant="body2" fontWeight="bold">
                        Private (निजी समूह)
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Only admitted members can see discussions, roster, and messages.
                      </Typography>
                    </Box>
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setEditDialogOpen(false)} color="inherit">
            Cancel / रद्द करें
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveGroup}
            disabled={isSavingGroup}
            startIcon={isSavingGroup ? <CircularProgress size={16} /> : null}
            sx={{ fontWeight: 600 }}
          >
            {isSavingGroup ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Group'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Group Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 'bold', color: 'error.main' }}>
          Delete Group / समूह हटाएं
        </DialogTitle>
        <DialogContent dividers>
          <DialogContentText>
            Are you sure you want to delete group <strong>"{groupToDelete?.name}"</strong>? This will permanently remove all discussions, group messages, and memberships.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmDelete}
            disabled={isDeletingGroup}
            startIcon={isDeletingGroup ? <CircularProgress size={16} /> : null}
          >
            {isDeletingGroup ? 'Deleting...' : 'Delete Group'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Roster Management Dialog */}
      <Dialog
        open={rosterDialogOpen}
        onClose={() => setRosterDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 'bold' }}>
          Roster Governance: {rosterGroup?.name}
        </DialogTitle>
        <DialogContent dividers>
          {isLoadingMembers ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <CircularProgress size={32} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Loading member roster...
              </Typography>
            </Box>
          ) : members.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No members found in this group roster.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Member</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Role</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Joined</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar
                          src={member.user?.avatarUrl || undefined}
                          sx={{ width: 32, height: 32 }}
                        >
                          {(member.user?.fullName || 'U').charAt(0).toUpperCase()}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight="bold">
                            {member.user?.fullName || 'Community Member'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {member.user?.city ? `${member.user.city}, ${member.user.state}` : ''}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Select
                        size="small"
                        value={member.role}
                        onChange={(e) =>
                          handleChangeMemberRole(member.userId, e.target.value as GroupMemberRole)
                        }
                        sx={{ fontSize: '0.8rem', minWidth: 120 }}
                      >
                        <MenuItem value={GroupMemberRole.ADMIN}>ADMIN</MenuItem>
                        <MenuItem value={GroupMemberRole.MODERATOR}>MODERATOR</MenuItem>
                        <MenuItem value={GroupMemberRole.MEMBER}>MEMBER</MenuItem>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(member.joinedAt).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Remove Member from Group">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleRemoveMember(member.userId)}
                        >
                          <PersonRemoveIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setRosterDialogOpen(false)} color="inherit">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
