import { Router } from 'express';
import { authenticateToken } from '../../middleware/authenticate';
import { requireActiveUser } from '../../middleware/authorize';
import { requireTenantContext } from '../../middleware/tenant.middleware';
import { singleImageUpload, singleChatAttachmentUpload } from '../../middleware/upload.middleware';
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
  deleteGroupHandler,
  addGroupMemberHandler,
  listGroupMembersHandler,
} from './groups.controller';
import {
  getGroupMessagesHandler,
  sendGroupMessageHandler,
  uploadGroupAttachmentHandler,
  toggleGroupMessageReactionHandler,
  removeGroupMessageReactionHandler,
  searchGroupMessagesHandler,
  getGroupMediaGalleryHandler,
  getGroupMessageContextHandler,
  deleteGroupMessageHandler,
} from '../chat/chat.controller';

export const groupsRouter = Router();

// All group interactions require valid authenticated ACTIVE member status and tenant context
groupsRouter.use(authenticateToken, requireActiveUser, requireTenantContext);

// GET /api/v1/groups - List community groups with search & pagination
groupsRouter.get('/', listGroupsHandler);

// POST /api/v1/groups - Create a new community group
groupsRouter.post('/', createGroupHandler);

// GET /api/v1/groups/:id/members - Retrieve paginated group member roster
groupsRouter.get('/:id/members', listGroupMembersHandler);

// POST /api/v1/groups/:id/members - Direct member onboarding by admin
groupsRouter.post('/:id/members', addGroupMemberHandler);

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

// DELETE /api/v1/groups/:id - Delete a group
groupsRouter.delete('/:id', deleteGroupHandler);

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

// DELETE /api/v1/groups/:id/messages/:messageId - Delete a group message (ME or EVERYONE)
groupsRouter.delete('/:id/messages/:messageId', deleteGroupMessageHandler);

// POST /api/v1/groups/:id/messages/:messageId/reactions - Toggle emoji reaction on group message
groupsRouter.post('/:id/messages/:messageId/reactions', toggleGroupMessageReactionHandler);

// DELETE /api/v1/groups/:id/messages/:messageId/reactions - Remove emoji reaction on group message
groupsRouter.delete('/:id/messages/:messageId/reactions', removeGroupMessageReactionHandler);

// POST /api/v1/groups/:id/attachments - Upload media attachment for group chat
groupsRouter.post('/:id/attachments', singleChatAttachmentUpload, uploadGroupAttachmentHandler);

// GET /api/v1/groups/:id/chat/search & /api/v1/groups/:id/messages/search - Search group messages
groupsRouter.get('/:id/chat/search', searchGroupMessagesHandler);
groupsRouter.get('/:id/messages/search', searchGroupMessagesHandler);

// GET /api/v1/groups/:id/chat/media & /api/v1/groups/:id/messages/media - Retrieve group media gallery
groupsRouter.get('/:id/chat/media', getGroupMediaGalleryHandler);
groupsRouter.get('/:id/messages/media', getGroupMediaGalleryHandler);

// GET /api/v1/groups/:id/chat/messages/:messageId/context & /api/v1/groups/:id/messages/:messageId/context - Message context for jump
groupsRouter.get('/:id/chat/messages/:messageId/context', getGroupMessageContextHandler);
groupsRouter.get('/:id/messages/:messageId/context', getGroupMessageContextHandler);

export default groupsRouter;
