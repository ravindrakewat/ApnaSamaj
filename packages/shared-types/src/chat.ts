/**
 * Safe public representation of a chat message sender.
 * Strictly exposes display information only, never sensitive account credentials.
 */
export interface ChatMessageSender {
  id: string;
  fullName: string;
  avatarUrl: string | null;
}

export type ChatAttachmentType = 'IMAGE' | 'VIDEO' | 'DOCUMENT';

/**
 * Metadata representation of a chat media attachment (Image, Video, or Document).
 */
export interface ChatAttachmentItem {
  id: string;
  chatMessageId?: string | null;
  directMessageId?: string | null;
  type: ChatAttachmentType;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  storagePath: string;
  url?: string;
  createdAt: string;
}

/**
 * Client input structure for attaching media to a chat message.
 */
export interface ChatAttachmentInput {
  id?: string;
  type: ChatAttachmentType;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  storagePath: string;
}

/**
 * Response payload returned upon successful media upload.
 */
export interface UploadChatAttachmentResponseData {
  attachment: ChatAttachmentItem;
}

/**
 * Standard chat message representation across backend, sockets, and frontend.
 */
export interface ChatMessageItem {
  id: string;
  groupId: string;
  senderId: string;
  content: string;
  clientMessageId?: string | null;
  tempId?: string;
  createdAt: string;
  updatedAt: string;
  sender?: ChatMessageSender | null;
  attachments?: ChatAttachmentItem[];
}

/**
 * Alias for ChatMessageItem matching the ChatMessage naming convention.
 */
export type ChatMessage = ChatMessageItem;

/**
 * Response shape for paginated chat message history queries.
 */
export interface PaginatedChatMessagesResponse {
  messages: ChatMessageItem[];
  nextCursor?: string | null;
  hasMore: boolean;
}

/**
 * Alias matching the project's standard ResponseData convention.
 */
export type ChatMessagesResponseData = PaginatedChatMessagesResponse;

/**
 * Input payload for sending a chat message via HTTP or WebSocket.
 */
export interface SendChatMessageInput {
  groupId: string;
  content?: string;
  attachment?: ChatAttachmentInput;
  tempId?: string; // Client-generated UUID for optimistic UI matching
}

/**
 * Real-time event payload broadcasted when a message is saved.
 */
export interface NewChatMessageEvent {
  message: ChatMessageItem;
  tempId?: string;
}

/**
 * Real-time typing status event payload.
 */
export interface UserTypingEvent {
  groupId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
}

/**
 * Safe public representation of a direct chat participant.
 */
export interface DirectChatParticipant {
  id: string; // userId
  fullName: string;
  avatarUrl: string | null;
  lastReadAt?: string | null;
}

/**
 * Direct message item representation across backend, sockets, and frontend.
 */
export interface DirectMessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  clientMessageId?: string | null;
  tempId?: string;
  createdAt: string;
  updatedAt: string;
  sender?: ChatMessageSender | null;
  attachments?: ChatAttachmentItem[];
}

/**
 * Message delivery lifecycle state for offline-first chat and outbox queue.
 */
export type MessageDeliveryStatus = 'pending' | 'sending' | 'sent' | 'failed';

/**
 * Local offline persistent chat message structure.
 */
export interface LocalChatMessage {
  localId: string;
  tempId: string;
  serverMessageId?: string | null;
  conversationId: string;
  conversationType: 'DIRECT' | 'GROUP';
  senderId: string;
  content: string;
  attachment?: ChatAttachmentInput | null;
  deliveryStatus: MessageDeliveryStatus;
  retryCount: number;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
  tenantSlug: string;
  userId: string;
}

/**
 * Outbox queue item for optimistic and background synchronization.
 */
export interface OutboxQueueItem {
  id: string; // tempId
  tempId: string;
  conversationId: string;
  conversationType: 'DIRECT' | 'GROUP';
  content?: string;
  attachment?: ChatAttachmentInput;
  deliveryStatus: MessageDeliveryStatus;
  retryCount: number;
  lastAttemptAt?: string | null;
  nextAttemptAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  tenantSlug: string;
  userId: string;
}

/**
 * Response shape for paginated direct chat message history queries.
 */
export interface PaginatedDirectMessagesResponse {
  messages: DirectMessageItem[];
  nextCursor?: string | null;
  hasMore: boolean;
}

export type DirectMessagesResponseData = PaginatedDirectMessagesResponse;

/**
 * Direct conversation item for inbox list and conversation summaries.
 */
export interface DirectConversationItem {
  id: string;
  otherUser: DirectChatParticipant;
  lastMessage?: DirectMessageItem | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Response shape for direct inbox conversations list.
 */
export interface DirectInboxResponseData {
  conversations: DirectConversationItem[];
  nextCursor?: string | null;
  hasMore: boolean;
}

/**
 * Input payload for starting or fetching a direct conversation.
 */
export interface CreateDirectConversationInput {
  recipientId: string;
}

/**
 * Input payload for sending a direct message.
 */
export interface SendDirectMessageInput {
  content?: string;
  attachment?: ChatAttachmentInput;
  tempId?: string;
}

/**
 * Real-time event payload broadcasted when a direct message is sent.
 */
export interface DirectNewMessageEvent {
  message: DirectMessageItem;
  tempId?: string;
}

/**
 * Real-time typing status event payload for direct conversation.
 */
export interface DirectUserTypingEvent {
  conversationId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
}

/**
 * Real-time event payload broadcasted when a conversation is marked as read.
 */
export interface DirectMessageReadEvent {
  conversationId: string;
  userId: string;
  readAt: string;
}
