import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  InputAdornment,
  IconButton,
  InputLabel,
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
  PersonAdd as PersonAddIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import {
  GroupDetails,
  GroupPrivacy,
  GroupMemberRole,
  PostItem,
  GroupMemberItem,
} from '@apnasamaj/shared-types';
import {
  fetchGroupBySlug,
  fetchGroupPosts,
  joinGroupApi,
  leaveGroupApi,
  updateGroupApi,
  uploadGroupCoverApi,
  updateMemberRoleApi,
  removeMemberApi,
  deleteGroupApi,
  addGroupMemberApi,
  fetchGroupMembers,
} from '../services/groups.service';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '@apnasamaj/i18n';
import { CreatePostComposer } from '../components/CreatePostComposer';
import { PostCard } from '../components/PostCard';
import { GroupChatTab } from '../components/chat/GroupChatTab';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GroupDetailPage: React.FC = () => {
  const { t, i18n } = useTranslation(['groups', 'common']);
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  // Group Details State
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [loadingGroup, setLoadingGroup] = useState<boolean>(true);
  const [groupError, setGroupError] = useState<string | null>(null);

  // Tabs state (0: Discussions, 1: Members, 2: Chat)
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

  // Authenticated user & administrative permissions
  const { user } = useAuth();
  const isGroupAdmin = group?.myRole === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isGroupMod = group?.myRole === 'MODERATOR';
  const canManageGroup =
    isGroupAdmin || (group?.createdById && user?.id === group.createdById) || user?.role === 'SUPER_ADMIN';

  // Edit Group State
  const [openEditDialog, setOpenEditDialog] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editPrivacy, setEditPrivacy] = useState<GroupPrivacy>(GroupPrivacy.PUBLIC);
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
  const [editCoverPreview, setEditCoverPreview] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Group State
  const [openDeleteDialog, setOpenDeleteDialog] = useState<boolean>(false);
  const [deletingGroup, setDeletingGroup] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Direct Add Member State
  const [openAddMemberDialog, setOpenAddMemberDialog] = useState<boolean>(false);
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [addingMember, setAddingMember] = useState<boolean>(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);

  // Member Management State (Role Change & Removal)
  const [roleUpdatingUserId, setRoleUpdatingUserId] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<{ userId: string; fullName: string } | null>(null);
  const [openRemoveMemberDialog, setOpenRemoveMemberDialog] = useState<boolean>(false);
  const [removingMember, setRemovingMember] = useState<boolean>(false);

  // Dedicated Paginated Member Roster State (Tab 1)
  const [rosterMembers, setRosterMembers] = useState<GroupMemberItem[]>([]);
  const [rosterLoading, setRosterLoading] = useState<boolean>(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [rosterPage, setRosterPage] = useState<number>(1);
  const [rosterTotalPages, setRosterTotalPages] = useState<number>(1);
  const [rosterTotalMembers, setRosterTotalMembers] = useState<number>(0);
  const [rosterSearch, setRosterSearch] = useState<string>('');
  const [debouncedRosterSearch, setDebouncedRosterSearch] = useState<string>('');
  const [rosterRoleFilter, setRosterRoleFilter] = useState<'' | 'ADMIN' | 'MODERATOR' | 'MEMBER'>('');

  // Stale request protection refs
  const rosterRequestIdRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  // Feedback State
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 400ms Debounce on Roster Search Input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (rosterSearch !== debouncedRosterSearch) {
        setDebouncedRosterSearch(rosterSearch);
        setRosterPage(1); // Reset to page 1 on filter change
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [rosterSearch, debouncedRosterSearch]);

  const loadGroupDetails = useCallback(async () => {
    if (!slug) return;
    setLoadingGroup(true);
    setGroupError(null);
    try {
      const data = await fetchGroupBySlug(slug);
      setGroup(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('loadGroupError');
      setGroupError(msg);
    } finally {
      setLoadingGroup(false);
    }
  }, [slug, t]);

  const loadGroupDiscussions = useCallback(async () => {
    if (!slug) return;
    setLoadingPosts(true);
    setPostsError(null);
    try {
      const data = await fetchGroupPosts(slug, postsPage);
      setPosts(data.posts);
      setTotalPostsPages(data.pagination.totalPages);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('loadDiscussionsError');
      setPostsError(msg);
    } finally {
      setLoadingPosts(false);
    }
  }, [slug, postsPage, t]);

  // Load Paginated Member Roster with Stale Protection
  const loadMemberRoster = useCallback(async () => {
    if (!group) return;
    // Private groups hide roster from unauthorized non-members
    if (group.privacy === GroupPrivacy.PRIVATE && !group.isMember && user?.role !== 'SUPER_ADMIN') {
      return;
    }

    const currentReqId = ++rosterRequestIdRef.current;
    setRosterLoading(true);
    setRosterError(null);

    try {
      const data = await fetchGroupMembers(group.id, {
        page: rosterPage,
        limit: 12,
        search: debouncedRosterSearch.trim() || undefined,
        role: rosterRoleFilter || undefined,
      });

      if (currentReqId !== rosterRequestIdRef.current || !isMountedRef.current) {
        return;
      }

      setRosterMembers(data.members);
      setRosterTotalPages(data.pagination.totalPages);
      setRosterTotalMembers(data.pagination.totalMembers);
    } catch (err: unknown) {
      if (currentReqId !== rosterRequestIdRef.current || !isMountedRef.current) {
        return;
      }
      const msg = err instanceof Error ? err.message : t('loadRosterError');
      setRosterError(msg);
    } finally {
      if (currentReqId === rosterRequestIdRef.current && isMountedRef.current) {
        setRosterLoading(false);
      }
    }
  }, [group, rosterPage, debouncedRosterSearch, rosterRoleFilter, user, t]);

  useEffect(() => {
    loadGroupDetails();
  }, [loadGroupDetails]);

  useEffect(() => {
    if (group && (group.privacy === GroupPrivacy.PUBLIC || group.isMember)) {
      loadGroupDiscussions();
    }
  }, [group, loadGroupDiscussions]);

  useEffect(() => {
    if (activeTab === 1 && group) {
      loadMemberRoster();
    }
  }, [activeTab, group, loadMemberRoster]);

  const handleJoinGroup = async () => {
    if (!group) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await joinGroupApi(group.id);
      setSuccessMessage(t('joinedSuccess'));
      await loadGroupDetails();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('joinError');
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
      setSuccessMessage(t('leftSuccess'));
      await loadGroupDetails();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('leaveError');
      setActionError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  // Group Deletion Handler
  const handleDeleteGroup = async () => {
    if (!group) return;
    setDeletingGroup(true);
    setDeleteError(null);
    try {
      await deleteGroupApi(group.id);
      setOpenDeleteDialog(false);
      navigate('/groups', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('deleteError');
      setDeleteError(msg);
    } finally {
      setDeletingGroup(false);
    }
  };

  // Direct Member Onboarding Handler
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!group) return;

    const trimmedId = targetUserId.trim();
    if (!trimmedId) {
      setAddMemberError(t('userIdRequired'));
      return;
    }

    if (!UUID_REGEX.test(trimmedId)) {
      setAddMemberError(t('invalidUuidFormat'));
      return;
    }

    setAddingMember(true);
    setAddMemberError(null);
    try {
      await addGroupMemberApi(group.id, trimmedId);
      setOpenAddMemberDialog(false);
      setTargetUserId('');
      setSuccessMessage(t('memberAddedSuccess'));
      // Refresh member roster and group details
      await Promise.all([loadMemberRoster(), loadGroupDetails()]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('addMemberError');
      setAddMemberError(msg);
    } finally {
      setAddingMember(false);
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
      setEditError(t('editNameBounds'));
      return;
    }
    if (editDescription.length > 1000) {
      setEditError(t('editDescMax'));
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
      setSuccessMessage(t('settingsUpdatedSuccess'));
      await loadGroupDetails();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('updateSettingsError');
      setEditError(msg);
    } finally {
      setEditSaving(false);
    }
  };

  const handleRoleChange = async (targetUserIdToUpdate: string, newRole: GroupMemberRole) => {
    if (!group) return;
    setRoleUpdatingUserId(targetUserIdToUpdate);
    setActionError(null);
    try {
      await updateMemberRoleApi(group.id, targetUserIdToUpdate, newRole);
      setSuccessMessage(t('roleUpdatedSuccess'));
      await Promise.all([loadMemberRoster(), loadGroupDetails()]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('roleUpdateError');
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
      setSuccessMessage(t('memberRemovedSuccess', { name: memberToRemove.fullName }));
      setMemberToRemove(null);
      await Promise.all([loadMemberRoster(), loadGroupDetails()]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('removeMemberError');
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
    setPosts((prev) => {
      const updatedList = prev.map((p) => (p.id === updated.id ? updated : p));
      return [...updatedList].sort((a, b) => {
        if (Boolean(a.isPinned) === Boolean(b.isPinned)) return 0;
        return a.isPinned ? -1 : 1;
      });
    });
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
            <Button color="inherit" size="small" onClick={() => navigate('/groups')} aria-label={t('backToGroupsAria')}>
              {t('backToGroups')}
            </Button>
          }
          sx={{ borderRadius: 2 }}
        >
          {groupError || t('groupNotFound')}
        </Alert>
      </Container>
    );
  }

  const isPrivateAndNonMember =
    group.privacy === GroupPrivacy.PRIVATE && !group.isMember && user?.role !== 'SUPER_ADMIN';

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Navigation Breadcrumb */}
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/groups')}
        sx={{ mb: 2, textTransform: 'none' }}
        color="inherit"
        aria-label={t('backToGroupsAria')}
      >
        {t('backToGroups')}
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
        {/* Banner Cover Image */}
        {group.coverUrl ? (
          <CardMedia
            component="img"
            height="220"
            image={group.coverUrl}
            alt={group.name}
            sx={{ bgcolor: 'grey.300', objectFit: 'cover' }}
          />
        ) : (
          <Box
            sx={{
              height: 160,
              background:
                group.privacy === GroupPrivacy.PUBLIC
                  ? 'linear-gradient(135deg, #1b5e20 0%, #388e3c 100%)'
                  : 'linear-gradient(135deg, #263238 0%, #455a64 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}
          >
            <GroupsIcon sx={{ fontSize: 64, opacity: 0.8 }} />
          </Box>
        )}

        <Box p={{ xs: 2.5, sm: 3.5 }}>
          {/* Header Row: Name, Chips, & Action Buttons */}
          <Box
            display="flex"
            flexDirection={{ xs: 'column', sm: 'row' }}
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            justifyContent="space-between"
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
                  label={group.privacy === GroupPrivacy.PUBLIC ? t('privacyPublic') : t('privacyPrivate')}
                  size="small"
                  color={group.privacy === GroupPrivacy.PUBLIC ? 'success' : 'default'}
                  variant="outlined"
                  sx={{ fontWeight: 'bold' }}
                />
                {group.isMember && (
                  <Chip
                    label={
                      group.myRole
                        ? t('yourRole', {
                            role:
                              group.myRole === 'ADMIN'
                                ? t('roleAdmin')
                                : group.myRole === 'MODERATOR'
                                ? t('roleModerator')
                                : t('roleMember'),
                          })
                        : t('member')
                    }
                    size="small"
                    color="primary"
                    sx={{ fontWeight: 'bold' }}
                  />
                )}
              </Box>

              <Typography variant="caption" color="text.secondary" display="flex" alignItems="center" gap={0.5}>
                <CalendarIcon sx={{ fontSize: 14 }} />
                {t('createdOn', {
                  date: new Date(group.createdAt).toLocaleDateString(i18n.language === 'hi' ? 'hi-IN' : 'en-IN'),
                })}
              </Typography>
            </Box>

            {/* Action Buttons */}
            <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
              {canManageGroup && (
                <>
                  <Button
                    variant="outlined"
                    startIcon={<SettingsIcon />}
                    onClick={handleOpenEditDialog}
                    sx={{ textTransform: 'none', borderRadius: 2 }}
                  >
                    {t('editGroup')}
                  </Button>

                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => {
                      setDeleteError(null);
                      setOpenDeleteDialog(true);
                    }}
                    sx={{ textTransform: 'none', borderRadius: 2 }}
                  >
                    {t('deleteGroup')}
                  </Button>
                </>
              )}

              {group.isMember ? (
                <Button
                  variant="outlined"
                  color="warning"
                  disabled={actionLoading}
                  onClick={() => setOpenLeaveDialog(true)}
                  sx={{ textTransform: 'none', borderRadius: 2 }}
                >
                  {t('leaveGroup')}
                </Button>
              ) : group.privacy === GroupPrivacy.PUBLIC ? (
                <Button
                  variant="contained"
                  color="primary"
                  disabled={actionLoading}
                  onClick={handleJoinGroup}
                  sx={{ textTransform: 'none', borderRadius: 2, px: 3, fontWeight: 'bold' }}
                >
                  {actionLoading ? <CircularProgress size={20} color="inherit" /> : t('joinGroup')}
                </Button>
              ) : (
                <Chip
                  icon={<LockIcon />}
                  label={t('privateMembershipRequired')}
                  color="warning"
                  variant="outlined"
                />
              )}
            </Box>
          </Box>

          {/* Description */}
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            {group.description || t('defaultDescription')}
          </Typography>

          {/* Stats Bar */}
          <Divider sx={{ my: 2 }} />
          <Box display="flex" alignItems="center" gap={3} flexWrap="wrap">
            <Box display="flex" alignItems="center" gap={0.75}>
              <PeopleIcon color="action" fontSize="small" />
              <Typography variant="body2" fontWeight="bold">
                {t('membersCount', { count: group.membersCount })}
              </Typography>
            </Box>

            <Box display="flex" alignItems="center" gap={0.75}>
              <DynamicFeedIcon color="action" fontSize="small" />
              <Typography variant="body2" fontWeight="bold">
                {t('discussionsCount', { count: group.postsCount })}
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
            label={t('tabDiscussionsWithCount', { count: group.postsCount })}
            sx={{ textTransform: 'none', fontWeight: 'bold' }}
          />
          <Tab
            label={t('tabMembersWithCount', { count: group.membersCount })}
            sx={{ textTransform: 'none', fontWeight: 'bold' }}
          />
          <Tab
            icon={<ChatIcon sx={{ fontSize: '18px !important' }} />}
            iconPosition="start"
            label={t('tabChat')}
            sx={{ textTransform: 'none', fontWeight: 'bold' }}
          />
        </Tabs>
      </Box>

      {/* Action Error Alert */}
      {actionError && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

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
                {t('privateContentTitle')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 450, mx: 'auto' }}>
                {t('privateContentDesc')}
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
                    {t('joinPromptToPost')}
                  </Typography>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={handleJoinGroup}
                    disabled={actionLoading}
                    sx={{ textTransform: 'none' }}
                  >
                    {t('joinToPost')}
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
                    {t('noDiscussionsTitle')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('noDiscussionsDesc')}
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
                        aria-label={t('paginationAria')}
                      />
                    </Box>
                  )}
                </Box>
              )}
            </>
          )}
        </Box>
      )}

      {/* Tab 1: Members (Dedicated Paginated Roster with Filtering & Direct Onboarding) */}
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
                {t('privateRosterTitle')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 450, mx: 'auto' }}>
                {t('privateRosterDesc')}
              </Typography>
            </Paper>
          ) : (
            <>
              {/* Member Filtering & Add Member Action Bar */}
              <Paper elevation={1} sx={{ p: 2, mb: 3, borderRadius: 2.5 }}>
                <Grid container spacing={2} alignItems="center" justifyContent="space-between">
                  <Grid item xs={12} sm={6} md={5}>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder={t('searchMembersPlaceholder')}
                      value={rosterSearch}
                      onChange={(e) => setRosterSearch(e.target.value.slice(0, 100))}
                      inputProps={{ maxLength: 100, 'aria-label': t('searchMembersAria') }}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon fontSize="small" color="action" />
                          </InputAdornment>
                        ),
                        endAdornment: rosterSearch ? (
                          <InputAdornment position="end">
                            <IconButton size="small" onClick={() => setRosterSearch('')} aria-label={t('clearRosterSearchAria')}>
                              <ClearIcon fontSize="small" />
                            </IconButton>
                          </InputAdornment>
                        ) : null,
                      }}
                    />
                  </Grid>

                  <Grid item xs={6} sm={3} md={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="roster-role-filter-label">{t('roleFilterLabel')}</InputLabel>
                      <Select
                        labelId="roster-role-filter-label"
                        value={rosterRoleFilter}
                        label={t('roleFilterLabel')}
                        onChange={(e) => {
                          setRosterRoleFilter(e.target.value as any);
                          setRosterPage(1);
                        }}
                      >
                        <MenuItem value="">{t('allRoles')}</MenuItem>
                        <MenuItem value="ADMIN">{t('admins')}</MenuItem>
                        <MenuItem value="MODERATOR">{t('moderators')}</MenuItem>
                        <MenuItem value="MEMBER">{t('members')}</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={6} sm={3} md={4} textAlign={{ xs: 'left', sm: 'right' }}>
                    {canManageGroup && (
                      <Button
                        variant="contained"
                        startIcon={<PersonAddIcon />}
                        onClick={() => {
                          setTargetUserId('');
                          setAddMemberError(null);
                          setOpenAddMemberDialog(true);
                        }}
                        sx={{
                          textTransform: 'none',
                          borderRadius: 2,
                          fontWeight: 'bold',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t('addMember')}
                      </Button>
                    )}
                  </Grid>
                </Grid>
              </Paper>

              {/* Roster Error Alert */}
              {rosterError && (
                <Alert
                  severity="error"
                  action={
                    <Button color="inherit" size="small" onClick={loadMemberRoster} startIcon={<RefreshIcon />} aria-label={t('retryRosterAria')}>
                      {t('common:retry')}
                    </Button>
                  }
                  sx={{ mb: 3, borderRadius: 2 }}
                >
                  {rosterError}
                </Alert>
              )}

              {/* Roster Loading Spinner */}
              {rosterLoading && (
                <Box display="flex" justifyContent="center" py={5}>
                  <CircularProgress size={36} />
                </Box>
              )}

              {/* Empty State */}
              {!rosterLoading && !rosterError && rosterMembers.length === 0 && (
                <Paper
                  sx={{
                    py: 6,
                    px: 3,
                    textAlign: 'center',
                    borderRadius: 3,
                    border: '1px dashed rgba(0,0,0,0.15)',
                  }}
                >
                  <PeopleIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1, opacity: 0.5 }} />
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    {t('noMembersTitle')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {rosterSearch || rosterRoleFilter
                      ? t('noMembersFiltered')
                      : t('noMembersGeneric')}
                  </Typography>
                  {(rosterSearch || rosterRoleFilter) && (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        setRosterSearch('');
                        setRosterRoleFilter('');
                        setRosterPage(1);
                      }}
                      sx={{ textTransform: 'none' }}
                    >
                      {t('resetFilters')}
                    </Button>
                  )}
                </Paper>
              )}

              {/* Members Grid */}
              {!rosterLoading && !rosterError && rosterMembers.length > 0 && (
                <>
                  <Grid container spacing={2}>
                    {rosterMembers.map((m) => {
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
                                      label={t('you')}
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
                                    <MenuItem value="ADMIN">{t('roleAdmin')}</MenuItem>
                                    <MenuItem value="MODERATOR">{t('roleModerator')}</MenuItem>
                                    <MenuItem value="MEMBER">{t('roleMember')}</MenuItem>
                                  </Select>
                                </FormControl>
                              ) : (
                                <Chip
                                  label={m.role === 'ADMIN' ? t('roleAdmin') : m.role === 'MODERATOR' ? t('roleModerator') : t('roleMember')}
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
                                  aria-label={t('removeMemberAria', { name: m.user.fullName })}
                                  sx={{ textTransform: 'none', height: 30, fontSize: '0.75rem', px: 1.25 }}
                                >
                                  {t('removeMember')}
                                </Button>
                              )}
                            </Box>
                          </Card>
                        </Grid>
                      );
                    })}
                  </Grid>

                  {/* Roster Pagination */}
                  {rosterTotalPages > 1 && (
                    <Box display="flex" justifyContent="center" mt={4} mb={2}>
                      <Pagination
                        count={rosterTotalPages}
                        page={rosterPage}
                        onChange={(_, val) => setRosterPage(val)}
                        color="primary"
                        shape="rounded"
                        aria-label={t('paginationAria')}
                      />
                    </Box>
                  )}
                </>
              )}
            </>
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
        <DialogTitle fontWeight="bold">{t('leaveDialogTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('leaveDialogDesc', { name: group.name })}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpenLeaveDialog(false)} disabled={actionLoading}>
            {t('cancel')}
          </Button>
          <Button
            onClick={handleLeaveGroup}
            color="warning"
            variant="contained"
            disabled={actionLoading}
            sx={{ textTransform: 'none' }}
          >
            {actionLoading ? <CircularProgress size={18} color="inherit" /> : t('leaveConfirm')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Group Confirmation Dialog */}
      <Dialog
        open={openDeleteDialog}
        onClose={() => !deletingGroup && setOpenDeleteDialog(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle fontWeight="bold" color="error.main">
          {t('deleteDialogTitle')}
        </DialogTitle>
        <DialogContent>
          {deleteError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deleteError}
            </Alert>
          )}
          <DialogContentText>
            {t('deleteDialogDesc', { name: group.name })}
          </DialogContentText>
          <Typography variant="body2" color="error.main" sx={{ mt: 1.5, fontWeight: 500 }}>
            {t('deleteDialogWarning')}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setOpenDeleteDialog(false)} disabled={deletingGroup}>
            {t('cancel')}
          </Button>
          <Button
            onClick={handleDeleteGroup}
            color="error"
            variant="contained"
            disabled={deletingGroup}
            sx={{ textTransform: 'none', fontWeight: 'bold' }}
          >
            {deletingGroup ? <CircularProgress size={18} color="inherit" /> : t('deleteConfirm')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Direct Add Member Dialog */}
      <Dialog
        open={openAddMemberDialog}
        onClose={() => !addingMember && setOpenAddMemberDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle fontWeight="bold">{t('addMemberDialogTitle')}</DialogTitle>
        <DialogContent dividers>
          {addMemberError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {addMemberError}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('addMemberDialogDesc', { name: group.name })}
          </Typography>
          <Box component="form" onSubmit={handleAddMember} display="flex" flexDirection="column" gap={2} pt={1}>
            <TextField
              label={t('memberUserIdLabel')}
              placeholder={t('memberUserIdPlaceholder')}
              value={targetUserId}
              onChange={(e) => {
                setTargetUserId(e.target.value.trim());
                if (addMemberError) setAddMemberError(null);
              }}
              fullWidth
              required
              helperText={t('memberUserIdHelper')}
              disabled={addingMember}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpenAddMemberDialog(false)} disabled={addingMember}>
            {t('cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={handleAddMember}
            disabled={addingMember || !targetUserId.trim()}
            sx={{ textTransform: 'none', px: 3, fontWeight: 'bold' }}
          >
            {addingMember ? <CircularProgress size={20} color="inherit" /> : t('addMember')}
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
        <DialogTitle fontWeight="bold">{t('editDialogTitle')}</DialogTitle>
        <DialogContent dividers>
          {editError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {editError}
            </Alert>
          )}
          <Box component="form" display="flex" flexDirection="column" gap={2.5} pt={1}>
            <TextField
              label={t('groupName')}
              value={editName}
              onChange={(e) => setEditName(e.target.value.slice(0, 100))}
              fullWidth
              required
              helperText={t('editNameHelper')}
              disabled={editSaving}
              inputProps={{ maxLength: 100 }}
            />
            <TextField
              label={t('description')}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value.slice(0, 1000))}
              fullWidth
              multiline
              rows={3}
              helperText={t('editDescHelper', { current: editDescription.length })}
              disabled={editSaving}
              inputProps={{ maxLength: 1000 }}
            />
            <FormControl>
              <FormLabel sx={{ fontWeight: 'bold', mb: 0.5, fontSize: '0.9rem' }}>{t('privacy')}</FormLabel>
              <RadioGroup
                row
                value={editPrivacy}
                onChange={(e) => setEditPrivacy(e.target.value as GroupPrivacy)}
              >
                <FormControlLabel
                  value={GroupPrivacy.PUBLIC}
                  control={<Radio />}
                  label={t('editPrivacyPublicLabel')}
                  disabled={editSaving}
                />
                <FormControlLabel
                  value={GroupPrivacy.PRIVATE}
                  control={<Radio />}
                  label={t('editPrivacyPrivateLabel')}
                  disabled={editSaving}
                />
              </RadioGroup>
            </FormControl>

            <Box>
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                {t('coverImageSection')}
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
                {editCoverFile ? t('changeSelectedImage') : t('uploadCoverImage')}
                <input
                  type="file"
                  hidden
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleCoverFileChange}
                />
              </Button>
              {editCoverFile && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {t('selectedImageInfo', { name: editCoverFile.name, size: (editCoverFile.size / 1024).toFixed(0) })}
                </Typography>
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpenEditDialog(false)} disabled={editSaving}>
            {t('cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveGroupSettings}
            disabled={editSaving}
            sx={{ textTransform: 'none', px: 3, fontWeight: 'bold' }}
          >
            {editSaving ? <CircularProgress size={20} color="inherit" /> : t('saveChanges')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Remove Member Confirmation Dialog */}
      <Dialog
        open={openRemoveMemberDialog}
        onClose={() => !removingMember && setOpenRemoveMemberDialog(false)}
      >
        <DialogTitle fontWeight="bold">{t('removeDialogTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('removeDialogDesc', { name: memberToRemove?.fullName, groupName: group.name })}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpenRemoveMemberDialog(false)} disabled={removingMember}>
            {t('cancel')}
          </Button>
          <Button
            onClick={handleConfirmRemove}
            color="error"
            variant="contained"
            disabled={removingMember}
            sx={{ textTransform: 'none' }}
          >
            {removingMember ? <CircularProgress size={18} color="inherit" /> : t('removeConfirm')}
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
