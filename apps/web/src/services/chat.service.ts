import { ChatMessagesResponseData, ChatMessageItem } from '@apnasamaj/shared-types';
import { apiFetch } from './api.client';

export interface FetchGroupMessagesParams {
  before?: string;
  limit?: number;
}

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
  const endpoint = `/api/v1/groups/${groupId}/messages${queryString ? `?${queryString}` : ''}`;

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
  content: string,
  tempId?: string
): Promise<ChatMessageItem> {
  const response = await apiFetch<ChatMessageItem>(`/api/v1/groups/${groupId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, tempId }),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to send group message.');
  }

  return response.data;
}
