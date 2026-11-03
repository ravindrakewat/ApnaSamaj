import { apiClient } from './client';
import { ApiResponse } from './types';
import {
  PostItem,
  FeedResponseData,
  FeedQueryParams,
  PostLikesResponseData,
  CommentsResponseData,
  CommentItem,
  CreatePostRequest,
  UploadMediaResponseData,
} from '@apnasamaj/shared-types';

/**
 * Community Social Feed & Post Interactions API Client for Mobile.
 * Connects to existing `/api/v1/posts` endpoints with automatic tenant context and JWT auth.
 */
export const postsApi = {
  /**
   * Retrieves paginated community feed with optional category filter and keyword search.
   */
  async getFeed(params: FeedQueryParams = {}): Promise<FeedResponseData> {
    const queryParams: Record<string, string | number | undefined> = {
      page: params.page || 1,
      limit: params.limit || 10,
    };

    if (params.type) {
      queryParams.type = params.type;
    }
    if (params.search && params.search.trim()) {
      queryParams.search = params.search.trim().slice(0, 100);
    }
    if (params.authorId) {
      queryParams.authorId = params.authorId;
    }

    const response = await apiClient.get<ApiResponse<FeedResponseData>>('/posts', {
      params: queryParams,
    });

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to load community feed.');
    }

    return response.data;
  },

  /**
   * Retrieves single post details by ID.
   */
  async getPost(postId: string): Promise<PostItem> {
    const response = await apiClient.get<ApiResponse<PostItem>>(`/posts/${postId}`);
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to retrieve post details.');
    }
    return response.data;
  },

  /**
   * Likes a post.
   */
  async likePost(postId: string): Promise<PostLikesResponseData> {
    const response = await apiClient.post<ApiResponse<PostLikesResponseData>>(
      `/posts/${postId}/like`
    );
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to like post.');
    }
    return response.data;
  },

  /**
   * Unlikes a post.
   */
  async unlikePost(postId: string): Promise<PostLikesResponseData> {
    const response = await apiClient.delete<ApiResponse<PostLikesResponseData>>(
      `/posts/${postId}/like`
    );
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to unlike post.');
    }
    return response.data;
  },

  /**
   * Retrieves paginated comments for a post.
   */
  async getComments(
    postId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<CommentsResponseData> {
    const response = await apiClient.get<ApiResponse<CommentsResponseData>>(
      `/posts/${postId}/comments`,
      {
        params: { page, limit },
      }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to load comments.');
    }

    return response.data;
  },

  /**
   * Adds a new comment to a post.
   */
  async createComment(postId: string, content: string): Promise<CommentItem> {
    const response = await apiClient.post<ApiResponse<CommentItem>>(
      `/posts/${postId}/comments`,
      { content: content.trim() }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to submit comment.');
    }

    return response.data;
  },

  /**
   * Records an authenticated view for analytics.
   */
  async recordView(postId: string): Promise<void> {
    try {
      await apiClient.post(`/posts/${postId}/view`);
    } catch {
      // Best-effort view tracking
    }
  },

  /**
   * Publishes a new post with optional media attachments.
   */
  async createPost(payload: CreatePostRequest): Promise<PostItem> {
    const response = await apiClient.post<ApiResponse<PostItem>>('/posts', payload);
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to create post.');
    }
    return response.data;
  },

  /**
   * Uploads an image to Supabase Storage via backend /api/v1/posts/media/upload.
   */
  async uploadMedia(file: {
    uri: string;
    name: string;
    type: string;
  }): Promise<UploadMediaResponseData> {
    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as any);

    const response = await apiClient.upload<ApiResponse<UploadMediaResponseData>>(
      '/posts/media/upload',
      formData
    );
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to upload media file.');
    }
    return response.data;
  },
};

