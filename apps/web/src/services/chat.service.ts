import {
  ChatMessagesResponseData,
  ChatMessageItem,
  DirectConversationItem,
  DirectInboxResponseData,
  DirectMessagesResponseData,
  DirectMessageItem,
  ChatAttachmentItem,
  ChatAttachmentInput,
  ToggleChatReactionResponseData,
  PaginatedChatSearchResponse,
  PaginatedChatMediaResponse,
} from '@apnasamaj/shared-types';
import { apiFetch } from './api.client';

export interface FetchGroupMessagesParams {
  before?: string;
  limit?: number;
}

export interface FetchDirectMessagesParams {
  before?: string;
  limit?: number;
}

export interface FetchDirectInboxParams {
  cursor?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Community Group Chat APIs
// ---------------------------------------------------------------------------

/**
 * Retrieves cursor-paginated chat messages for a specific group.
 */
export async function fetchGroupMessages(
  groupId: string,
  params: FetchGroupMessagesParams = {}
): Promise<ChatMessagesResponseData> {
  const queryParams = new URLSearchParams();
  if (params.before) queryParams.set('before', params.before);
  if (params.limit) queryParams.set('limit', params.limit.toString());

  const queryString = queryParams.toString();
  const endpoint = `/api/v1/groups/${encodeURIComponent(groupId)}/messages${queryString ? `?${queryString}` : ''}`;

  const response = await apiFetch<ChatMessagesResponseData>(endpoint, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to fetch group messages.');
  }

  return response.data;
}

/**
 * HTTP fallback for sending a chat message to a group.
 */
export async function sendGroupMessageApi(
  groupId: string,
  content?: string,
  tempId?: string,
  attachment?: ChatAttachmentInput,
  replyToMessageId?: string
): Promise<ChatMessageItem> {
  const response = await apiFetch<ChatMessageItem>(`/api/v1/groups/${encodeURIComponent(groupId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content: content || '', tempId, attachment, replyToMessageId }),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to send group message.');
  }

  return response.data;
}

/**
 * Uploads a media attachment for a group chat message.
 */
export async function uploadGroupAttachmentApi(
  groupId: string,
  file: File
): Promise<ChatAttachmentItem> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiFetch<{ attachment: ChatAttachmentItem }>(
    `/api/v1/groups/${encodeURIComponent(groupId)}/attachments`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.success || !response.data?.attachment) {
    throw new Error(response.error || 'Failed to upload group attachment.');
  }

  return response.data.attachment;
}

// ---------------------------------------------------------------------------
// Personal One-to-One Direct Chat APIs
// ---------------------------------------------------------------------------

/**
 * Retrieves the current user's direct chat conversations inbox.
 */
export async function fetchDirectInbox(
  params: FetchDirectInboxParams = {}
): Promise<DirectInboxResponseData> {
  const queryParams = new URLSearchParams();
  if (params.cursor) queryParams.set('cursor', params.cursor);
  if (params.limit) queryParams.set('limit', params.limit.toString());

  const queryString = queryParams.toString();
  const endpoint = `/api/v1/chat/inbox${queryString ? `?${queryString}` : ''}`;

  const response = await apiFetch<DirectInboxResponseData>(endpoint, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to load chat inbox.');
  }

  return response.data;
}

/**
 * Initiates or returns an existing 1-on-1 direct conversation with a community member.
 */
export async function createOrGetDirectConversation(
  recipientId: string
): Promise<DirectConversationItem> {
  const response = await apiFetch<DirectConversationItem>('/api/v1/chat/direct', {
    method: 'POST',
    body: JSON.stringify({ recipientId }),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to initiate conversation.');
  }

  return response.data;
}

/**
 * Retrieves cursor-paginated messages for a direct conversation.
 */
export async function fetchDirectMessages(
  conversationId: string,
  params: FetchDirectMessagesParams = {}
): Promise<DirectMessagesResponseData> {
  const queryParams = new URLSearchParams();
  if (params.before) queryParams.set('before', params.before);
  if (params.limit) queryParams.set('limit', params.limit.toString());

  const queryString = queryParams.toString();
  const endpoint = `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/messages${queryString ? `?${queryString}` : ''}`;

  const response = await apiFetch<DirectMessagesResponseData>(endpoint, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to load direct messages.');
  }

  return response.data;
}

/**
 * Sends a direct message via HTTP fallback.
 */
export async function sendDirectMessageApi(
  conversationId: string,
  content?: string,
  tempId?: string,
  attachment?: ChatAttachmentInput,
  replyToMessageId?: string
): Promise<DirectMessageItem> {
  const response = await apiFetch<DirectMessageItem>(
    `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        content: content || '',
        tempId,
        attachment,
        replyToMessageId,
      }),
    }
  );

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to send message.');
  }

  return response.data;
}

/**
 * Uploads a media attachment (photo, video, voice note, document) for a direct conversation.
 */
export async function uploadDirectAttachmentApi(
  conversationId: string,
  file: File | Blob,
  fileName?: string
): Promise<ChatAttachmentItem> {
  const formData = new FormData();
  if (file instanceof File) {
    formData.append('file', file);
  } else {
    formData.append('file', file, fileName || 'voice-note.webm');
  }

  const response = await apiFetch<{ attachment: ChatAttachmentItem }>(
    `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/attachments`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.success || !response.data?.attachment) {
    throw new Error(response.error || 'Failed to upload attachment.');
  }

  return response.data.attachment;
}

/**
 * Toggles an emoji reaction on a direct message.
 */
export async function toggleDirectReactionApi(
  conversationId: string,
  messageId: string,
  emoji: string
): Promise<ToggleChatReactionResponseData> {
  const response = await apiFetch<ToggleChatReactionResponseData>(
    `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions`,
    {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    }
  );

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to update reaction.');
  }

  return response.data;
}

/**
 * Removes an emoji reaction from a direct message.
 */
export async function removeDirectReactionApi(
  conversationId: string,
  messageId: string
): Promise<ToggleChatReactionResponseData> {
  const response = await apiFetch<ToggleChatReactionResponseData>(
    `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions`,
    {
      method: 'DELETE',
    }
  );

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to remove reaction.');
  }

  return response.data;
}

/**
 * Deletes a direct message (scope: 'ME' or 'EVERYONE').
 */
export async function deleteDirectMessageApi(
  conversationId: string,
  messageId: string,
  scope: 'ME' | 'EVERYONE' = 'ME'
): Promise<void> {
  const response = await apiFetch<void>(
    `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
    {
      method: 'DELETE',
      body: JSON.stringify({ scope }),
    }
  );

  if (!response.success) {
    throw new Error(response.error || 'Failed to delete message.');
  }
}

/**
 * Marks all incoming messages in a direct conversation as read.
 */
export async function markDirectConversationReadApi(conversationId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/read`, {
    method: 'POST',
  }).catch(() => {});
}

/**
 * Searches messages within a direct conversation by keyword.
 */
export async function searchDirectMessagesApi(
  conversationId: string,
  query: string
): Promise<PaginatedChatSearchResponse> {
  const queryParams = new URLSearchParams({ q: query });
  const endpoint = `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/search?${queryParams.toString()}`;

  const response = await apiFetch<PaginatedChatSearchResponse>(endpoint, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to search messages.');
  }

  return response.data;
}

/**
 * Retrieves media gallery attachments (photos, videos, documents) for a conversation.
 */
export async function getDirectMediaGalleryApi(
  conversationId: string,
  type?: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO'
): Promise<PaginatedChatMediaResponse> {
  const queryParams = new URLSearchParams();
  if (type) queryParams.set('type', type);

  const queryString = queryParams.toString();
  const endpoint = `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/media${queryString ? `?${queryString}` : ''}`;

  const response = await apiFetch<PaginatedChatMediaResponse>(endpoint, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to load media gallery.');
  }

  return response.data;
}
