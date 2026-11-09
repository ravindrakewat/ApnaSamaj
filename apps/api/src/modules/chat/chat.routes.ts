import { Router } from 'express';
import { authenticateToken } from '../../middleware/authenticate';
import { requireActiveUser } from '../../middleware/authorize';
import { requireTenantContext } from '../../middleware/tenant.middleware';
import { singleChatAttachmentUpload } from '../../middleware/upload.middleware';
import { serveLocalChatAttachmentHandler } from './chat.controller';
import {
  getDirectInboxHandler,
  createDirectConversationHandler,
  getDirectMessagesHandler,
  sendDirectMessageHandler,
  markDirectConversationReadHandler,
  uploadDirectAttachmentHandler,
  getChatAttachmentUrlHandler,
  toggleDirectMessageReactionHandler,
  removeDirectMessageReactionHandler,
  searchDirectMessagesHandler,
  getDirectMediaGalleryHandler,
  getDirectMessageContextHandler,
} from './direct-chat.controller';

export const chatRouter = Router();

// Public local attachment streaming endpoint (serves media without token header so <img> tags load cleanly)
chatRouter.get('/attachments/raw/*', serveLocalChatAttachmentHandler);

// Direct messaging routes strictly require authenticated ACTIVE member context and tenant isolation
chatRouter.use(authenticateToken, requireActiveUser, requireTenantContext);

// GET /api/v1/chat/inbox - Retrieve user's personal direct chat inbox
chatRouter.get('/inbox', getDirectInboxHandler);

// POST /api/v1/chat/direct - Start or fetch an existing direct conversation with a member
chatRouter.post('/direct', createDirectConversationHandler);

// GET /api/v1/chat/conversations/:id/messages - Paginated direct message history
chatRouter.get('/conversations/:id/messages', getDirectMessagesHandler);

// POST /api/v1/chat/conversations/:id/messages - Send a direct message
chatRouter.post('/conversations/:id/messages', sendDirectMessageHandler);

// POST /api/v1/chat/conversations/:id/messages/:messageId/reactions - Toggle emoji reaction on direct message
chatRouter.post('/conversations/:id/messages/:messageId/reactions', toggleDirectMessageReactionHandler);

// DELETE /api/v1/chat/conversations/:id/messages/:messageId/reactions - Remove emoji reaction on direct message
chatRouter.delete('/conversations/:id/messages/:messageId/reactions', removeDirectMessageReactionHandler);

// POST /api/v1/chat/conversations/:id/attachments - Upload media attachment
chatRouter.post(
  '/conversations/:id/attachments',
  singleChatAttachmentUpload,
  uploadDirectAttachmentHandler
);

// GET /api/v1/chat/attachments/:id/url - Get authorized temporary signed URL for attachment
chatRouter.get('/attachments/:id/url', getChatAttachmentUrlHandler);

// POST /api/v1/chat/conversations/:id/read - Mark conversation as read
chatRouter.post('/conversations/:id/read', markDirectConversationReadHandler);

// GET /api/v1/chat/conversations/:id/search & /messages/search - Search direct messages
chatRouter.get('/conversations/:id/search', searchDirectMessagesHandler);
chatRouter.get('/conversations/:id/messages/search', searchDirectMessagesHandler);

// GET /api/v1/chat/conversations/:id/media & /messages/media - Retrieve direct media gallery
chatRouter.get('/conversations/:id/media', getDirectMediaGalleryHandler);
chatRouter.get('/conversations/:id/messages/media', getDirectMediaGalleryHandler);

// GET /api/v1/chat/conversations/:id/messages/:messageId/context - Retrieve direct message context
chatRouter.get('/conversations/:id/messages/:messageId/context', getDirectMessageContextHandler);
