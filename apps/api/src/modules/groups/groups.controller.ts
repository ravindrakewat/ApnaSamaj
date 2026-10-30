import { Response } from 'express';
import {
  ApiResponse,
  ListGroupsResponseData,
  GroupDetails,
  FeedResponseData,
  GroupMemberActionResult,
  GroupMemberRole,
  ListGroupMembersResponseData,
} from '@apnasamaj/shared-types';
import {
  createGroupSchema,
  listGroupsQuerySchema,
  updateGroupSchema,
  updateMemberRoleSchema,
  groupIdSchema,
  groupUserIdSchema,
  addGroupMemberSchema,
  listGroupMembersQuerySchema,
} from '@apnasamaj/validation';
import { AuthenticatedRequest } from '../../middleware/authenticate';
import {
  listGroups,
  getGroupBySlug,
  createGroup,
  joinGroup,
  leaveGroup,
  getGroupPosts,
  updateGroup,
  uploadGroupCover,
  updateGroupMemberRole,
  removeGroupMember,
  deleteGroup,
  addGroupMember,
  listGroupMembers,
  GroupServiceError,
} from './groups.service';

export async function listGroupsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedQuery = listGroupsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      const issue = parsedQuery.error.issues[0]?.message || 'Invalid query parameters.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const data = await listGroups(parsedQuery.data, currentUserId, req.db);
    const response: ApiResponse<ListGroupsResponseData> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    console.error('[Groups Controller] List groups error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve groups.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function getGroupBySlugHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const { slug } = req.params;
    if (!slug) {
      const response: ApiResponse = {
        success: false,
        error: 'Group slug is required.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const data = await getGroupBySlug(slug, currentUserId, req.db);
    const response: ApiResponse<GroupDetails> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof GroupServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Groups Controller] Get group error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve group.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function createGroupHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsed = createGroupSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || 'Invalid group creation data.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const data = await createGroup(currentUserId, parsed.data, req.db);
    const response: ApiResponse<GroupDetails> = {
      success: true,
      message: 'Group created successfully.',
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(201).json(response);
  } catch (err: unknown) {
    if (err instanceof GroupServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Groups Controller] Create group error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to create group.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function joinGroupHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedGroupId = groupIdSchema.safeParse(req.params.id);
    if (!parsedGroupId.success) {
      const issue = parsedGroupId.error.issues[0]?.message || 'Invalid group ID.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const data = await joinGroup(parsedGroupId.data, currentUserId, req.db);
    const response: ApiResponse = {
      success: true,
      message: data.message,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof GroupServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Groups Controller] Join group error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to join group.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function leaveGroupHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedGroupId = groupIdSchema.safeParse(req.params.id);
    if (!parsedGroupId.success) {
      const issue = parsedGroupId.error.issues[0]?.message || 'Invalid group ID.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const data = await leaveGroup(parsedGroupId.data, currentUserId, req.db);
    const response: ApiResponse = {
      success: true,
      message: data.message,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof GroupServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Groups Controller] Leave group error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to leave group.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function getGroupPostsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const { slug } = req.params;
    if (!slug) {
      const response: ApiResponse = {
        success: false,
        error: 'Group slug is required.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));

    const data = await getGroupPosts(slug, currentUserId, page, limit, req.db);
    const response: ApiResponse<FeedResponseData> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof GroupServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Groups Controller] Get group posts error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve group discussions.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function updateGroupHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const currentUserId = req.user?.id;
    const currentUserRole = req.user?.role;
    if (!currentUserId || !currentUserRole) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedGroupId = groupIdSchema.safeParse(req.params.id);
    if (!parsedGroupId.success) {
      const issue = parsedGroupId.error.issues[0]?.message || 'Invalid group ID.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsed = updateGroupSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || 'Invalid group update data.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const data = await updateGroup(
      parsedGroupId.data,
      currentUserId,
      currentUserRole,
      parsed.data,
      ipAddress,
      userAgent,
      req.db
    );
    const response: ApiResponse<GroupDetails> = {
      success: true,
      message: 'Group settings updated successfully.',
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof GroupServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Groups Controller] Update group error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to update group settings.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function uploadGroupCoverHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const currentUserId = req.user?.id;
    const currentUserRole = req.user?.role;
    if (!currentUserId || !currentUserRole) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedGroupId = groupIdSchema.safeParse(req.params.id);
    if (!parsedGroupId.success) {
      const issue = parsedGroupId.error.issues[0]?.message || 'Invalid group ID.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    if (!req.file) {
      const response: ApiResponse = {
        success: false,
        error: 'No cover image file uploaded.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await uploadGroupCover(
      parsedGroupId.data,
      currentUserId,
      currentUserRole,
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
      ipAddress,
      userAgent,
      req.db
    );

    const response: ApiResponse<{ coverUrl: string }> = {
      success: true,
      message: 'Cover image uploaded successfully.',
      data: { coverUrl: result.coverUrl },
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof GroupServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Groups Controller] Upload cover error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to upload cover image.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function deleteGroupHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const currentUserId = req.user?.id;
    const currentUserRole = req.user?.role;
    if (!currentUserId || !currentUserRole) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedGroupId = groupIdSchema.safeParse(req.params.id);
    if (!parsedGroupId.success) {
      const issue = parsedGroupId.error.issues[0]?.message || 'Invalid group ID.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await deleteGroup(
      parsedGroupId.data,
      currentUserId,
      currentUserRole,
      ipAddress,
      userAgent,
      req.db
    );

    const response: ApiResponse<{ message: string }> = {
      success: true,
      message: result.message,
      data: { message: result.message },
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof GroupServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Groups Controller] Delete group error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to delete group.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function addGroupMemberHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const currentUserId = req.user?.id;
    const currentUserRole = req.user?.role;
    if (!currentUserId || !currentUserRole) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedGroupId = groupIdSchema.safeParse(req.params.id);
    if (!parsedGroupId.success) {
      const issue = parsedGroupId.error.issues[0]?.message || 'Invalid group ID.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedBody = addGroupMemberSchema.safeParse(req.body);
    if (!parsedBody.success) {
      const issue = parsedBody.error.issues[0]?.message || 'Invalid member data.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const data = await addGroupMember(
      parsedGroupId.data,
      parsedBody.data.userId,
      currentUserId,
      currentUserRole,
      ipAddress,
      userAgent,
      req.db
    );

    const response: ApiResponse<typeof data> = {
      success: true,
      message: 'Member added to group successfully.',
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(201).json(response);
  } catch (err: unknown) {
    if (err instanceof GroupServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Groups Controller] Add group member error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to add group member.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function listGroupMembersHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const currentUserId = req.user?.id;
    const currentUserRole = req.user?.role;
    if (!currentUserId || !currentUserRole) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedGroupId = groupIdSchema.safeParse(req.params.id);
    if (!parsedGroupId.success) {
      const issue = parsedGroupId.error.issues[0]?.message || 'Invalid group ID.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedQuery = listGroupMembersQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      const issue = parsedQuery.error.issues[0]?.message || 'Invalid query parameters.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const data = await listGroupMembers(
      parsedGroupId.data,
      currentUserId,
      currentUserRole,
      parsedQuery.data,
      req.db
    );

    const response: ApiResponse<ListGroupMembersResponseData> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof GroupServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Groups Controller] List group members error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve group members.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function updateGroupMemberRoleHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const currentUserId = req.user?.id;
    const currentUserRole = req.user?.role;
    if (!currentUserId || !currentUserRole) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedGroupId = groupIdSchema.safeParse(req.params.id);
    if (!parsedGroupId.success) {
      const issue = parsedGroupId.error.issues[0]?.message || 'Invalid group ID.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedUserId = groupUserIdSchema.safeParse(req.params.userId);
    if (!parsedUserId.success) {
      const issue = parsedUserId.error.issues[0]?.message || 'Invalid member user ID.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsed = updateMemberRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || 'Invalid role specified.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const data = await updateGroupMemberRole(
      parsedGroupId.data,
      parsedUserId.data,
      parsed.data.role as GroupMemberRole,
      currentUserId,
      currentUserRole,
      ipAddress,
      userAgent,
      req.db
    );

    const response: ApiResponse<GroupMemberActionResult> = {
      success: true,
      message: data.message,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof GroupServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Groups Controller] Update member role error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to update member role.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function removeGroupMemberHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const currentUserId = req.user?.id;
    const currentUserRole = req.user?.role;
    if (!currentUserId || !currentUserRole) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedGroupId = groupIdSchema.safeParse(req.params.id);
    if (!parsedGroupId.success) {
      const issue = parsedGroupId.error.issues[0]?.message || 'Invalid group ID.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedUserId = groupUserIdSchema.safeParse(req.params.userId);
    if (!parsedUserId.success) {
      const issue = parsedUserId.error.issues[0]?.message || 'Invalid member user ID.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const data = await removeGroupMember(
      parsedGroupId.data,
      parsedUserId.data,
      currentUserId,
      currentUserRole,
      ipAddress,
      userAgent,
      req.db
    );

    const response: ApiResponse<{ success: boolean; message: string }> = {
      success: true,
      message: data.message,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof GroupServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Groups Controller] Remove member error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to remove member.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}
