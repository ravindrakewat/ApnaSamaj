import { Response } from 'express';
import {
  ApiResponse,
  PostItem,
  FeedResponseData,
  UploadMediaResponseData,
  PostLikesResponseData,
  PostViewsResponseData,
  CommentItem,
  CommentsResponseData,
  UserRole,
} from '@apnasamaj/shared-types';
import {
  createPostSchema,
  updatePostSchema,
  feedQuerySchema,
  idParamSchema,
  createCommentSchema,
  updateCommentSchema,
  commentsQuerySchema,
  commentIdParamSchema,
  reportPostSchema,
} from '@apnasamaj/validation';
import { AuthenticatedRequest } from '../../middleware/authenticate';
import {
  createPost,
  getCommunityFeed,
  getPostById,
  updatePost,
  deletePost,
  pinPost,
  unpinPost,
  reportPost,
  likePost,
  unlikePost,
  getPostLikes,
  recordPostView,
  getPostViews,
  getPostComments,
  createComment,
  updateComment,
  deleteComment,
  PostServiceError,
} from './posts.service';
import { uploadPostMedia, StorageError } from '../../services/storage.service';

export async function createPostHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    if (!userId || !userRole) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsed = createPostSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || 'Invalid post input.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const post = await createPost(userId, userRole, parsed.data, req.db);

    const response: ApiResponse<PostItem> = {
      success: true,
      message: 'Post published successfully.',
      data: post,
      timestamp: new Date().toISOString(),
    };

    res.status(201).json(response);
  } catch (err: unknown) {
    if (err instanceof PostServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Posts Controller] Create post error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to create post. Please try again.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function getFeedHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const parsed = feedQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || 'Invalid feed query parameters.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const feed = await getCommunityFeed(parsed.data, req.user?.id, req.db);

    const response: ApiResponse<FeedResponseData> = {
      success: true,
      data: feed,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof PostServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Posts Controller] Get feed error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve community feed.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function getPostHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const parsedParam = idParamSchema.safeParse(req.params);
    if (!parsedParam.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid post ID parameter.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const post = await getPostById(parsedParam.data.id, req.user?.id, req.db);

    const response: ApiResponse<PostItem> = {
      success: true,
      data: post,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof PostServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Posts Controller] Get post error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve post.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function updatePostHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    if (!userId || !userRole) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedParam = idParamSchema.safeParse(req.params);
    if (!parsedParam.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid post ID parameter.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedBody = updatePostSchema.safeParse(req.body);
    if (!parsedBody.success) {
      const issue = parsedBody.error.issues[0]?.message || 'Invalid post update data.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const updated = await updatePost(parsedParam.data.id, userId, userRole, parsedBody.data, req.db);

    const response: ApiResponse<PostItem> = {
      success: true,
      message: 'Post updated successfully.',
      data: updated,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof PostServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Posts Controller] Update post error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to update post.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function deletePostHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    if (!userId || !userRole) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedParam = idParamSchema.safeParse(req.params);
    if (!parsedParam.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid post ID parameter.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    await deletePost(
      parsedParam.data.id,
      userId,
      userRole,
      req.ip,
      req.headers['user-agent'],
      req.db
    );

    const response: ApiResponse<{ message: string }> = {
      success: true,
      message: 'Post deleted successfully.',
      data: { message: 'Post deleted successfully.' },
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof PostServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Posts Controller] Delete post error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to delete post.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function pinPostHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    if (!userId || !userRole) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedParam = idParamSchema.safeParse(req.params);
    if (!parsedParam.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid post ID parameter.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const updated = await pinPost(
      parsedParam.data.id,
      userId,
      userRole,
      req.ip,
      req.headers['user-agent'],
      req.db
    );

    const response: ApiResponse<PostItem> = {
      success: true,
      message: 'Post pinned successfully.',
      data: updated,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof PostServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Posts Controller] Pin post error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to pin post.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function unpinPostHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    if (!userId || !userRole) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedParam = idParamSchema.safeParse(req.params);
    if (!parsedParam.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid post ID parameter.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const updated = await unpinPost(
      parsedParam.data.id,
      userId,
      userRole,
      req.ip,
      req.headers['user-agent'],
      req.db
    );

    const response: ApiResponse<PostItem> = {
      success: true,
      message: 'Post unpinned successfully.',
      data: updated,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof PostServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Posts Controller] Unpin post error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to unpin post.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function reportPostHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedParam = idParamSchema.safeParse(req.params);
    if (!parsedParam.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid post ID parameter.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedBody = reportPostSchema.safeParse(req.body);
    if (!parsedBody.success) {
      const issue = parsedBody.error.issues[0]?.message || 'Invalid report input.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const result = await reportPost(
      parsedParam.data.id,
      userId,
      parsedBody.data,
      req.ip,
      req.headers['user-agent'],
      req.db
    );

    const response: ApiResponse<{ message: string }> = {
      success: true,
      message: result.message,
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof PostServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Posts Controller] Report post error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to submit report. Please try again later.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

// --------------------------------------------------------
// LIKES CONTROLLERS
// --------------------------------------------------------

export async function likePostHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedParam = idParamSchema.safeParse(req.params);
    if (!parsedParam.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid post ID parameter.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const result = await likePost(parsedParam.data.id, userId, req.db);

    const response: ApiResponse<PostLikesResponseData> = {
      success: true,
      message: 'Post liked successfully.',
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof PostServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Posts Controller] Like post error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to like post.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function unlikePostHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedParam = idParamSchema.safeParse(req.params);
    if (!parsedParam.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid post ID parameter.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const result = await unlikePost(parsedParam.data.id, userId, req.db);

    const response: ApiResponse<PostLikesResponseData> = {
      success: true,
      message: 'Post unliked successfully.',
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof PostServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Posts Controller] Unlike post error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to unlike post.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function getPostLikesHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const parsedParam = idParamSchema.safeParse(req.params);
    if (!parsedParam.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid post ID parameter.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const result = await getPostLikes(parsedParam.data.id, req.user?.id, req.db);

    const response: ApiResponse<PostLikesResponseData> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof PostServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Posts Controller] Get post likes error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve post likes.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

// --------------------------------------------------------
// VIEWS CONTROLLERS
// --------------------------------------------------------

export async function recordPostViewHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedParam = idParamSchema.safeParse(req.params);
    if (!parsedParam.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid post ID parameter.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const result = await recordPostView(parsedParam.data.id, userId, req.db);

    const response: ApiResponse<PostViewsResponseData> = {
      success: true,
      message: 'Post view recorded successfully.',
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof PostServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Posts Controller] Record post view error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to record post view.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function getPostViewsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedParam = idParamSchema.safeParse(req.params);
    if (!parsedParam.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid post ID parameter.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const result = await getPostViews(parsedParam.data.id, userId, req.db);

    const response: ApiResponse<PostViewsResponseData> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof PostServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Posts Controller] Get post views error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve post views.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

// --------------------------------------------------------
// COMMENTS CONTROLLERS
// --------------------------------------------------------

export async function getCommentsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const parsedParam = idParamSchema.safeParse(req.params);
    if (!parsedParam.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid post ID parameter.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedQuery = commentsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      const issue = parsedQuery.error.issues[0]?.message || 'Invalid comment query parameters.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const comments = await getPostComments(
      parsedParam.data.id,
      parsedQuery.data.page,
      parsedQuery.data.limit,
      req.user?.id,
      req.db
    );

    const response: ApiResponse<CommentsResponseData> = {
      success: true,
      data: comments,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof PostServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Posts Controller] Get comments error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve comments.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function createCommentHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedParam = idParamSchema.safeParse(req.params);
    if (!parsedParam.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid post ID parameter.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedBody = createCommentSchema.safeParse(req.body);
    if (!parsedBody.success) {
      const issue = parsedBody.error.issues[0]?.message || 'Invalid comment content.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const comment = await createComment(
      parsedParam.data.id,
      userId,
      parsedBody.data.content,
      req.db
    );

    const response: ApiResponse<CommentItem> = {
      success: true,
      message: 'Comment posted successfully.',
      data: comment,
      timestamp: new Date().toISOString(),
    };

    res.status(201).json(response);
  } catch (err: unknown) {
    if (err instanceof PostServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Posts Controller] Create comment error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to post comment.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function updateCommentHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedParam = commentIdParamSchema.safeParse(req.params);
    if (!parsedParam.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid post or comment ID parameter.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedBody = updateCommentSchema.safeParse(req.body);
    if (!parsedBody.success) {
      const issue = parsedBody.error.issues[0]?.message || 'Invalid comment content.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const comment = await updateComment(
      parsedParam.data.id,
      parsedParam.data.commentId,
      userId,
      parsedBody.data.content,
      req.db
    );

    const response: ApiResponse<CommentItem> = {
      success: true,
      message: 'Comment updated successfully.',
      data: comment,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof PostServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Posts Controller] Update comment error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to update comment.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function deleteCommentHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    if (!userId || !userRole) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedParam = commentIdParamSchema.safeParse(req.params);
    if (!parsedParam.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid post or comment ID parameter.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    await deleteComment(
      parsedParam.data.id,
      parsedParam.data.commentId,
      userId,
      userRole,
      req.ip,
      req.headers['user-agent'],
      req.db
    );

    const response: ApiResponse<{ message: string }> = {
      success: true,
      message: 'Comment deleted successfully.',
      data: { message: 'Comment deleted successfully.' },
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof PostServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Posts Controller] Delete comment error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to delete comment.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

// --------------------------------------------------------
// MEDIA UPLOAD CONTROLLER
// --------------------------------------------------------

export async function uploadMediaHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    if (!req.file) {
      const response: ApiResponse = {
        success: false,
        error: 'No image file uploaded.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const uploadResult = await uploadPostMedia(
      userId,
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    const response: ApiResponse<UploadMediaResponseData> = {
      success: true,
      message: 'Image uploaded successfully.',
      data: uploadResult,
      timestamp: new Date().toISOString(),
    };

    res.status(201).json(response);
  } catch (err: unknown) {
    if (err instanceof StorageError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Posts Controller] Upload media error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to upload image.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}
