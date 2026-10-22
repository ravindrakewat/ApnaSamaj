import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Paper,
  Grid,
  Card,
  CardMedia,
  CardContent,
  Avatar,
  Chip,
  Button,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Divider,
  Pagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  MenuItem,
  Select,
  FormControl,
  FormLabel,
  RadioGroup,
  Radio,
  FormControlLabel,
  Snackbar,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Groups as GroupsIcon,
  Lock as LockIcon,
  Public as PublicIcon,
  CalendarToday as CalendarIcon,
  People as PeopleIcon,
  DynamicFeed as DynamicFeedIcon,
  Shield as AdminIcon,
  Security as ModIcon,
  Person as MemberIcon,
  LocationOn as LocationIcon,
  Settings as SettingsIcon,
  Delete as DeleteIcon,
  PhotoCamera as PhotoCameraIcon,
  Forum as ChatIcon,
} from '@mui/icons-material';
import { GroupDetails, GroupPrivacy, GroupMemberRole, PostItem } from '@apnasamaj/shared-types';
import {
  fetchGroupBySlug,
  fetchGroupPosts,
  joinGroupApi,
  leaveGroupApi,
  updateGroupApi,
  uploadGroupCoverApi,
  updateMemberRoleApi,
  removeMemberApi,
} from '../services/groups.service';
import { useAuth } from '../context/AuthContext';
import { CreatePostComposer } from '../components/CreatePostComposer';
import { PostCard } from '../components/PostCard';
import { GroupChatTab } from '../components/chat/GroupChatTab';

export const GroupDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  // Group Details State
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [loadingGroup, setLoadingGroup] = useState<boolean>(true);
  const [groupError, setGroupError] = useState<string | null>(null);

  // Tabs state (0: Discussions, 1: Members)
  const [activeTab, setActiveTab] = useState<number>(0);

  // Posts State
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [postsPage, setPostsPage] = useState<number>(1);
  const [totalPostsPages, setTotalPostsPages] = useState<number>(1);
  const [loadingPosts, setLoadingPosts] = useState<boolean>(false);
  const [postsError, setPostsError] = useState<string | null>(null);

  // Membership Actions State
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [openLeaveDialog, setOpenLeaveDialog] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Authenticated user & administrative roles
  const { user } = useAuth();
  const isGroupAdmin = group?.myRole === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isGroupMod = group?.myRole === 'MODERATOR';

  // Edit Group State
  const [openEditDialog, setOpenEditDialog] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editPrivacy, setEditPrivacy] = useState<GroupPrivacy>(GroupPrivacy.PUBLIC);
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
  const [editCoverPreview, setEditCoverPreview] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Member Management State
  const [roleUpdatingUserId, setRoleUpdatingUserId] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<{ userId: string; fullName: string } | null>(null);
  const [openRemoveMemberDialog, setOpenRemoveMemberDialog] = useState<boolean>(false);
  const [removingMember, setRemovingMember] = useState<boolean>(false);

  // Feedback State
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadGroupDetails = useCallback(async () => {
    if (!slug) return;
    setLoadingGroup(true);
    setGroupError(null);
    try {
      const data = await fetchGroupBySlug(slug);
      setGroup(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load group details.';
      setGroupError(msg);
    } finally {
      setLoadingGroup(false);
    }
  }, [slug]);

  const loadGroupDiscussions = useCallback(async () => {
    if (!slug) return;
    setLoadingPosts(true);
    setPostsError(null);
    try {
      const data = await fetchGroupPosts(slug, postsPage);
      setPosts(data.posts);
      setTotalPostsPages(data.pagination.totalPages);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load group discussions.';
      setPostsError(msg);
    } finally {
      setLoadingPosts(false);
    }
  }, [slug, postsPage]);

  useEffect(() => {
    loadGroupDetails();
  }, [loadGroupDetails]);

  useEffect(() => {
    // Only load discussions if group is public OR user is a member
    if (group && (group.privacy === GroupPrivacy.PUBLIC || group.isMember)) {
      loadGroupDiscussions();
    }
  }, [group, loadGroupDiscussions]);

  const handleJoinGroup = async () => {
    if (!group) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await joinGroupApi(group.id);
      await loadGroupDetails();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to join group.';
      setActionError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!group) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await leaveGroupApi(group.id);
      setOpenLeaveDialog(false);
      await loadGroupDetails();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to leave group.';
      setActionError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenEditDialog = () => {
    if (!group) return;
    setEditName(group.name);
    setEditDescription(group.description || '');
    setEditPrivacy(group.privacy);
    setEditCoverFile(null);
    setEditCoverPreview(group.coverUrl || null);
    setEditError(null);
    setOpenEditDialog(true);
  };

  const handleCoverFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setEditCoverFile(file);
      setEditCoverPreview(URL.createObjectURL(file));
    }
  };

  const handleSaveGroupSettings = async () => {
    if (!group) return;
    const trimmedName = editName.trim();
    if (trimmedName.length < 3 || trimmedName.length > 100) {
      setEditError('Group name must be between 3 and 100 characters.');
      return;
    }
    if (editDescription.length > 1000) {
      setEditError('Description cannot exceed 1000 characters.');
      return;
    }

    setEditSaving(true);
    setEditError(null);
    try {
      if (editCoverFile) {
        await uploadGroupCoverApi(group.id, editCoverFile);
      }
      await updateGroupApi(group.id, {
        name: trimmedName,
        description: editDescription.trim() || undefined,
        privacy: editPrivacy,
      });
      setOpenEditDialog(false);
      setSuccessMessage('Group settings updated successfully.');
      await loadGroupDetails();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update group settings.';
      setEditError(msg);
    } finally {
      setEditSaving(false);
    }
  };

  const handleRoleChange = async (targetUserId: string, newRole: GroupMemberRole) => {
    if (!group) return;
    setRoleUpdatingUserId(targetUserId);
    setActionError(null);
    try {
      await updateMemberRoleApi(group.id, targetUserId, newRole);
      setSuccessMessage('Member role updated successfully.');
      await loadGroupDetails();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update member role.';
      setActionError(msg);
    } finally {
      setRoleUpdatingUserId(null);
    }
  };

  const handleConfirmRemove = async () => {
    if (!group || !memberToRemove) return;
    setRemovingMember(true);
    setActionError(null);
    try {
      await removeMemberApi(group.id, memberToRemove.userId);
      setOpenRemoveMemberDialog(false);
      setSuccessMessage(`${memberToRemove.fullName} has been removed from the group.`);
      setMemberToRemove(null);
      await loadGroupDetails();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove member.';
      setActionError(msg);
    } finally {
      setRemovingMember(false);
    }
  };

  const handlePostCreated = (newPost: PostItem) => {
    setPosts((prev) => [newPost, ...prev]);
    if (group) {
      setGroup({ ...group, postsCount: group.postsCount + 1 });
    }
  };

  const handlePostUpdated = (updated: PostItem) => {
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const handlePostDeleted = (postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    if (group) {
      setGroup({ ...group, postsCount: Math.max(0, group.postsCount - 1) });
    }
  };

  if (loadingGroup) {
    return (
      <Container maxWidth="lg" sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress size={48} />
      </Container>
    );
  }

  if (groupError || !group) {
    return (
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => navigate('/groups')}>
              Back to Groups
            </Button>
          }
          sx={{ borderRadius: 2 }}
        >
          {groupError || 'Group not found.'}
        </Alert>
      </Container>
    );
  }

  const isPrivateAndNonMember = group.privacy === GroupPrivacy.PRIVATE && !group.isMember;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Navigation Breadcrumb */}
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/groups')}
        sx={{ mb: 2, textTransform: 'none' }}
        color="inherit"
      >
        Back to Groups
      </Button>

      {/* Hero Group Card */}
      <Paper
        elevation={2}
        sx={{
          borderRadius: 3,
          overflow: 'hidden',
          mb: 4,
          border: '1px solid rgba(0,0,0,0.08)',
        }}
      >
        {group.coverUrl ? (
          <CardMedia component="img" height="220" image={group.coverUrl} alt={group.name} />
        ) : (
          <Box
            sx={{
              height: 160,
              background:
                group.privacy === GroupPrivacy.PUBLIC
                  ? 'linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%)'
                  : 'linear-gradient(135deg, #263238 0%, #455a64 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}
          >
            <GroupsIcon sx={{ fontSize: 64, opacity: 0.9 }} />
          </Box>
        )}

        <Box p={{ xs: 2.5, sm: 4 }}>
          {actionError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
              {actionError}
            </Alert>
          )}

          {successMessage && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage(null)}>
              {successMessage}
            </Alert>
          )}

          <Box
            display="flex"
            flexDirection={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            gap={2}
            mb={2}
          >
            <Box>
              <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap" mb={0.5}>
                <Typography variant="h4" component="h1" fontWeight="bold">
                  {group.name}
                </Typography>
                <Chip
                  icon={
                    group.privacy === GroupPrivacy.PUBLIC ? (
                      <PublicIcon sx={{ fontSize: '15px !important' }} />
                    ) : (
                      <LockIcon sx={{ fontSize: '15px !important' }} />
                    )
                  }
                  label={group.privacy}
                  color={group.privacy === GroupPrivacy.PUBLIC ? 'success' : 'default'}
                  variant="outlined"
                  size="small"
                  sx={{ fontWeight: 'bold' }}
                />
                {group.myRole && (
                  <Chip
                    icon={
                      group.myRole === 'ADMIN' ? (
                        <AdminIcon sx={{ fontSize: '14px !important' }} />
                      ) : group.myRole === 'MODERATOR' ? (
                        <ModIcon sx={{ fontSize: '14px !important' }} />
                      ) : (
                        <MemberIcon sx={{ fontSize: '14px !important' }} />
                      )
                    }
                    label={`My Role: ${group.myRole}`}
                    color="primary"
                    variant="filled"
                    size="small"
                    sx={{ fontWeight: 'bold' }}
                  />
                )}
              </Box>

              <Typography variant="caption" color="text.secondary">
                Founded by {group.creator.fullName} • Created{' '}
                {new Date(group.createdAt).toLocaleDateString('en-IN', {
                  month: 'short',
                  year: 'numeric',
                })}
              </Typography>
            </Box>

            {/* Action Buttons */}
            <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
              {isGroupAdmin && (
                <Button
                  variant="outlined"
                  color="primary"
                  startIcon={<SettingsIcon />}
                  onClick={handleOpenEditDialog}
                  sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 600 }}
                >
                  Edit Group
                </Button>
              )}
              {group.isMember ? (
                <Button
                  variant="outlined"
                  color="error"
                  disabled={actionLoading}
                  onClick={() => setOpenLeaveDialog(true)}
                  sx={{ textTransform: 'none', borderRadius: 2 }}
                >
                  Leave Group
                </Button>
              ) : group.privacy === GroupPrivacy.PUBLIC ? (
                <Button
                  variant="contained"
                  color="primary"
                  disabled={actionLoading}
                  onClick={handleJoinGroup}
                  sx={{ textTransform: 'none', borderRadius: 2, px: 3, fontWeight: 'bold' }}
                >
                  {actionLoading ? <CircularProgress size={20} color="inherit" /> : 'Join Group'}
                </Button>
              ) : (
                <Chip
                  icon={<LockIcon />}
                  label="Private Group (Membership Required)"
                  color="warning"
                  variant="outlined"
                />
              )}
            </Box>
          </Box>

          {/* Description */}
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            {group.description || 'Welcome to the official discussion circle for this samaj mandal.'}
          </Typography>

          {/* Stats Bar */}
          <Divider sx={{ my: 2 }} />
          <Box display="flex" alignItems="center" gap={3} flexWrap="wrap">
            <Box display="flex" alignItems="center" gap={0.75}>
              <PeopleIcon color="action" fontSize="small" />
              <Typography variant="body2" fontWeight="bold">
                {group.membersCount} Member{group.membersCount === 1 ? '' : 's'}
              </Typography>
            </Box>

            <Box display="flex" alignItems="center" gap={0.75}>
              <DynamicFeedIcon color="action" fontSize="small" />
              <Typography variant="body2" fontWeight="bold">
                {group.postsCount} Discussion{group.postsCount === 1 ? '' : 's'}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Paper>

      {/* Tabs: Discussions vs Members vs Chat */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(_, val) => setActiveTab(val)}
          indicatorColor="primary"
          textColor="primary"
        >
          <Tab
            label={`Discussions (${group.postsCount})`}
            sx={{ textTransform: 'none', fontWeight: 'bold' }}
          />
          <Tab
            label={`Members (${group.membersCount})`}
            sx={{ textTransform: 'none', fontWeight: 'bold' }}
          />
          <Tab
            icon={<ChatIcon sx={{ fontSize: '18px !important' }} />}
            iconPosition="start"
            label="Chat"
            sx={{ textTransform: 'none', fontWeight: 'bold' }}
          />
        </Tabs>
      </Box>

      {/* Tab 0: Discussions */}
      {activeTab === 0 && (
        <Box>
          {isPrivateAndNonMember ? (
            <Paper
              sx={{
                p: 5,
                textAlign: 'center',
                borderRadius: 3,
                bgcolor: 'background.paper',
                border: '1px dashed rgba(0,0,0,0.15)',
              }}
            >
              <LockIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1, opacity: 0.6 }} />
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                Private Group Content
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 450, mx: 'auto' }}>
                Discussions in this group are private and only viewable by authorized group members.
              </Typography>
            </Paper>
          ) : (
            <>
              {/* Post Composer (Only active for members) */}
              {group.isMember ? (
                <Box mb={4}>
                  <CreatePostComposer groupId={group.id} onPostCreated={handlePostCreated} />
                </Box>
              ) : (
                <Paper
                  sx={{
                    p: 2.5,
                    mb: 3,
                    borderRadius: 2.5,
                    bgcolor: 'rgba(25, 118, 210, 0.04)',
                    border: '1px solid rgba(25, 118, 210, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 1.5,
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    Join this group to participate in discussions and publish posts.
                  </Typography>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={handleJoinGroup}
                    disabled={actionLoading}
                    sx={{ textTransform: 'none' }}
                  >
                    Join to Post
                  </Button>
                </Paper>
              )}

              {/* Discussions List */}
              {postsError && (
                <Alert severity="error" sx={{ mb: 3 }}>
                  {postsError}
                </Alert>
              )}

              {loadingPosts && (
                <Box display="flex" justifyContent="center" py={4}>
                  <CircularProgress size={32} />
                </Box>
              )}

              {!loadingPosts && posts.length === 0 && (
                <Paper
                  sx={{
                    py: 6,
                    px: 3,
                    textAlign: 'center',
                    borderRadius: 3,
                    border: '1px dashed rgba(0,0,0,0.12)',
                  }}
                >
                  <DynamicFeedIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1, opacity: 0.5 }} />
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    No Discussions Yet
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Be the first to start a conversation in this group!
                  </Typography>
                </Paper>
              )}

              {!loadingPosts && posts.length > 0 && (
                <Box>
                  {posts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onPostUpdated={handlePostUpdated}
                      onPostDeleted={handlePostDeleted}
                    />
                  ))}

                  {totalPostsPages > 1 && (
                    <Box display="flex" justifyContent="center" mt={4} mb={2}>
                      <Pagination
                        count={totalPostsPages}
                        page={postsPage}
                        onChange={(_, val) => setPostsPage(val)}
                        color="primary"
                        shape="rounded"
                      />
                    </Box>
                  )}
                </Box>
              )}
            </>
          )}
        </Box>
      )}

      {/* Tab 1: Members */}
      {activeTab === 1 && (
        <Box>
          {isPrivateAndNonMember ? (
            <Paper
              sx={{
                p: 5,
                textAlign: 'center',
                borderRadius: 3,
                bgcolor: 'background.paper',
                border: '1px dashed rgba(0,0,0,0.15)',
              }}
            >
              <LockIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1, opacity: 0.6 }} />
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                Private Group Roster
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 450, mx: 'auto' }}>
                The member roster for this private group is hidden.
              </Typography>
            </Paper>
          ) : (
            <Grid container spacing={2}>
              {(group.members || []).map((m) => {
                const isSelf = user?.id === m.userId;
                const canManageRoles = isGroupAdmin && !isSelf;
                const canRemove =
                  !isSelf &&
                  (isGroupAdmin
                    ? m.role === 'MODERATOR' || m.role === 'MEMBER'
                    : isGroupMod
                    ? m.role === 'MEMBER'
                    : false);

                return (
                  <Grid item xs={12} sm={6} md={4} key={m.id}>
                    <Card
                      variant="outlined"
                      sx={{
                        p: 2,
                        borderRadius: 2.5,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1.5,
                        position: 'relative',
                        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
                        '&:hover': {
                          boxShadow: 2,
                          borderColor: 'primary.light',
                        },
                      }}
                    >
                      <Box display="flex" alignItems="center" gap={1.5}>
                        <Avatar
                          src={m.user.avatarUrl || undefined}
                          alt={m.user.fullName}
                          sx={{ width: 48, height: 48, bgcolor: 'primary.main', fontWeight: 'bold' }}
                        >
                          {m.user.fullName.charAt(0).toUpperCase()}
                        </Avatar>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Box display="flex" alignItems="center" gap={0.75} flexWrap="wrap">
                            <Typography variant="subtitle2" fontWeight="bold" noWrap title={m.user.fullName}>
                              {m.user.fullName}
                            </Typography>
                            {isSelf && (
                              <Chip
                                label="You"
                                size="small"
                                color="info"
                                variant="outlined"
                                sx={{ height: 18, fontSize: '0.62rem', fontWeight: 600 }}
                              />
                            )}
                          </Box>
                          {(m.user.city || m.user.state) && (
                            <Typography variant="caption" color="text.secondary" noWrap display="block">
                              {[m.user.city, m.user.state].filter(Boolean).join(', ')}
                            </Typography>
                          )}
                        </Box>
                      </Box>

                      <Divider sx={{ my: 0.25 }} />

                      <Box display="flex" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap">
                        {canManageRoles ? (
                          <FormControl size="small" sx={{ minWidth: 125 }}>
                            <Select
                              value={m.role}
                              onChange={(e) => handleRoleChange(m.userId, e.target.value as GroupMemberRole)}
                              disabled={roleUpdatingUserId === m.userId}
                              sx={{ height: 32, fontSize: '0.78rem', fontWeight: 600 }}
                            >
                              <MenuItem value="ADMIN">ADMIN</MenuItem>
                              <MenuItem value="MODERATOR">MODERATOR</MenuItem>
                              <MenuItem value="MEMBER">MEMBER</MenuItem>
                            </Select>
                          </FormControl>
                        ) : (
                          <Chip
                            label={m.role}
                            size="small"
                            color={m.role === 'ADMIN' ? 'primary' : m.role === 'MODERATOR' ? 'secondary' : 'default'}
                            sx={{ height: 26, fontSize: '0.72rem', fontWeight: 600 }}
                          />
                        )}

                        {canRemove && (
                          <Button
                            size="small"
                            color="error"
                            variant="outlined"
                            startIcon={<DeleteIcon sx={{ fontSize: '15px !important' }} />}
                            onClick={() => {
                              setMemberToRemove({ userId: m.userId, fullName: m.user.fullName });
                              setOpenRemoveMemberDialog(true);
                            }}
                            disabled={removingMember}
                            sx={{ textTransform: 'none', height: 30, fontSize: '0.75rem', px: 1.25 }}
                          >
                            Remove
                          </Button>
                        )}
                      </Box>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </Box>
      )}

      {/* Tab 2: Live Group Chat */}
      {activeTab === 2 && (
        <GroupChatTab
          group={group}
          onJoinGroup={handleJoinGroup}
          actionLoading={actionLoading}
        />
      )}

      {/* Leave Group Confirmation Dialog */}
      <Dialog open={openLeaveDialog} onClose={() => !actionLoading && setOpenLeaveDialog(false)}>
        <DialogTitle fontWeight="bold">Leave Group?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to leave <strong>{group.name}</strong>? You can rejoin anytime if the group is public.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpenLeaveDialog(false)} disabled={actionLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleLeaveGroup}
            color="error"
            variant="contained"
            disabled={actionLoading}
            sx={{ textTransform: 'none' }}
          >
            {actionLoading ? <CircularProgress size={18} color="inherit" /> : 'Leave Group'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Group Settings Dialog */}
      <Dialog
        open={openEditDialog}
        onClose={() => !editSaving && setOpenEditDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle fontWeight="bold">Edit Group Settings</DialogTitle>
        <DialogContent dividers>
          {editError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {editError}
            </Alert>
          )}
          <Box component="form" display="flex" flexDirection="column" gap={2.5} pt={1}>
            <TextField
              label="Group Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              fullWidth
              required
              helperText="Between 3 and 100 characters"
              disabled={editSaving}
            />
            <TextField
              label="Description"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              fullWidth
              multiline
              rows={3}
              helperText={`${editDescription.length}/1000 characters`}
              disabled={editSaving}
            />
            <FormControl>
              <FormLabel sx={{ fontWeight: 'bold', mb: 0.5, fontSize: '0.9rem' }}>Privacy</FormLabel>
              <RadioGroup
                row
                value={editPrivacy}
                onChange={(e) => setEditPrivacy(e.target.value as GroupPrivacy)}
              >
                <FormControlLabel
                  value={GroupPrivacy.PUBLIC}
                  control={<Radio />}
                  label="Public (Anyone can view & join)"
                  disabled={editSaving}
                />
                <FormControlLabel
                  value={GroupPrivacy.PRIVATE}
                  control={<Radio />}
                  label="Private (Members only)"
                  disabled={editSaving}
                />
              </RadioGroup>
            </FormControl>

            <Box>
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                Cover Image
              </Typography>
              {editCoverPreview && (
                <Box
                  component="img"
                  src={editCoverPreview}
                  alt="Cover Preview"
                  sx={{
                    width: '100%',
                    height: 140,
                    objectFit: 'cover',
                    borderRadius: 2,
                    mb: 1.5,
                    border: '1px solid rgba(0,0,0,0.1)',
                  }}
                />
              )}
              <Button
                variant="outlined"
                component="label"
                startIcon={<PhotoCameraIcon />}
                disabled={editSaving}
                sx={{ textTransform: 'none' }}
              >
                {editCoverFile ? 'Change Selected Image' : 'Upload Cover Image'}
                <input
                  type="file"
                  hidden
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleCoverFileChange}
                />
              </Button>
              {editCoverFile && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  Selected: {editCoverFile.name} ({(editCoverFile.size / 1024).toFixed(0)} KB)
                </Typography>
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpenEditDialog(false)} disabled={editSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveGroupSettings}
            disabled={editSaving}
            sx={{ textTransform: 'none', px: 3, fontWeight: 'bold' }}
          >
            {editSaving ? <CircularProgress size={20} color="inherit" /> : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Remove Member Confirmation Dialog */}
      <Dialog
        open={openRemoveMemberDialog}
        onClose={() => !removingMember && setOpenRemoveMemberDialog(false)}
      >
        <DialogTitle fontWeight="bold">Remove Member?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to remove <strong>{memberToRemove?.fullName}</strong> from <strong>{group.name}</strong>?
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpenRemoveMemberDialog(false)} disabled={removingMember}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmRemove}
            color="error"
            variant="contained"
            disabled={removingMember}
            sx={{ textTransform: 'none' }}
          >
            {removingMember ? <CircularProgress size={18} color="inherit" /> : 'Remove Member'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Notification */}
      <Snackbar
        open={Boolean(successMessage)}
        autoHideDuration={4000}
        onClose={() => setSuccessMessage(null)}
        message={successMessage}
      />
    </Container>
  );
};

export default GroupDetailPage;

