import { Router } from 'express';
import { authenticateToken } from '../../middleware/authenticate';
import { requireActiveUser } from '../../middleware/authorize';
import { requireTenantContext } from '../../middleware/tenant.middleware';
import {
  createPostRateLimiter,
  createCommentRateLimiter,
  reportPostRateLimiter,
} from '../../middleware/rate-limiter';
import { singleImageUpload } from '../../middleware/upload.middleware';
import {
  createPostHandler,
  uploadMediaHandler,
  getFeedHandler,
  getPostHandler,
  updatePostHandler,
  deletePostHandler,
  pinPostHandler,
  unpinPostHandler,
  reportPostHandler,
  likePostHandler,
  unlikePostHandler,
  getPostLikesHandler,
  recordPostViewHandler,
  getPostViewsHandler,
  getCommentsHandler,
  createCommentHandler,
  updateCommentHandler,
  deleteCommentHandler,
} from './posts.controller';

export const postsRouter = Router();

// All community post endpoints require authenticated ACTIVE user status and valid tenant context
postsRouter.use(authenticateToken, requireActiveUser, requireTenantContext);

// POST /api/v1/posts/media/upload - Upload an image to Supabase Storage
postsRouter.post('/media/upload', singleImageUpload, uploadMediaHandler);

// GET /api/v1/posts - List community feed with pagination & filters
postsRouter.get('/', getFeedHandler);

// POST /api/v1/posts - Create a new post with optional media attachments
postsRouter.post('/', createPostRateLimiter, createPostHandler);

// GET /api/v1/posts/:id - Retrieve a single post
postsRouter.get('/:id', getPostHandler);

// PATCH /api/v1/posts/:id - Edit one's own post
postsRouter.patch('/:id', updatePostHandler);

// DELETE /api/v1/posts/:id - Delete one's own post or administrative moderation
postsRouter.delete('/:id', deletePostHandler);

// POST /api/v1/posts/:id/pin - Pin a post (Admins and Moderators only)
postsRouter.post('/:id/pin', pinPostHandler);

// DELETE /api/v1/posts/:id/pin - Unpin a post (Admins and Moderators only)
postsRouter.delete('/:id/pin', unpinPostHandler);

// POST /api/v1/posts/:id/report - Report a post for community guidelines violation
postsRouter.post('/:id/report', reportPostRateLimiter, reportPostHandler);

// --------------------------------------------------------
// LIKES ROUTES
// --------------------------------------------------------

// POST /api/v1/posts/:id/like - Like a post
postsRouter.post('/:id/like', likePostHandler);

// DELETE /api/v1/posts/:id/like - Unlike a post
postsRouter.delete('/:id/like', unlikePostHandler);

// GET /api/v1/posts/:id/likes - Get likes stats for a post
postsRouter.get('/:id/likes', getPostLikesHandler);

// --------------------------------------------------------
// VIEWS ROUTES
// --------------------------------------------------------

// POST /api/v1/posts/:id/view - Record an authenticated view
postsRouter.post('/:id/view', recordPostViewHandler);

// GET /api/v1/posts/:id/views - Get aggregate view analytics
postsRouter.get('/:id/views', getPostViewsHandler);

// --------------------------------------------------------
// COMMENTS ROUTES
// --------------------------------------------------------

// GET /api/v1/posts/:id/comments - List paginated comments
postsRouter.get('/:id/comments', getCommentsHandler);

// POST /api/v1/posts/:id/comments - Add a comment (rate-limited)
postsRouter.post('/:id/comments', createCommentRateLimiter, createCommentHandler);

// PATCH /api/v1/posts/:id/comments/:commentId - Edit one's own comment
postsRouter.patch('/:id/comments/:commentId', updateCommentHandler);

// DELETE /api/v1/posts/:id/comments/:commentId - Delete one's own comment or admin moderation
postsRouter.delete('/:id/comments/:commentId', deleteCommentHandler);

export default postsRouter;
