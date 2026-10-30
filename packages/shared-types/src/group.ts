export enum GroupPrivacy {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE',
}

export enum GroupMemberRole {
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
  MEMBER = 'MEMBER',
}

export interface GroupCreatorSummary {
  id: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface GroupListItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  coverUrl: string | null;
  privacy: GroupPrivacy;
  membersCount: number;
  postsCount: number;
  isMember: boolean;
  myRole: GroupMemberRole | null;
  createdAt: string;
}

export interface GroupMemberUserSummary {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  city: string | null;
  state: string | null;
}

export interface GroupMemberItem {
  id: string;
  groupId: string;
  userId: string;
  role: GroupMemberRole;
  joinedAt: string;
  user: GroupMemberUserSummary;
}

export interface GroupDetails {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  coverUrl: string | null;
  privacy: GroupPrivacy;
  createdById: string;
  creator: GroupCreatorSummary;
  membersCount: number;
  postsCount: number;
  isMember: boolean;
  myRole: GroupMemberRole | null;
  createdAt: string;
  updatedAt: string;
  members?: GroupMemberItem[];
}

export interface ListGroupsResponseData {
  groups: GroupListItem[];
  pagination: {
    page: number;
    limit: number;
    totalGroups: number;
    totalPages: number;
  };
}

export interface CreateGroupInput {
  name: string;
  description?: string;
  privacy?: GroupPrivacy | 'PUBLIC' | 'PRIVATE';
  coverUrl?: string;
}

export interface UpdateGroupInput {
  name?: string;
  description?: string | null;
  privacy?: GroupPrivacy | 'PUBLIC' | 'PRIVATE';
  coverUrl?: string | null;
}

export interface UpdateGroupMemberRoleInput {
  role: GroupMemberRole | 'ADMIN' | 'MODERATOR' | 'MEMBER';
}

export interface AddGroupMemberInput {
  userId: string;
}

export interface ListGroupMembersResponseData {
  members: GroupMemberItem[];
  pagination: {
    page: number;
    limit: number;
    totalMembers: number;
    totalPages: number;
  };
}

export interface GroupMemberActionResult {
  success: boolean;
  message: string;
  member?: GroupMemberItem;
}
