/**
 * Safe public representation of a chat message sender.
 * Strictly exposes display information only, never sensitive account credentials.
 */
export interface ChatMessageSender {
  id: string;
  fullName: string;
  avatarUrl: string | null;
}

/**
 * Standard chat message representation across backend, sockets, and frontend.
 */
export interface ChatMessageItem {
  id: string;
  groupId: string;
  senderId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  sender?: ChatMessageSender | null;
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
  content: string;
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
  createdAt: string;
  updatedAt: string;
  sender?: ChatMessageSender | null;
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
  content: string;
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
