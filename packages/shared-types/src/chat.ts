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
