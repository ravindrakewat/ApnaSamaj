/**
 * Multi-Community Core Types & Tenant Context Definitions
 * Defines the shared contracts for communities, memberships, and tenant scoping.
 */

export type CommunityStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export type CommunityMemberRole = 'COMMUNITY_ADMIN' | 'MODERATOR' | 'MEMBER';

export type CommunityMembershipStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export interface CommunityItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  primaryColor: string | null;
  status: CommunityStatus;
  createdAt: string;
  updatedAt: string;
  _count?: {
    members?: number;
    posts?: number;
    groups?: number;
  };
}

export interface CommunityPublicConfig {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  primaryColor: string | null;
  status: CommunityStatus;
}

export interface CommunityMemberItem {
  id: string;
  communityId: string;
  userId: string;
  role: CommunityMemberRole;
  status: CommunityMembershipStatus;
  joinedAt: string;
  updatedAt: string;
  user?: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
    city: string | null;
    state: string | null;
  };
}

/**
 * Server-verified tenant context resolved from trusted hostname or token.
 * Never constructed directly from an unverified client parameter.
 */
export interface TenantContext {
  communityId: string;
  communitySlug: string;
  communityName: string;
  memberRole?: CommunityMemberRole;
  membershipStatus?: CommunityMembershipStatus;
  isSuperAdmin: boolean;
}

export interface ResolveCommunityResponse {
  community: CommunityPublicConfig | null;
  isResolved: boolean;
  message?: string;
}
