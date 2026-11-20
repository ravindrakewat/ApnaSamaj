import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ApnaSamajLogo } from '../components/ApnaSamajLogo';
import {
  Box,
  Paper,
  Typography,
  TextField,
  IconButton,
  Button,
  CircularProgress,
  Alert,
  Avatar,
  Badge,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Divider,
  Tooltip,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  LinearProgress,
  Chip,
  Card,
  CardMedia,
  CardContent,
  Drawer,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Send as SendIcon,
  AttachFile as AttachFileIcon,
  Mic as MicIcon,
  Stop as StopIcon,
  Close as CloseIcon,
  Search as SearchIcon,
  PhotoLibrary as GalleryIcon,
  ArrowBack as ArrowBackIcon,
  Reply as ReplyIcon,
  DeleteOutline as DeleteIcon,
  ContentCopy as CopyIcon,
  AddReactionOutlined as AddReactionIcon,
  Check as CheckIcon,
  DoneAll as DoneAllIcon,
  AccessTime as AccessTimeIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  InsertDriveFile as DocIcon,
  OpenInNew as OpenInNewIcon,
  Refresh as RefreshIcon,
  Groups as GroupsIcon,
  ChatBubbleOutline as ChatIcon,
} from '@mui/icons-material';
import {
  DirectConversationItem,
  DirectMessageItem,
  ChatAttachmentItem,
  ChatAttachmentInput,
  ChatAttachmentType,
  ChatMessageReplyPreview,
  ChatReactionSummary,
  ALLOWED_CHAT_REACTIONS,
  AllowedChatReaction,
  DirectNewMessageEvent,
  DirectUserTypingEvent,
  ChatSearchResultItem,
  ChatMediaGalleryItem,
  ChatReactionEventPayload,
  ChatMessageDeletedEvent,
  GroupListItem,
  GroupDetails,
  GroupPrivacy,
} from '@apnasamaj/shared-types';
import { parseYouTubeUrl } from '@apnasamaj/validation';
import { useAuth } from '../context/AuthContext';
import {
  fetchDirectInbox,
  fetchDirectMessages,
  sendDirectMessageApi,
  uploadDirectAttachmentApi,
  toggleDirectReactionApi,
  removeDirectReactionApi,
  deleteDirectMessageApi,
  markDirectConversationReadApi,
  searchDirectMessagesApi,
  getDirectMediaGalleryApi,
  createOrGetDirectConversation,
} from '../services/chat.service';
import { fetchGroups, fetchGroupBySlug, joinGroupApi } from '../services/groups.service';
import { GroupChatTab } from '../components/chat/GroupChatTab';
import { connectChatSocket, getChatSocket } from '../services/chat.socket';
import { resolveAttachmentDisplayUrl, extractYouTubeVideoDetails } from '../utils/attachment';

// ---------------------------------------------------------------------------
// Helpers & Subcomponents
// ---------------------------------------------------------------------------

function formatChatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatDateSeparator(isoString: string): string {
  try {
    const date = new Date(isoString);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString([], {
      day: 'numeric',
      month: 'short',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    });
  } catch {
    return '';
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Main ChatPage Component
// ---------------------------------------------------------------------------

export const ChatPage: React.FC = () => {
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const groupSlugFromUrl = searchParams.get('group');

  // State: Unified Inbox (Direct + Community Groups)
  type InboxFilter = 'ALL' | 'DIRECT' | 'GROUPS';
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('ALL');
  const [conversations, setConversations] = useState<DirectConversationItem[]>([]);
  const [groups, setGroups] = useState<GroupListItem[]>([]);
  const [inboxLoading, setInboxLoading] = useState<boolean>(true);
  const [inboxSearch, setInboxSearch] = useState<string>('');

  // State: Active Group Chat
  const [selectedGroup, setSelectedGroup] = useState<GroupDetails | null>(null);
  const [loadingGroup, setLoadingGroup] = useState<boolean>(false);
  const [groupActionLoading, setGroupActionLoading] = useState<boolean>(false);

  // State: Active Conversation Messages
  const [messages, setMessages] = useState<DirectMessageItem[]>([]);
  const [messagesLoading, setMessagesLoading] = useState<boolean>(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // State: Active Partner
  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.id === conversationId);
  }, [conversations, conversationId]);

  // State: Composer
  const [inputText, setInputText] = useState<string>('');
  const [replyTarget, setReplyTarget] = useState<DirectMessageItem | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [partnerIsTyping, setPartnerIsTyping] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State: Voice Recorder
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // State: Media Gallery & Search Drawers
  const [searchDrawerOpen, setSearchDrawerOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<ChatSearchResultItem[]>([]);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);

  const [galleryDrawerOpen, setGalleryDrawerOpen] = useState<boolean>(false);
  const [galleryMedia, setGalleryMedia] = useState<ChatMediaGalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState<boolean>(false);

  // State: Lightbox Image
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // State: Message Context Menu & Deletion Dialog
  const [menuAnchor, setMenuAnchor] = useState<{ el: HTMLElement; message: DirectMessageItem } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const [messageToDelete, setMessageToDelete] = useState<DirectMessageItem | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ---------------------------------------------------------------------------
  // 1. Load Unified Inbox (Direct + Community Groups)
  // ---------------------------------------------------------------------------
  const loadInbox = useCallback(async () => {
    setInboxLoading(true);
    try {
      const [directRes, groupsRes] = await Promise.allSettled([
        fetchDirectInbox({ limit: 50 }),
        fetchGroups({ limit: 50 }),
      ]);
      if (directRes.status === 'fulfilled') {
        setConversations(directRes.value.conversations || []);
      }
      if (groupsRes.status === 'fulfilled') {
        setGroups(groupsRes.value.groups || []);
      }
    } catch (err: unknown) {
      console.error('[ChatPage] Failed to fetch unified inbox:', err);
    } finally {
      setInboxLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (groupSlugFromUrl) {
      setLoadingGroup(true);
      fetchGroupBySlug(groupSlugFromUrl)
        .then((g) => setSelectedGroup(g))
        .catch((err) => console.error('[ChatPage] Failed to load group details:', err))
        .finally(() => setLoadingGroup(false));
    } else {
      setSelectedGroup(null);
    }
  }, [groupSlugFromUrl]);

  const handleJoinActiveGroup = async () => {
    if (!selectedGroup) return;
    setGroupActionLoading(true);
    try {
      await joinGroupApi(selectedGroup.id);
      const updated = await fetchGroupBySlug(selectedGroup.slug);
      setSelectedGroup(updated);
      loadInbox();
    } catch (err) {
      console.error('[ChatPage] Failed to join group:', err);
    } finally {
      setGroupActionLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 2. Load Messages for Active Conversation
  // ---------------------------------------------------------------------------
  const loadMessages = useCallback(async (convId: string) => {
    setMessagesLoading(true);
    setMessagesError(null);
    try {
      const data = await fetchDirectMessages(convId, { limit: 50 });
      setMessages(data.messages || []);
      setHasMoreMessages(data.hasMore);
      setNextCursor(data.nextCursor || null);
      // Mark as read in background
      markDirectConversationReadApi(convId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load conversation history.';
      setMessagesError(msg);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (conversationId) {
      loadMessages(conversationId);
    } else {
      setMessages([]);
    }
  }, [conversationId, loadMessages]);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (messagesEndRef.current && !messagesLoading) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, messagesLoading]);

  // ---------------------------------------------------------------------------
  // 3. Socket.IO Real-Time Synchronization
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const socket = connectChatSocket();

    if (conversationId) {
      socket.emit('direct:join', { conversationId });
    }

    const handleNewMessage = (event: DirectNewMessageEvent) => {
      if (event?.message && event.message.conversationId === conversationId) {
        setMessages((prev) => {
          // If message with tempId already exists optimistically, replace it
          if (event.tempId && prev.some((m) => m.tempId === event.tempId)) {
            return prev.map((m) => (m.tempId === event.tempId ? event.message : m));
          }
          if (prev.some((m) => m.id === event.message.id)) return prev;
          return [...prev, event.message];
        });
        // Mark as read immediately
        markDirectConversationReadApi(conversationId);
      }

      // Also refresh inbox list order and preview
      loadInbox();
    };

    const handleReactionUpdate = (event: ChatReactionEventPayload) => {
      if (event?.conversationId === conversationId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === event.messageId
              ? { ...msg, reactions: event.reactions as any }
              : msg
          )
        );
      }
    };

    const handleMessageDeleted = (event: ChatMessageDeletedEvent) => {
      if (event?.conversationId === conversationId) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === event.messageId) {
              return {
                ...msg,
                isDeletedForEveryone: true,
                content: '🚫 This message was deleted',
                attachments: [],
              };
            }
            return msg;
          })
        );
      }
    };

    const handleUserTyping = (event: DirectUserTypingEvent) => {
      if (event?.conversationId === conversationId && event.userId !== user?.id) {
        setPartnerIsTyping(Boolean(event.isTyping));
      }
    };

    const handleGroupActivity = () => {
      loadInbox();
    };

    socket.on('direct:new_message', handleNewMessage);
    socket.on('direct:reaction_updated', handleReactionUpdate);
    socket.on('direct:message_deleted', handleMessageDeleted);
    socket.on('direct:user_typing', handleUserTyping);
    socket.on('new_message', handleGroupActivity);

    return () => {
      if (conversationId) {
        socket.emit('direct:leave', { conversationId });
      }
      socket.off('direct:new_message', handleNewMessage);
      socket.off('direct:reaction_updated', handleReactionUpdate);
      socket.off('direct:message_deleted', handleMessageDeleted);
      socket.off('direct:user_typing', handleUserTyping);
      socket.off('new_message', handleGroupActivity);
    };
  }, [conversationId, user?.id, loadInbox]);

  // ---------------------------------------------------------------------------
  // 4. Send Message Handler (Optimistic UI + Sockets/REST)
  // ---------------------------------------------------------------------------
  const handleSendMessage = async (attachment?: ChatAttachmentItem) => {
    if (!conversationId) return;
    const trimmed = inputText.trim();
    if (!trimmed && !attachment) return;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const optimisticMessage: DirectMessageItem = {
      id: tempId,
      conversationId,
      senderId: user?.id || '',
      content: trimmed,
      tempId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sender: {
        id: user?.id || '',
        fullName: user?.fullName || 'Me',
        avatarUrl: null,
      },
      replyTo: replyTarget
        ? {
            id: replyTarget.id,
            senderId: replyTarget.senderId,
            senderName: replyTarget.sender?.fullName || 'User',
            content: replyTarget.content,
            attachmentType: replyTarget.attachments?.[0]?.type || null,
            attachmentName: replyTarget.attachments?.[0]?.fileName || null,
          }
        : null,
      attachments: attachment ? [attachment] : [],
      reactions: [],
    };

    // Append optimistic message
    setMessages((prev) => [...prev, optimisticMessage]);
    setInputText('');
    setReplyTarget(null);

    // Stop typing notification
    const socket = getChatSocket();
    socket.emit('direct:typing_stop', { conversationId });

    try {
      const attachmentPayload: ChatAttachmentInput | undefined = attachment
        ? {
            id: attachment.id,
            type: attachment.type,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            fileSizeBytes: attachment.fileSizeBytes,
            storagePath: attachment.storagePath,
            duration: attachment.duration != null ? Math.round(attachment.duration) : undefined,
          }
        : undefined;

      const saved = await sendDirectMessageApi(
        conversationId,
        trimmed,
        tempId,
        attachmentPayload,
        replyTarget?.id
      );

      // Reconcile optimistic message with authoritative server response
      setMessages((prev) => prev.map((m) => (m.tempId === tempId ? saved : m)));
      loadInbox();
    } catch (err: unknown) {
      console.error('[ChatPage] Failed to send message:', err);
      // Mark optimistic message as failed
      setMessages((prev) =>
        prev.map((m) =>
          m.tempId === tempId ? { ...m, content: `${m.content} ⚠️ (Failed to send)` } : m
        )
      );
    }
  };

  // Typing emitter with debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (!conversationId) return;

    const socket = getChatSocket();
    socket.emit('direct:typing_start', { conversationId });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('direct:typing_stop', { conversationId });
    }, 2000);
  };

  // ---------------------------------------------------------------------------
  // 5. File & Media Attachment Upload
  // ---------------------------------------------------------------------------
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !conversationId) return;

    setIsUploading(true);
    setUploadProgress(20);
    try {
      setUploadProgress(50);
      const uploadedAttachment = await uploadDirectAttachmentApi(conversationId, file, file.name);
      setUploadProgress(100);
      await handleSendMessage(uploadedAttachment);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to upload attachment.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      event.target.value = '';
    }
  };

  // ---------------------------------------------------------------------------
  // 6. Voice Notes Recording (Browser MediaRecorder)
  // ---------------------------------------------------------------------------
  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Your browser does not support audio recording.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());

        if (audioBlob.size > 1000 && conversationId) {
          setIsUploading(true);
          try {
            const voiceAttachment = await uploadDirectAttachmentApi(
              conversationId,
              audioBlob,
              `voice-note-${Date.now()}.webm`
            );
            await handleSendMessage(voiceAttachment);
          } catch (err) {
            console.error('[ChatPage] Voice upload failed:', err);
          } finally {
            setIsUploading(false);
          }
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Microphone access denied. Please grant microphone permission to record voice notes.');
    }
  };

  const stopRecording = (cancel: boolean = false) => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && isRecording) {
      if (cancel) {
        audioChunksRef.current = [];
      }
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 7. Reactions & Message Actions
  // ---------------------------------------------------------------------------
  const handleToggleReaction = async (messageId: string, emoji: string) => {
    if (!conversationId) return;
    try {
      const result = await toggleDirectReactionApi(conversationId, messageId, emoji);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, reactions: result.reactions as any } : m
        )
      );
    } catch (err) {
      console.error('[ChatPage] Failed to toggle reaction:', err);
    }
  };

  const handleDeleteMessage = async (scope: 'ME' | 'EVERYONE') => {
    if (!conversationId || !messageToDelete) return;
    try {
      await deleteDirectMessageApi(conversationId, messageToDelete.id, scope);
      if (scope === 'ME') {
        setMessages((prev) => prev.filter((m) => m.id !== messageToDelete.id));
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageToDelete.id
              ? { ...m, isDeletedForEveryone: true, content: '🚫 This message was deleted', attachments: [] }
              : m
          )
        );
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete message.');
    } finally {
      setDeleteDialogOpen(false);
      setMessageToDelete(null);
    }
  };

  // ---------------------------------------------------------------------------
  // 8. In-Chat Search
  // ---------------------------------------------------------------------------
  const handleSearchMessages = async () => {
    if (!conversationId || !searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const res = await searchDirectMessagesApi(conversationId, searchQuery.trim());
      setSearchResults(res.results || []);
    } catch (err) {
      console.error('[ChatPage] Search failed:', err);
    } finally {
      setSearchLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 9. Media Gallery Drawer
  // ---------------------------------------------------------------------------
  const openMediaGallery = async () => {
    if (!conversationId) return;
    setGalleryDrawerOpen(true);
    setGalleryLoading(true);
    try {
      const res = await getDirectMediaGalleryApi(conversationId);
      setGalleryMedia(res.media || []);
    } catch (err) {
      console.error('[ChatPage] Media gallery failed:', err);
    } finally {
      setGalleryLoading(false);
    }
  };

  interface UnifiedChatItem {
    type: 'direct' | 'group';
    id: string;
    slug?: string;
    name: string;
    avatarUrl: string | null;
    coverUrl?: string | null;
    lastMessage: string;
    timestamp: string;
    unreadCount?: number;
    privacy?: GroupPrivacy;
    membersCount?: number;
  }

  // Construct unified WhatsApp-style chat list (Direct chats + Community groups)
  const unifiedList: UnifiedChatItem[] = useMemo(() => {
    const list: UnifiedChatItem[] = [];

    // Map direct conversations
    if (inboxFilter === 'ALL' || inboxFilter === 'DIRECT') {
      conversations.forEach((c) => {
        list.push({
          type: 'direct',
          id: c.id,
          name: c.otherUser.fullName,
          avatarUrl: c.otherUser.avatarUrl,
          lastMessage:
            c.lastMessage?.content ||
            (c.lastMessage?.attachments?.length ? '📎 Media attachment' : 'Tap to chat'),
          timestamp: c.lastMessage?.createdAt || c.updatedAt,
          unreadCount: c.unreadCount || 0,
        });
      });
    }

    // Map community groups
    if (inboxFilter === 'ALL' || inboxFilter === 'GROUPS') {
      groups.forEach((g) => {
        list.push({
          type: 'group',
          id: g.id,
          slug: g.slug,
          name: g.name,
          avatarUrl: g.coverUrl,
          coverUrl: g.coverUrl,
          privacy: g.privacy,
          membersCount: g.membersCount,
          lastMessage: `${g.membersCount || 0} members • Group Chat`,
          timestamp: g.createdAt,
        });
      });
    }

    // Sort descending by timestamp (latest activity first, like WhatsApp)
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Search query filter
    if (!inboxSearch.trim()) return list;
    const q = inboxSearch.toLowerCase();
    return list.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.lastMessage.toLowerCase().includes(q)
    );
  }, [conversations, groups, inboxFilter, inboxSearch]);

  return (
    <Box sx={{ height: 'calc(100vh - 65px)', display: 'flex', bgcolor: 'background.default' }}>
      {/* ----------------------------------------------------------------- */}
      {/* LEFT PANE: INBOX / CONVERSATIONS LIST                             */}
      {/* ----------------------------------------------------------------- */}
      <Box
        sx={{
          width: { xs: '100%', md: 360 },
          display: { xs: conversationId || selectedGroup || loadingGroup ? 'none' : 'flex', md: 'flex' },
          flexDirection: 'column',
          borderRight: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        {/* Top Header & Search */}
        <Box sx={{ p: 2, pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="h6" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ChatIcon color="primary" /> संदेश व चैट / Chats
            </Typography>
            <Tooltip title="Refresh">
              <IconButton size="small" onClick={loadInbox}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          {/* WhatsApp-Style Filter Pills */}
          <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
            <Chip
              label={`All (${conversations.length + groups.length})`}
              size="small"
              clickable
              color={inboxFilter === 'ALL' ? 'primary' : 'default'}
              variant={inboxFilter === 'ALL' ? 'filled' : 'outlined'}
              onClick={() => setInboxFilter('ALL')}
              sx={{ fontWeight: 600, fontSize: '0.8rem' }}
            />
            <Chip
              label={`Direct (${conversations.length})`}
              size="small"
              clickable
              color={inboxFilter === 'DIRECT' ? 'primary' : 'default'}
              variant={inboxFilter === 'DIRECT' ? 'filled' : 'outlined'}
              onClick={() => setInboxFilter('DIRECT')}
              sx={{ fontWeight: 600, fontSize: '0.8rem' }}
            />
            <Chip
              label={`Groups (${groups.length})`}
              size="small"
              clickable
              color={inboxFilter === 'GROUPS' ? 'primary' : 'default'}
              variant={inboxFilter === 'GROUPS' ? 'filled' : 'outlined'}
              onClick={() => setInboxFilter('GROUPS')}
              sx={{ fontWeight: 600, fontSize: '0.8rem' }}
            />
          </Box>

          <TextField
            fullWidth
            size="small"
            placeholder="Search chats or groups..."
            value={inboxSearch}
            onChange={(e) => setInboxSearch(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
            }}
          />
        </Box>

        <Divider />

        {/* Conversation List Stream */}
        <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
          {inboxLoading ? (
            <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress size={30} />
            </Box>
          ) : unifiedList.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                कोई संदेश या समूह नहीं है / No chats or groups found
              </Typography>
              <Button variant="outlined" size="small" onClick={() => navigate('/directory')}>
                सदस्य डायरेक्टरी देखें / Member Directory
              </Button>
            </Box>
          ) : (
            <List disablePadding>
              {unifiedList.map((item) => {
                if (item.type === 'direct') {
                  const isSelected = item.id === conversationId;
                  return (
                    <ListItem key={`direct_${item.id}`} disablePadding divider>
                      <ListItemButton
                        selected={isSelected}
                        onClick={() => {
                          setSelectedGroup(null);
                          setSearchParams({});
                          navigate(`/chat/${item.id}`);
                        }}
                        sx={{ py: 1.5, px: 2 }}
                      >
                        <ListItemAvatar>
                          <Badge badgeContent={item.unreadCount} color="error" max={99}>
                            <Avatar
                              src={item.avatarUrl || undefined}
                              sx={{ bgcolor: 'primary.main', fontWeight: 600 }}
                            >
                              {item.name.charAt(0).toUpperCase()}
                            </Avatar>
                          </Badge>
                        </ListItemAvatar>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Typography variant="subtitle2" fontWeight={item.unreadCount && item.unreadCount > 0 ? 700 : 500} noWrap>
                                {item.name}
                              </Typography>
                              {item.timestamp && (
                                <Typography variant="caption" color="text.secondary">
                                  {formatChatTime(item.timestamp)}
                                </Typography>
                              )}
                            </Box>
                          }
                          secondary={
                            <Typography
                              variant="body2"
                              color={item.unreadCount && item.unreadCount > 0 ? 'text.primary' : 'text.secondary'}
                              fontWeight={item.unreadCount && item.unreadCount > 0 ? 600 : 400}
                              noWrap
                            >
                              {item.lastMessage}
                            </Typography>
                          }
                        />
                      </ListItemButton>
                    </ListItem>
                  );
                } else {
                  const isSelected = selectedGroup?.slug === item.slug || (!selectedGroup && groupSlugFromUrl === item.slug);
                  return (
                    <ListItem key={`group_${item.id}`} disablePadding divider>
                      <ListItemButton
                        selected={isSelected}
                        onClick={() => {
                          if (item.slug) {
                            navigate('/chat');
                            setSearchParams({ group: item.slug });
                          }
                        }}
                        sx={{ py: 1.5, px: 2 }}
                      >
                        <ListItemAvatar>
                          <Badge
                            overlap="circular"
                            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                            badgeContent={
                              <Box
                                sx={{
                                  width: 16,
                                  height: 16,
                                  borderRadius: '50%',
                                  bgcolor: 'secondary.main',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#fff',
                                  border: '1.5px solid #fff',
                                }}
                              >
                                <GroupsIcon sx={{ fontSize: 10 }} />
                              </Box>
                            }
                          >
                            <Avatar
                              src={item.avatarUrl || undefined}
                              sx={{ bgcolor: 'secondary.light', color: 'secondary.contrastText', fontWeight: 600 }}
                            >
                              <GroupsIcon fontSize="small" />
                            </Avatar>
                          </Badge>
                        </ListItemAvatar>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, maxWidth: 180 }}>
                                <Typography variant="subtitle2" fontWeight={600} noWrap>
                                  {item.name}
                                </Typography>
                                <Chip
                                  label="Group"
                                  size="small"
                                  variant="outlined"
                                  color="secondary"
                                  sx={{ height: 16, fontSize: '0.6rem', px: 0.2 }}
                                />
                              </Box>
                              {item.timestamp && (
                                <Typography variant="caption" color="text.secondary">
                                  {formatChatTime(item.timestamp)}
                                </Typography>
                              )}
                            </Box>
                          }
                          secondary={
                            <Typography variant="body2" color="text.secondary" noWrap>
                              {item.lastMessage}
                            </Typography>
                          }
                        />
                      </ListItemButton>
                    </ListItem>
                  );
                }
              })}
            </List>
          )}
        </Box>
      </Box>

      {/* ----------------------------------------------------------------- */}
      {/* RIGHT PANE: ACTIVE CONVERSATION OR GROUP CHAT STREAM              */}
      {/* ----------------------------------------------------------------- */}
      <Box
        sx={{
          flexGrow: 1,
          display: { xs: conversationId || selectedGroup || loadingGroup ? 'flex' : 'none', md: 'flex' },
          flexDirection: 'column',
          height: '100%',
          bgcolor: '#f1f5f9',
        }}
      >
        {loadingGroup ? (
          <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <CircularProgress size={36} />
          </Box>
        ) : selectedGroup ? (
          <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <GroupChatTab
              group={selectedGroup}
              onJoinGroup={handleJoinActiveGroup}
              actionLoading={groupActionLoading}
              onBack={() => {
                setSelectedGroup(null);
                setSearchParams({});
              }}
              headerExtra={
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => navigate(`/groups/${selectedGroup.slug}`)}
                  sx={{ textTransform: 'none', fontSize: '0.75rem', height: 26, borderRadius: 1.5 }}
                >
                  View Group Info
                </Button>
              }
              sx={{
                height: '100%',
                borderRadius: 0,
                border: 'none',
                boxShadow: 'none',
                bgcolor: 'transparent',
              }}
            />
          </Box>
        ) : conversationId ? (
          <>
            {/* Top Bar / Header */}
            <Paper
              elevation={0}
              sx={{
                p: 1.5,
                px: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: 1,
                borderColor: 'divider',
                borderRadius: 0,
                zIndex: 2,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                {isMobile && (
                  <IconButton size="small" onClick={() => navigate('/chat')}>
                    <ArrowBackIcon />
                  </IconButton>
                )}
                <Avatar
                  src={activeConversation?.otherUser.avatarUrl || undefined}
                  sx={{ bgcolor: 'primary.main', width: 40, height: 40 }}
                >
                  {activeConversation?.otherUser.fullName.charAt(0).toUpperCase() || 'U'}
                </Avatar>
                <Box>
                  <Typography variant="subtitle1" fontWeight={700}>
                    {activeConversation?.otherUser.fullName || 'Chat'}
                  </Typography>
                  <Typography variant="caption" color={partnerIsTyping ? 'primary.main' : 'text.secondary'} fontWeight={partnerIsTyping ? 600 : 400}>
                    {partnerIsTyping ? 'Typing...' : 'Active in Community'}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Tooltip title="Search in Chat">
                  <IconButton onClick={() => setSearchDrawerOpen(true)}>
                    <SearchIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Shared Media & Files">
                  <IconButton onClick={openMediaGallery}>
                    <GalleryIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Paper>

            {/* Messages Scrollable Container */}
            <Box sx={{ flexGrow: 1, overflowY: 'auto', p: { xs: 1.5, md: 3 }, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {messagesLoading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              )}

              {messagesError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {messagesError}
                </Alert>
              )}

              {messages.map((msg, index) => {
                const isSentByMe = msg.senderId === user?.id;
                const ytParsed = msg.content ? extractYouTubeVideoDetails(msg.content) : null;
                const showDateSeparator =
                  index === 0 ||
                  formatDateSeparator(messages[index - 1].createdAt) !== formatDateSeparator(msg.createdAt);

                return (
                  <React.Fragment key={msg.id || msg.tempId}>
                    {showDateSeparator && (
                      <Box sx={{ display: 'flex', justifyContent: 'center', my: 1.5 }}>
                        <Chip
                          label={formatDateSeparator(msg.createdAt)}
                          size="small"
                          sx={{ fontSize: 11, bgcolor: '#e2e8f0', color: '#475569', fontWeight: 600 }}
                        />
                      </Box>
                    )}

                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: isSentByMe ? 'flex-end' : 'flex-start',
                        position: 'relative',
                      }}
                    >
                      {/* Quoted Reply Header */}
                      {msg.replyTo && (
                        <Box
                          sx={{
                            mb: -0.5,
                            maxWidth: '75%',
                            bgcolor: isSentByMe ? '#dbeafe' : '#e2e8f0',
                            borderLeft: '4px solid #1976d2',
                            p: 0.75,
                            borderRadius: '4px 4px 0 0',
                            fontSize: 12,
                          }}
                        >
                          <Typography variant="caption" fontWeight="bold" color="primary.main">
                            {msg.replyTo.senderName}
                          </Typography>
                          <Typography variant="caption" display="block" noWrap color="text.secondary">
                            {msg.replyTo.content || 'Attachment'}
                          </Typography>
                        </Box>
                      )}

                      {/* Main Message Bubble */}
                      <Paper
                        elevation={1}
                        sx={{
                          p: 1.5,
                          maxWidth: { xs: '85%', sm: '70%', md: '60%' },
                          minWidth: msg.attachments && msg.attachments.length > 0 ? { xs: 260, sm: 300 } : 'auto',
                          bgcolor: isSentByMe ? '#1976d2' : '#ffffff',
                          color: isSentByMe ? '#ffffff' : 'text.primary',
                          borderRadius: isSentByMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                          wordBreak: 'break-word',
                          position: 'relative',
                        }}
                      >
                        {/* Attachments */}
                        {msg.attachments?.map((att) => {
                          const displayUrl = resolveAttachmentDisplayUrl(att.url || att.storagePath);

                          if (att.type === 'IMAGE') {
                            return (
                              <Box
                                key={att.id}
                                sx={{ mb: 1, cursor: 'pointer', borderRadius: 2, overflow: 'hidden' }}
                                onClick={() => setLightboxUrl(displayUrl)}
                              >
                                <img
                                  src={displayUrl}
                                  alt={att.fileName}
                                  style={{
                                    width: '100%',
                                    minWidth: 240,
                                    maxWidth: 360,
                                    maxHeight: 320,
                                    display: 'block',
                                    objectFit: 'cover',
                                    borderRadius: 8,
                                  }}
                                />
                              </Box>
                            );
                          }

                          if (att.type === 'VIDEO') {
                            return (
                              <Box key={att.id} sx={{ mb: 1, borderRadius: 2, overflow: 'hidden' }}>
                                <video
                                  controls
                                  style={{
                                    width: '100%',
                                    minWidth: 240,
                                    maxWidth: 360,
                                    maxHeight: 320,
                                    display: 'block',
                                    borderRadius: 8,
                                  }}
                                >
                                  <source src={displayUrl} type={att.mimeType || 'video/mp4'} />
                                  Your browser does not support video playback.
                                </video>
                              </Box>
                            );
                          }

                          if (att.type === 'AUDIO') {
                            return (
                              <Box key={att.id} sx={{ mb: 1, minWidth: 220 }}>
                                <audio controls style={{ width: '100%', height: 36 }}>
                                  <source src={displayUrl} type={att.mimeType || 'audio/webm'} />
                                </audio>
                              </Box>
                            );
                          }

                          // Default: Document / File
                          return (
                            <Box
                              key={att.id}
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                p: 1,
                                mb: 1,
                                bgcolor: isSentByMe ? 'rgba(255,255,255,0.15)' : '#f8fafc',
                                borderRadius: 1.5,
                              }}
                            >
                              <DocIcon />
                              <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                                <Typography variant="caption" fontWeight="bold" noWrap display="block">
                                  {att.fileName}
                                </Typography>
                                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                                  {formatFileSize(att.fileSizeBytes)}
                                </Typography>
                              </Box>
                              <IconButton
                                size="small"
                                component="a"
                                href={displayUrl}
                                target="_blank"
                                download
                                sx={{ color: isSentByMe ? '#ffffff' : 'inherit' }}
                              >
                                <OpenInNewIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          );
                        })}

                        {/* YouTube Link Preview Card */}
                        {ytParsed && (
                          <Card
                            sx={{
                              mb: 1,
                              maxWidth: 320,
                              bgcolor: isSentByMe ? 'rgba(255,255,255,0.15)' : '#f8fafc',
                              color: isSentByMe ? '#fff' : 'inherit',
                            }}
                          >
                            <Box sx={{ position: 'relative' }}>
                              <CardMedia
                                component="img"
                                height="160"
                                image={`https://img.youtube.com/vi/${ytParsed.videoId}/hqdefault.jpg`}
                                alt="YouTube video thumbnail"
                              />
                              <Box
                                sx={{
                                  position: 'absolute',
                                  inset: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  bgcolor: 'rgba(0,0,0,0.3)',
                                }}
                              >
                                <PlayIcon sx={{ fontSize: 48, color: '#ff0000' }} />
                              </Box>
                            </Box>
                            <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                              <Typography variant="caption" fontWeight="bold" display="block">
                                YouTube Video
                              </Typography>
                              <Typography variant="caption" sx={{ opacity: 0.8 }} display="block">
                                youtube.com/watch?v={ytParsed.videoId}
                              </Typography>
                            </CardContent>
                          </Card>
                        )}

                        {/* Message Text */}
                        <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                          {msg.content}
                        </Typography>

                        {/* Timestamp & Delivery Ticks */}
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                          <Typography variant="caption" sx={{ fontSize: 10, opacity: 0.75 }}>
                            {formatChatTime(msg.createdAt)}
                          </Typography>
                          {isSentByMe && (
                            <Box component="span" sx={{ display: 'inline-flex', opacity: 0.85 }}>
                              {msg.tempId ? (
                                <AccessTimeIcon sx={{ fontSize: 12 }} />
                              ) : (
                                <DoneAllIcon sx={{ fontSize: 14 }} />
                              )}
                            </Box>
                          )}
                        </Box>
                      </Paper>

                      {/* Reactions Display Pill Bar */}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <Box sx={{ display: 'flex', gap: 0.5, mt: -0.75, zIndex: 1 }}>
                          {msg.reactions.map((r) => (
                            <Chip
                              key={r.emoji}
                              label={`${r.emoji} ${r.count}`}
                              size="small"
                              onClick={() => handleToggleReaction(msg.id, r.emoji)}
                              color={r.hasReacted ? 'primary' : 'default'}
                              sx={{
                                fontSize: 11,
                                height: 22,
                                bgcolor: r.hasReacted ? '#bfdbfe' : '#ffffff',
                                border: '1px solid #cbd5e1',
                                boxShadow: 1,
                              }}
                            />
                          ))}
                        </Box>
                      )}

                      {/* Quick Action Trigger on Hover/Press */}
                      <Box sx={{ display: 'flex', gap: 0.5, opacity: 0.7, '&:hover': { opacity: 1 }, mt: 0.25 }}>
                        <IconButton
                          size="small"
                          onClick={() => setReplyTarget(msg)}
                          sx={{ p: 0.5 }}
                          title="Reply"
                        >
                          <ReplyIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={(e) => setMenuAnchor({ el: e.currentTarget, message: msg })}
                          sx={{ p: 0.5 }}
                          title="More options"
                        >
                          <AddReactionIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Box>
                    </Box>
                  </React.Fragment>
                );
              })}
              <div ref={messagesEndRef} />
            </Box>

            {/* Quoted Message Preview Banner above Composer */}
            {replyTarget && (
              <Box
                sx={{
                  p: 1,
                  px: 2,
                  bgcolor: '#e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTop: 1,
                  borderColor: 'divider',
                }}
              >
                <Box sx={{ overflow: 'hidden' }}>
                  <Typography variant="caption" fontWeight="bold" color="primary">
                    Replying to {replyTarget.sender?.fullName || 'User'}
                  </Typography>
                  <Typography variant="body2" noWrap color="text.secondary">
                    {replyTarget.content || 'Attachment'}
                  </Typography>
                </Box>
                <IconButton size="small" onClick={() => setReplyTarget(null)}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            )}

            {/* Upload Progress Bar */}
            {isUploading && (
              <Box sx={{ width: '100%' }}>
                <LinearProgress variant="determinate" value={uploadProgress} />
              </Box>
            )}

            {/* Voice Recording Active Banner */}
            {isRecording && (
              <Box
                sx={{
                  p: 1.5,
                  bgcolor: '#fee2e2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTop: 1,
                  borderColor: '#fca5a5',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      bgcolor: '#dc2626',
                      animation: 'pulse 1.5s infinite',
                    }}
                  />
                  <Typography variant="body2" color="#b91c1c" fontWeight="bold">
                    Recording Audio... {recordingSeconds}s
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button size="small" color="inherit" onClick={() => stopRecording(true)}>
                    Cancel
                  </Button>
                  <Button size="small" variant="contained" color="error" onClick={() => stopRecording(false)} startIcon={<StopIcon />}>
                    Send
                  </Button>
                </Box>
              </Box>
            )}

            {/* Bottom Message Composer */}
            <Paper
              elevation={2}
              sx={{
                p: 1.5,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                borderRadius: 0,
                borderTop: 1,
                borderColor: 'divider',
              }}
            >
              {/* Attachment Picker */}
              <input
                ref={fileInputRef}
                id="chat-file-input"
                type="file"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
              />
              <Tooltip title="Attach photo, video or document">
                <span>
                  <IconButton
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || isRecording}
                    size="small"
                  >
                    <AttachFileIcon />
                  </IconButton>
                </span>
              </Tooltip>

              {/* Text Input */}
              <TextField
                fullWidth
                multiline
                maxRows={4}
                size="small"
                placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={isRecording}
                sx={{ bgcolor: 'background.paper' }}
              />

              {/* Voice Recorder CTA */}
              {!inputText.trim() ? (
                <Tooltip title={isRecording ? 'Stop Recording' : 'Hold/Click to record Voice Note'}>
                  <IconButton
                    color={isRecording ? 'error' : 'primary'}
                    onClick={() => (isRecording ? stopRecording(false) : startRecording())}
                  >
                    <MicIcon />
                  </IconButton>
                </Tooltip>
              ) : (
                <IconButton color="primary" onClick={() => handleSendMessage()} disabled={!inputText.trim()}>
                  <SendIcon />
                </IconButton>
              )}
            </Paper>
          </>
        ) : (
          <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 4, textAlign: 'center' }}>
            <Box sx={{ mb: 2.5, opacity: 0.9 }}>
              <ApnaSamajLogo size={76} showText={false} />
            </Box>
            <Typography variant="h6" fontWeight="bold" color="text.primary">
              किसी बातचीत या समूह का चयन करें
            </Typography>
            <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
              Select a conversation or group
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400, mb: 3 }}>
              बाएं सूची में से किसी सदस्य या ग्रुप पर क्लिक करें, अथवा डायरेक्टरी से नए समाजजनों को संदेश भेजें।
            </Typography>
            <Button
              variant="outlined"
              color="primary"
              onClick={() => navigate('/directory')}
              sx={{ borderRadius: 2, textTransform: 'none', px: 2.5 }}
            >
              सदस्य डायरेक्टरी देखें / Member Directory
            </Button>
          </Box>
        )}
      </Box>

      {/* ----------------------------------------------------------------- */}
      {/* CONTEXT MENU: REACTIONS, COPY, DELETE                             */}
      {/* ----------------------------------------------------------------- */}
      <Menu
        anchorEl={menuAnchor?.el}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        {/* Quick Reaction Bar */}
        <Box sx={{ display: 'flex', gap: 1, px: 2, py: 1 }}>
          {ALLOWED_CHAT_REACTIONS.map((emoji) => (
            <IconButton
              key={emoji}
              size="small"
              onClick={() => {
                if (menuAnchor) handleToggleReaction(menuAnchor.message.id, emoji);
                setMenuAnchor(null);
              }}
            >
              <Typography sx={{ fontSize: 20 }}>{emoji}</Typography>
            </IconButton>
          ))}
        </Box>
        <Divider />
        <MenuItem
          onClick={() => {
            if (menuAnchor) setReplyTarget(menuAnchor.message);
            setMenuAnchor(null);
          }}
        >
          <ReplyIcon fontSize="small" sx={{ mr: 1.5 }} /> Reply
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuAnchor?.message.content) {
              navigator.clipboard.writeText(menuAnchor.message.content);
            }
            setMenuAnchor(null);
          }}
        >
          <CopyIcon fontSize="small" sx={{ mr: 1.5 }} /> Copy Text
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuAnchor) {
              setMessageToDelete(menuAnchor.message);
              setDeleteDialogOpen(true);
            }
            setMenuAnchor(null);
          }}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon fontSize="small" sx={{ mr: 1.5 }} /> Delete Message
        </MenuItem>
      </Menu>

      {/* ----------------------------------------------------------------- */}
      {/* DELETE CONFIRMATION DIALOG                                        */}
      {/* ----------------------------------------------------------------- */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>संदेश हटाएं / Delete Message?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Choose how you would like to delete this message.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={() => handleDeleteMessage('ME')} color="inherit">
            Delete for Me
          </Button>
          {messageToDelete?.senderId === user?.id && (
            <Button onClick={() => handleDeleteMessage('EVERYONE')} color="error" variant="contained">
              Delete for Everyone
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* ----------------------------------------------------------------- */}
      {/* IN-CHAT SEARCH DRAWER                                             */}
      {/* ----------------------------------------------------------------- */}
      <Drawer anchor="right" open={searchDrawerOpen} onClose={() => setSearchDrawerOpen(false)}>
        <Box sx={{ width: { xs: 300, sm: 380 }, p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6" fontWeight="bold">Search in Chat</Typography>
            <IconButton onClick={() => setSearchDrawerOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchMessages()}
            />
            <Button variant="contained" size="small" onClick={handleSearchMessages} disabled={searchLoading}>
              Search
            </Button>
          </Box>

          {searchLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <List>
              {searchResults.map((m) => (
                <ListItem key={m.id} disablePadding divider sx={{ py: 1 }}>
                  <ListItemText
                    primary={m.content}
                    secondary={formatChatTime(m.createdAt)}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Drawer>

      {/* ----------------------------------------------------------------- */}
      {/* SHARED MEDIA GALLERY DRAWER                                       */}
      {/* ----------------------------------------------------------------- */}
      <Drawer anchor="right" open={galleryDrawerOpen} onClose={() => setGalleryDrawerOpen(false)}>
        <Box sx={{ width: { xs: 300, sm: 400 }, p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6" fontWeight="bold">Media & Documents</Typography>
            <IconButton onClick={() => setGalleryDrawerOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>

          {galleryLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : galleryMedia.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', p: 3 }}>
              No shared media found.
            </Typography>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
              {galleryMedia.map((att) => {
                const url = resolveAttachmentDisplayUrl(att.url || att.storagePath);
                return (
                  <Box
                    key={att.id}
                    sx={{ height: 100, borderRadius: 1, overflow: 'hidden', cursor: 'pointer', bgcolor: '#e2e8f0' }}
                    onClick={() => {
                      if (att.type === 'IMAGE') setLightboxUrl(url);
                      else window.open(url, '_blank');
                    }}
                  >
                    {att.type === 'IMAGE' ? (
                      <img src={url} alt={att.fileName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        <DocIcon />
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      </Drawer>

      {/* ----------------------------------------------------------------- */}
      {/* IMAGE LIGHTBOX MODAL                                              */}
      {/* ----------------------------------------------------------------- */}
      <Dialog open={Boolean(lightboxUrl)} onClose={() => setLightboxUrl(null)} maxWidth="md" fullWidth>
        <Box sx={{ p: 1, position: 'relative', bgcolor: '#000', textAlign: 'center' }}>
          <IconButton
            onClick={() => setLightboxUrl(null)}
            sx={{ position: 'absolute', right: 8, top: 8, color: '#fff', bgcolor: 'rgba(0,0,0,0.5)' }}
          >
            <CloseIcon />
          </IconButton>
          {lightboxUrl && (
            <img
              src={lightboxUrl}
              alt="Preview"
              style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }}
            />
          )}
        </Box>
      </Dialog>
    </Box>
  );
};
