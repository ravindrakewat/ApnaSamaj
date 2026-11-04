import { apiClient } from './client';
import {
  ApiResponse,
  ChatMessagesResponseData,
  ChatMessageItem,
  DirectConversationItem,
  DirectInboxResponseData,
  DirectMessagesResponseData,
  DirectMessageItem,
} from '@apnasamaj/shared-types';

export interface ListGroupMessagesParams {
  limit?: number;
  before?: string; // ISO date string cursor
}

export interface ListDirectMessagesParams {
  limit?: number;
  before?: string;
}

export interface ListDirectInboxParams {
  limit?: number;
  cursor?: string;
}

export const chatApi = {
  // -------------------------------------------------------------
  // COMMUNITY GROUP CHAT APIS
  // -------------------------------------------------------------

  /**
   * Retrieves cursor-paginated chat history for a group.
   * Scoped to the caller's tenant community database via x-community-slug.
   */
  async getGroupMessages(
    groupId: string,
    params: ListGroupMessagesParams = {}
  ): Promise<ChatMessagesResponseData> {
    if (!groupId || !groupId.trim()) {
      throw new Error('Group ID is required to fetch chat messages.');
    }

    const queryParams: Record<string, string | number | undefined> = {};
    if (params.limit) queryParams.limit = params.limit;
    if (params.before) queryParams.before = params.before;

    const response = await apiClient.get<ApiResponse<ChatMessagesResponseData>>(
      `/groups/${encodeURIComponent(groupId.trim())}/messages`,
      { params: queryParams }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to retrieve group chat messages.');
    }

    return response.data;
  },

  /**
   * HTTP fallback for sending a chat message to a group.
   * Used when Socket.IO connection is unavailable or for guaranteed persistence.
   */
  async sendGroupMessage(
    groupId: string,
    content: string,
    tempId?: string
  ): Promise<ChatMessageItem> {
    if (!groupId || !groupId.trim()) {
      throw new Error('Group ID is required to send message.');
    }
    const trimmed = content ? content.trim() : '';
    if (!trimmed) {
      throw new Error('Message content cannot be empty.');
    }

    const response = await apiClient.post<ApiResponse<ChatMessageItem>>(
      `/groups/${encodeURIComponent(groupId.trim())}/messages`,
      {
        content: trimmed,
        tempId,
      }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to send group chat message.');
    }

    return response.data;
  },

  // -------------------------------------------------------------
  // PERSONAL ONE-TO-ONE CHAT APIS
  // -------------------------------------------------------------

  /**
   * Starts or retrieves an existing 1-on-1 direct conversation with a community member.
   * Scoped to active tenant database via x-community-slug.
   */
  async createDirectConversation(recipientId: string): Promise<DirectConversationItem> {
    if (!recipientId || !recipientId.trim()) {
      throw new Error('Recipient ID is required to start a chat.');
    }

    const response = await apiClient.post<ApiResponse<DirectConversationItem>>('/chat/direct', {
      recipientId: recipientId.trim(),
    });

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to initiate direct conversation.');
    }

    return response.data;
  },

  /**
   * Retrieves user's direct messaging inbox with unread counts and last message previews.
   */
  async getDirectInbox(params: ListDirectInboxParams = {}): Promise<DirectInboxResponseData> {
    const queryParams: Record<string, string | number | undefined> = {};
    if (params.limit) queryParams.limit = params.limit;
    if (params.cursor) queryParams.cursor = params.cursor;

    const response = await apiClient.get<ApiResponse<DirectInboxResponseData>>('/chat/inbox', {
      params: queryParams,
    });

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to retrieve chat inbox.');
    }

    return response.data;
  },

  /**
   * Retrieves cursor-paginated message history for a direct conversation.
   */
  async getDirectMessages(
    conversationId: string,
    params: ListDirectMessagesParams = {}
  ): Promise<DirectMessagesResponseData> {
    if (!conversationId || !conversationId.trim()) {
      throw new Error('Conversation ID is required to fetch messages.');
    }

    const queryParams: Record<string, string | number | undefined> = {};
    if (params.limit) queryParams.limit = params.limit;
    if (params.before) queryParams.before = params.before;

    const response = await apiClient.get<ApiResponse<DirectMessagesResponseData>>(
      `/chat/conversations/${encodeURIComponent(conversationId.trim())}/messages`,
      { params: queryParams }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to retrieve direct messages.');
    }

    return response.data;
  },

  /**
   * HTTP fallback for sending a direct message in a conversation.
   */
  async sendDirectMessage(
    conversationId: string,
    content: string,
    tempId?: string
  ): Promise<DirectMessageItem> {
    if (!conversationId || !conversationId.trim()) {
      throw new Error('Conversation ID is required to send message.');
    }
    const trimmed = content ? content.trim() : '';
    if (!trimmed) {
      throw new Error('Message content cannot be empty.');
    }

    const response = await apiClient.post<ApiResponse<DirectMessageItem>>(
      `/chat/conversations/${encodeURIComponent(conversationId.trim())}/messages`,
      {
        content: trimmed,
        tempId,
      }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to send direct message.');
    }

    return response.data;
  },

  /**
   * Marks a direct conversation as read for the current user.
   */
  async markDirectConversationAsRead(
    conversationId: string
  ): Promise<{ conversationId: string; readAt: string }> {
    if (!conversationId || !conversationId.trim()) {
      throw new Error('Conversation ID is required.');
    }

    const response = await apiClient.post<ApiResponse<{ conversationId: string; readAt: string }>>(
      `/chat/conversations/${encodeURIComponent(conversationId.trim())}/read`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to mark conversation as read.');
    }

    return response.data;
  },
};
