import {
  PostItem,
  FeedResponseData,
  CreatePostRequest,
  UpdatePostRequest,
  UploadMediaResponseData,
  PostType,
  PostLikesResponseData,
  PostViewsResponseData,
  CommentItem,
  CreateCommentRequest,
  UpdateCommentRequest,
  CommentsResponseData,
  ReportPostRequest,
  ReportPostResponseData,
} from '@apnasamaj/shared-types';
import { apiFetch, getInMemoryToken, getActiveCommunitySlug } from './api.client';
import { API_BASE_URL } from '../config/api.config';

export async function uploadPostMediaApi(file: File): Promise<UploadMediaResponseData> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiFetch<UploadMediaResponseData>('/api/v1/posts/media/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to upload image.');
  }

  return response.data;
}

export function uploadPostVideoApi(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadMediaResponseData> {
  return new Promise((resolve, reject) => {
    // If XMLHttpRequest is not available (e.g. Node test environment), fallback to apiFetch
    if (typeof XMLHttpRequest === 'undefined') {
      const formData = new FormData();
      formData.append('file', file);
      apiFetch<UploadMediaResponseData>('/api/v1/posts/media/video-upload', {
        method: 'POST',
        body: formData,
      })
        .then((res) => {
          if (!res.success || !res.data) {
            reject(new Error(res.error || 'Failed to upload video.'));
          } else {
            resolve(res.data);
          }
        })
        .catch(reject);
      return;
    }

    const xhr = new XMLHttpRequest();
    const token = getInMemoryToken();
    const communitySlug = getActiveCommunitySlug();

    xhr.open('POST', `${API_BASE_URL}/api/v1/posts/media/video-upload`, true);
    xhr.withCredentials = true;

    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    if (communitySlug) {
      xhr.setRequestHeader('X-Community-Slug', communitySlug);
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      try {
        const response = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && response.success && response.data) {
          resolve(response.data);
        } else {
          reject(new Error(response.error || 'Failed to upload video.'));
        }
      } catch {
        reject(new Error('Failed to parse upload server response.'));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during video upload. Please check your connection.'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Video upload timed out. Please try again.'));
    };

    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}

export async function getFeedApi(
  page: number = 1,
  limit: number = 10,
  type?: PostType,
  authorId?: string,
  searchOrOptions?: string | { signal?: AbortSignal; search?: string },
  options?: { signal?: AbortSignal }
): Promise<FeedResponseData> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  if (type) params.set('type', type);
  if (authorId) params.set('authorId', authorId);

  let searchStr: string | undefined;
  let signal: AbortSignal | undefined;

  if (typeof searchOrOptions === 'string') {
    searchStr = searchOrOptions;
    signal = options?.signal;
  } else if (searchOrOptions && typeof searchOrOptions === 'object') {
    searchStr = searchOrOptions.search;
    signal = searchOrOptions.signal || options?.signal;
  }

  if (searchStr && searchStr.trim()) {
    params.set('search', searchStr.trim().slice(0, 100));
  }

  const response = await apiFetch<FeedResponseData>(`/api/v1/posts?${params.toString()}`, {
    method: 'GET',
    signal,
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to load community feed.');
  }

  return response.data;
}

export async function getPostApi(id: string): Promise<PostItem> {
  const response = await apiFetch<PostItem>(`/api/v1/posts/${id}`, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to retrieve post.');
  }

  return response.data;
}

export async function createPostApi(data: CreatePostRequest): Promise<PostItem> {
  const response = await apiFetch<PostItem>('/api/v1/posts', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to publish post.');
  }

  return response.data;
}

export async function updatePostApi(id: string, data: UpdatePostRequest): Promise<PostItem> {
  const response = await apiFetch<PostItem>(`/api/v1/posts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to update post.');
  }

  return response.data;
}

export async function deletePostApi(id: string): Promise<void> {
  const response = await apiFetch<{ message: string }>(`/api/v1/posts/${id}`, {
    method: 'DELETE',
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to delete post.');
  }
}

export async function pinPostApi(id: string): Promise<PostItem> {
  const response = await apiFetch<PostItem>(`/api/v1/posts/${id}/pin`, {
    method: 'POST',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to pin post.');
  }

  return response.data;
}

export async function unpinPostApi(id: string): Promise<PostItem> {
  const response = await apiFetch<PostItem>(`/api/v1/posts/${id}/pin`, {
    method: 'DELETE',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to unpin post.');
  }

  return response.data;
}

// --------------------------------------------------------
// LIKES API METHODS
// --------------------------------------------------------

export async function likePostApi(postId: string): Promise<PostLikesResponseData> {
  const response = await apiFetch<PostLikesResponseData>(`/api/v1/posts/${postId}/like`, {
    method: 'POST',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to like post.');
  }

  return response.data;
}

export async function unlikePostApi(postId: string): Promise<PostLikesResponseData> {
  const response = await apiFetch<PostLikesResponseData>(`/api/v1/posts/${postId}/like`, {
    method: 'DELETE',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to unlike post.');
  }

  return response.data;
}

export async function getPostLikesApi(postId: string): Promise<PostLikesResponseData> {
  const response = await apiFetch<PostLikesResponseData>(`/api/v1/posts/${postId}/likes`, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to get post likes.');
  }

  return response.data;
}

// --------------------------------------------------------
// VIEWS API METHODS
// --------------------------------------------------------

export async function recordPostViewApi(postId: string): Promise<PostViewsResponseData> {
  const response = await apiFetch<PostViewsResponseData>(`/api/v1/posts/${postId}/view`, {
    method: 'POST',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to record post view.');
  }

  return response.data;
}

export async function getPostViewsApi(postId: string): Promise<PostViewsResponseData> {
  const response = await apiFetch<PostViewsResponseData>(`/api/v1/posts/${postId}/views`, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to get post views.');
  }

  return response.data;
}

// --------------------------------------------------------
// COMMENTS API METHODS
// --------------------------------------------------------

export async function getPostCommentsApi(
  postId: string,
  page: number = 1,
  limit: number = 10
): Promise<CommentsResponseData> {
  const response = await apiFetch<CommentsResponseData>(
    `/api/v1/posts/${postId}/comments?page=${page}&limit=${limit}`,
    {
      method: 'GET',
    }
  );

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to load comments.');
  }

  return response.data;
}

export async function createCommentApi(
  postId: string,
  data: CreateCommentRequest
): Promise<CommentItem> {
  const response = await apiFetch<CommentItem>(`/api/v1/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to post comment.');
  }

  return response.data;
}

export async function updateCommentApi(
  postId: string,
  commentId: string,
  data: UpdateCommentRequest
): Promise<CommentItem> {
  const response = await apiFetch<CommentItem>(
    `/api/v1/posts/${postId}/comments/${commentId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    }
  );

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to update comment.');
  }

  return response.data;
}

export async function deleteCommentApi(postId: string, commentId: string): Promise<void> {
  const response = await apiFetch<{ message: string }>(
    `/api/v1/posts/${postId}/comments/${commentId}`,
    {
      method: 'DELETE',
    }
  );

  if (!response.success) {
    throw new Error(response.error || 'Failed to delete comment.');
  }
}

// --------------------------------------------------------
// REPORTING API METHODS
// --------------------------------------------------------

export async function reportPostApi(
  postId: string,
  data: ReportPostRequest
): Promise<ReportPostResponseData> {
  const response = await apiFetch<ReportPostResponseData>(`/api/v1/posts/${postId}/report`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to submit post report.');
  }

  return response.data;
}

