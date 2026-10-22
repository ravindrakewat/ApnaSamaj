export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  COMMUNITY_ADMIN = 'COMMUNITY_ADMIN',
  MODERATOR = 'MODERATOR',
  MEMBER = 'MEMBER',
}

export enum UserStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export interface UserSummary {
  id: string;
  phone: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

export interface SafeUserProfile {
  id?: string;
  fullName: string;
  gender?: string | null;
  dateOfBirth?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  city?: string | null;
  state?: string | null;
  subCaste?: string | null;
  gotra?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminUserListItem {
  id: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
  isPhoneVerified: boolean;
  createdAt: string;
  updatedAt: string;
  profile: SafeUserProfile | null;
}

export type CurrentMemberProfile = AdminUserListItem;

export interface PaginationMeta {
  page: number;
  limit: number;
  totalUsers: number;
  totalPages: number;
}

export interface ListUsersResponseData {
  users: AdminUserListItem[];
  pagination: PaginationMeta;
}

export interface AdminUserDetails extends AdminUserListItem {
  _count?: {
    posts?: number;
    groupMemberships?: number;
    comments?: number;
  };
}

export interface UpdateUserStatusRequest {
  status: 'ACTIVE' | 'SUSPENDED';
  reason?: string;
}

export interface AdminMetrics {
  totalUsers: number;
  pendingUsers: number;
  activeUsers: number;
  totalPosts: number;
}

export interface PublicDirectoryMember {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  gender: string | null;
  bio: string | null;
  city: string | null;
  state: string | null;
  subCaste: string | null;
  gotra: string | null;
  joinedAt: string;
}

export interface PublicMemberProfile {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  gender: string | null;
  bio: string | null;
  city: string | null;
  state: string | null;
  subCaste: string | null;
  gotra: string | null;
  role: UserRole;
  joinedAt: string;
}

export interface DirectoryResponseData {
  members: PublicDirectoryMember[];
  pagination: {
    page: number;
    limit: number;
    totalMembers: number;
    totalPages: number;
  };
}

