import { Router } from 'express';
import { authenticateToken } from '../../middleware/authenticate';
import { requireActiveUser } from '../../middleware/authorize';
import { singleImageUpload } from '../../middleware/upload.middleware';
import {
  listGroupsHandler,
  getGroupBySlugHandler,
  createGroupHandler,
  joinGroupHandler,
  leaveGroupHandler,
  getGroupPostsHandler,
  updateGroupHandler,
  uploadGroupCoverHandler,
  updateGroupMemberRoleHandler,
  removeGroupMemberHandler,
} from './groups.controller';
import { getGroupMessagesHandler, sendGroupMessageHandler } from '../chat/chat.controller';

export const groupsRouter = Router();

// All group interactions require valid authenticated ACTIVE member status
groupsRouter.use(authenticateToken, requireActiveUser);

// GET /api/v1/groups - List community groups with search & pagination
groupsRouter.get('/', listGroupsHandler);

// POST /api/v1/groups - Create a new community group
groupsRouter.post('/', createGroupHandler);

// GET /api/v1/groups/:slug - Retrieve group details & roster
groupsRouter.get('/:slug', getGroupBySlugHandler);

// GET /api/v1/groups/:slug/posts - Retrieve group-specific discussions
groupsRouter.get('/:slug/posts', getGroupPostsHandler);

// POST /api/v1/groups/:id/join - Join a public group
groupsRouter.post('/:id/join', joinGroupHandler);

// POST /api/v1/groups/:id/leave - Leave a group
groupsRouter.post('/:id/leave', leaveGroupHandler);

// PATCH /api/v1/groups/:id - Update group settings (name, description, privacy, coverUrl)
groupsRouter.patch('/:id', updateGroupHandler);

// POST /api/v1/groups/:id/cover - Upload and update group cover image
groupsRouter.post('/:id/cover', singleImageUpload, uploadGroupCoverHandler);

// PATCH /api/v1/groups/:id/members/:userId - Manage member role (ADMIN, MODERATOR, MEMBER)
groupsRouter.patch('/:id/members/:userId', updateGroupMemberRoleHandler);

// DELETE /api/v1/groups/:id/members/:userId - Remove member from group
groupsRouter.delete('/:id/members/:userId', removeGroupMemberHandler);

// GET /api/v1/groups/:id/messages - Retrieve group chat history with cursor pagination
groupsRouter.get('/:id/messages', getGroupMessagesHandler);

// POST /api/v1/groups/:id/messages - Send a chat message (HTTP fallback)
groupsRouter.post('/:id/messages', sendGroupMessageHandler);

export default groupsRouter;

