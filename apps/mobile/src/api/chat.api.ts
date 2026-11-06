import { apiClient } from './client';
import {
  ApiResponse,
  ChatMessagesResponseData,
  ChatMessageItem,
  DirectConversationItem,
  DirectInboxResponseData,
  DirectMessagesResponseData,
  DirectMessageItem,
  ChatAttachmentItem,
  ChatAttachmentInput,
  ToggleChatReactionResponseData,
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

export interface UploadAttachmentFile {
  uri: string;
  name: string;
  type: string;
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
   * Supports text-only, attachment-only, and text + attachment.
   */
  async sendGroupMessage(
    groupId: string,
    content?: string,
    tempId?: string,
    attachment?: ChatAttachmentInput,
    replyToMessageId?: string
  ): Promise<ChatMessageItem> {
    if (!groupId || !groupId.trim()) {
      throw new Error('Group ID is required to send message.');
    }
    const trimmed = content ? content.trim() : '';
    if (!trimmed && !attachment) {
      throw new Error('Message content or an attachment is required.');
    }

    const response = await apiClient.post<ApiResponse<ChatMessageItem>>(
      `/groups/${encodeURIComponent(groupId.trim())}/messages`,
      {
        content: trimmed,
        attachment,
        tempId,
        replyToMessageId,
      }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to send group chat message.');
    }

    return response.data;
  },

  /**
   * Toggles an emoji reaction on a group chat message.
   */
  async toggleGroupReaction(
    groupId: string,
    messageId: string,
    emoji: string
  ): Promise<ToggleChatReactionResponseData> {
    if (!groupId || !messageId || !emoji) {
      throw new Error('Group ID, message ID, and emoji are required.');
    }

    const response = await apiClient.post<ApiResponse<ToggleChatReactionResponseData>>(
      `/groups/${encodeURIComponent(groupId.trim())}/messages/${encodeURIComponent(messageId.trim())}/reactions`,
      { emoji }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to update group message reaction.');
    }

    return response.data;
  },

  /**
   * Removes any active reaction from the user on a group chat message.
   */
  async removeGroupReaction(
    groupId: string,
    messageId: string
  ): Promise<ToggleChatReactionResponseData> {
    if (!groupId || !messageId) {
      throw new Error('Group ID and message ID are required.');
    }

    const response = await apiClient.delete<ApiResponse<ToggleChatReactionResponseData>>(
      `/groups/${encodeURIComponent(groupId.trim())}/messages/${encodeURIComponent(messageId.trim())}/reactions`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to remove group message reaction.');
    }

    return response.data;
  },

  /**
   * Uploads a media attachment (image, video, document) for a community group chat.
   */
  async uploadGroupAttachment(
    groupId: string,
    file: UploadAttachmentFile
  ): Promise<ChatAttachmentItem> {
    if (!groupId || !groupId.trim()) {
      throw new Error('Group ID is required to upload attachment.');
    }

    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as any);

    const response = await apiClient.upload<ApiResponse<{ attachment: ChatAttachmentItem }>>(
      `/groups/${encodeURIComponent(groupId.trim())}/attachments`,
      formData
    );

    if (!response.success || !response.data?.attachment) {
      throw new Error(response.error || 'Failed to upload group attachment.');
    }

    return response.data.attachment;
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
   * Supports text-only, attachment-only, and text + attachment.
   */
  async sendDirectMessage(
    conversationId: string,
    content?: string,
    tempId?: string,
    attachment?: ChatAttachmentInput,
    replyToMessageId?: string
  ): Promise<DirectMessageItem> {
    if (!conversationId || !conversationId.trim()) {
      throw new Error('Conversation ID is required to send message.');
    }
    const trimmed = content ? content.trim() : '';
    if (!trimmed && !attachment) {
      throw new Error('Message content or an attachment is required.');
    }

    const response = await apiClient.post<ApiResponse<DirectMessageItem>>(
      `/chat/conversations/${encodeURIComponent(conversationId.trim())}/messages`,
      {
        content: trimmed,
        attachment,
        tempId,
        replyToMessageId,
      }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to send direct message.');
    }

    return response.data;
  },

  /**
   * Toggles an emoji reaction on a direct message.
   */
  async toggleDirectReaction(
    conversationId: string,
    messageId: string,
    emoji: string
  ): Promise<ToggleChatReactionResponseData> {
    if (!conversationId || !messageId || !emoji) {
      throw new Error('Conversation ID, message ID, and emoji are required.');
    }

    const response = await apiClient.post<ApiResponse<ToggleChatReactionResponseData>>(
      `/chat/conversations/${encodeURIComponent(conversationId.trim())}/messages/${encodeURIComponent(messageId.trim())}/reactions`,
      { emoji }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to update direct message reaction.');
    }

    return response.data;
  },

  /**
   * Removes any active reaction from the user on a direct message.
   */
  async removeDirectReaction(
    conversationId: string,
    messageId: string
  ): Promise<ToggleChatReactionResponseData> {
    if (!conversationId || !messageId) {
      throw new Error('Conversation ID and message ID are required.');
    }

    const response = await apiClient.delete<ApiResponse<ToggleChatReactionResponseData>>(
      `/chat/conversations/${encodeURIComponent(conversationId.trim())}/messages/${encodeURIComponent(messageId.trim())}/reactions`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to remove direct message reaction.');
    }

    return response.data;
  },

  /**
   * Uploads a media attachment (image, video, document) for a direct conversation.
   */
  async uploadDirectAttachment(
    conversationId: string,
    file: UploadAttachmentFile
  ): Promise<ChatAttachmentItem> {
    if (!conversationId || !conversationId.trim()) {
      throw new Error('Conversation ID is required to upload attachment.');
    }

    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as any);

    const response = await apiClient.upload<ApiResponse<{ attachment: ChatAttachmentItem }>>(
      `/chat/conversations/${encodeURIComponent(conversationId.trim())}/attachments`,
      formData
    );

    if (!response.success || !response.data?.attachment) {
      throw new Error(response.error || 'Failed to upload chat attachment.');
    }

    return response.data.attachment;
  },

  /**
   * Retrieves a refreshed signed URL for viewing or downloading a chat attachment.
   */
  async getAttachmentUrl(attachmentId: string): Promise<string> {
    if (!attachmentId || !attachmentId.trim()) {
      throw new Error('Attachment ID is required.');
    }

    const response = await apiClient.get<ApiResponse<{ url: string }>>(
      `/chat/attachments/${encodeURIComponent(attachmentId.trim())}/url`
    );

    if (!response.success || !response.data?.url) {
      throw new Error(response.error || 'Failed to get attachment URL.');
    }

    return response.data.url;
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
