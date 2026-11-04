import { Router } from 'express';
import { authenticateToken } from '../../middleware/authenticate';
import { requireActiveUser } from '../../middleware/authorize';
import { requireTenantContext } from '../../middleware/tenant.middleware';
import {
  getDirectInboxHandler,
  createDirectConversationHandler,
  getDirectMessagesHandler,
  sendDirectMessageHandler,
  markDirectConversationReadHandler,
} from './direct-chat.controller';

export const chatRouter = Router();

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

// POST /api/v1/chat/conversations/:id/read - Mark conversation as read
chatRouter.post('/conversations/:id/read', markDirectConversationReadHandler);

