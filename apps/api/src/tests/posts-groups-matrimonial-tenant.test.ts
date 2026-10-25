import assert from 'node:assert';
import { PrismaClient } from '@apnasamaj/database';
import {
  getCommunityFeed,
  getPostById,
  createPost,
  likePost,
  getPostLikes,
  recordPostView,
  getPostViews,
  getPostComments,
  createComment,
  PostServiceError,
} from '../modules/posts/posts.service';
import {
  listGroups,
  getGroupBySlug,
  joinGroup,
  getGroupPosts,
  createGroup,
  GroupServiceError,
  ForbiddenGroupActionError,
} from '../modules/groups/groups.service';
import {
  getMyMatrimonialProfile,
  listDiscoveryProfiles,
  getDiscoveryProfileById,
  sendInterest,
  respondToInterest,
  MatrimonialServiceError,
  MatrimonialNotFoundError,
} from '../modules/matrimonial/matrimonial.service';
import { UserRole } from '@apnasamaj/shared-types';

console.log('================================================================');
console.log('  Apna Samaj — Phase 15C.3 Posts, Groups & Matrimonial Isolation ');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;

function assertTest(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failedTests++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Mock Clients Generator
// ---------------------------------------------------------------------------

function createMockTenantClient(tenantName: string, state: {
  posts?: any[];
  postLikes?: any[];
  postViews?: any[];
  comments?: any[];
  groups?: any[];
  groupMembers?: any[];
  matrimonialProfiles?: any[];
  matrimonialInterests?: any[];
  users?: any[];
}) {
  const posts = state.posts ? [...state.posts] : [];
  const postLikes = state.postLikes ? [...state.postLikes] : [];
  const postViews = state.postViews ? [...state.postViews] : [];
  const comments = state.comments ? [...state.comments] : [];
  const groups = state.groups ? [...state.groups] : [];
  const groupMembers = state.groupMembers ? [...state.groupMembers] : [];
  const matrimonialProfiles = state.matrimonialProfiles ? [...state.matrimonialProfiles] : [];
  const matrimonialInterests = state.matrimonialInterests ? [...state.matrimonialInterests] : [];
  const users = state.users ? [...state.users] : [];

  let queryLog: string[] = [];

  const client: any = {
    _tenantName: tenantName,
    get queryLog() {
      return queryLog;
    },
    resetLog() {
      queryLog = [];
    },
    $transaction: async (fn: any) => {
      queryLog.push('$transaction');
      if (typeof fn === 'function') {
        return fn(client);
      }
      return Promise.all(fn);
    },
    $queryRaw: async (query: any) => {
      queryLog.push('$queryRaw');
      return [{ id: 'mock-lock-id' }];
    },
    post: {
      findMany: async (args: any) => {
        queryLog.push(`post.findMany(${tenantName})`);
        return posts;
      },
      count: async (args: any) => {
        queryLog.push(`post.count(${tenantName})`);
        return posts.length;
      },
      findUnique: async (args: any) => {
        queryLog.push(`post.findUnique(${tenantName})`);
        const found = posts.find((p) => p.id === args.where.id);
        return found || null;
      },
      create: async (args: any) => {
        queryLog.push(`post.create(${tenantName})`);
        const newPost = {
          id: `post-${Date.now()}`,
          authorId: args.data.authorId,
          content: args.data.content,
          type: args.data.type || 'TEXT',
          isPinned: false,
          groupId: args.data.groupId || null,
          createdAt: new Date(),
          updatedAt: new Date(),
          media: [],
          _count: { likes: 0, comments: 0 },
          likes: [],
          author: {
            id: args.data.authorId,
            role: 'MEMBER',
            profile: { fullName: 'Author Name', avatarUrl: null, city: null, state: null },
          },
        };
        posts.push(newPost);
        return newPost;
      },
    },
    postLike: {
      findUnique: async (args: any) => {
        queryLog.push(`postLike.findUnique(${tenantName})`);
        const key = args.where.postId_userId;
        return postLikes.find((l) => l.postId === key.postId && l.userId === key.userId) || null;
      },
      upsert: async (args: any) => {
        queryLog.push(`postLike.upsert(${tenantName})`);
        const key = args.where.postId_userId;
        let found = postLikes.find((l) => l.postId === key.postId && l.userId === key.userId);
        if (!found) {
          found = { postId: key.postId, userId: key.userId };
          postLikes.push(found);
        }
        return found;
      },
      count: async (args: any) => {
        queryLog.push(`postLike.count(${tenantName})`);
        return postLikes.filter((l) => l.postId === args.where.postId).length;
      },
      deleteMany: async (args: any) => {
        queryLog.push(`postLike.deleteMany(${tenantName})`);
        const idx = postLikes.findIndex(
          (l) => l.postId === args.where.postId && l.userId === args.where.userId
        );
        if (idx !== -1) postLikes.splice(idx, 1);
        return { count: 1 };
      },
    },
    postView: {
      upsert: async (args: any) => {
        queryLog.push(`postView.upsert(${tenantName})`);
        return {};
      },
      count: async (args: any) => {
        queryLog.push(`postView.count(${tenantName})`);
        return postViews.length;
      },
      findUnique: async (args: any) => {
        queryLog.push(`postView.findUnique(${tenantName})`);
        return { id: 'view-1' };
      },
    },
    comment: {
      findMany: async (args: any) => {
        queryLog.push(`comment.findMany(${tenantName})`);
        return comments;
      },
      count: async (args: any) => {
        queryLog.push(`comment.count(${tenantName})`);
        return comments.length;
      },
      create: async (args: any) => {
        queryLog.push(`comment.create(${tenantName})`);
        const newComment = {
          id: `comment-${Date.now()}`,
          postId: args.data.postId,
          authorId: args.data.authorId,
          content: args.data.content,
          createdAt: new Date(),
          updatedAt: new Date(),
          author: {
            id: args.data.authorId,
            role: 'MEMBER',
            profile: { fullName: 'Commenter', avatarUrl: null, city: null, state: null },
          },
        };
        comments.push(newComment);
        return newComment;
      },
    },
    group: {
      findMany: async (args: any) => {
        queryLog.push(`group.findMany(${tenantName})`);
        return groups;
      },
      count: async (args: any) => {
        queryLog.push(`group.count(${tenantName})`);
        return groups.length;
      },
      findUnique: async (args: any) => {
        queryLog.push(`group.findUnique(${tenantName})`);
        if (args.where.slug) {
          return groups.find((g) => g.slug === args.where.slug) || null;
        }
        if (args.where.id) {
          return groups.find((g) => g.id === args.where.id) || null;
        }
        return null;
      },
      create: async (args: any) => {
        queryLog.push(`group.create(${tenantName})`);
        const newGroup = {
          id: `group-${Date.now()}`,
          name: args.data.name,
          slug: args.data.slug,
          description: args.data.description,
          coverUrl: args.data.coverUrl,
          privacy: args.data.privacy,
          createdById: args.data.createdById,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { members: 1, posts: 0 },
          creator: {
            id: args.data.createdById,
            profile: { fullName: 'Creator', avatarUrl: null },
          },
          members: [
            {
              id: 'member-creator',
              groupId: `group-${Date.now()}`,
              userId: args.data.createdById,
              role: 'ADMIN',
              joinedAt: new Date(),
              user: {
                id: args.data.createdById,
                profile: { fullName: 'Creator', avatarUrl: null, city: null, state: null },
              },
            },
          ],
        };
        groups.push(newGroup);
        return newGroup;
      },
    },
    groupMember: {
      findUnique: async (args: any) => {
        queryLog.push(`groupMember.findUnique(${tenantName})`);
        const key = args.where.groupId_userId;
        return groupMembers.find((m) => m.groupId === key.groupId && m.userId === key.userId) || null;
      },
      create: async (args: any) => {
        queryLog.push(`groupMember.create(${tenantName})`);
        const newMember = {
          id: `gm-${Date.now()}`,
          groupId: args.data.groupId,
          userId: args.data.userId,
          role: args.data.role,
          joinedAt: new Date(),
        };
        groupMembers.push(newMember);
        return newMember;
      },
      count: async (args: any) => {
        queryLog.push(`groupMember.count(${tenantName})`);
        return groupMembers.length;
      },
    },
    matrimonialProfile: {
      findUnique: async (args: any) => {
        queryLog.push(`matrimonialProfile.findUnique(${tenantName})`);
        if (args.where.userId) {
          return matrimonialProfiles.find((mp) => mp.userId === args.where.userId) || null;
        }
        if (args.where.id) {
          return matrimonialProfiles.find((mp) => mp.id === args.where.id) || null;
        }
        return null;
      },
      findMany: async (args: any) => {
        queryLog.push(`matrimonialProfile.findMany(${tenantName})`);
        return matrimonialProfiles.filter((mp) => mp.status === 'APPROVED');
      },
      count: async (args: any) => {
        queryLog.push(`matrimonialProfile.count(${tenantName})`);
        return matrimonialProfiles.filter((mp) => mp.status === 'APPROVED').length;
      },
    },
    matrimonialInterest: {
      findFirst: async (args: any) => {
        queryLog.push(`matrimonialInterest.findFirst(${tenantName})`);
        return matrimonialInterests[0] || null;
      },
      findMany: async (args: any) => {
        queryLog.push(`matrimonialInterest.findMany(${tenantName})`);
        return matrimonialInterests;
      },
      findUnique: async (args: any) => {
        queryLog.push(`matrimonialInterest.findUnique(${tenantName})`);
        return matrimonialInterests.find((i) => i.id === args.where.id) || null;
      },
      create: async (args: any) => {
        queryLog.push(`matrimonialInterest.create(${tenantName})`);
        const newInterest = {
          id: `interest-${Date.now()}`,
          senderId: args.data.senderId,
          receiverId: args.data.receiverId,
          status: 'PENDING',
          message: args.data.message || null,
          respondedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        matrimonialInterests.push(newInterest);
        return newInterest;
      },
      update: async (args: any) => {
        queryLog.push(`matrimonialInterest.update(${tenantName})`);
        const found = matrimonialInterests.find((i) => i.id === args.where.id);
        if (found) {
          found.status = args.data.status;
          found.respondedAt = args.data.respondedAt;
        }
        return found;
      },
      count: async (args: any) => {
        queryLog.push(`matrimonialInterest.count(${tenantName})`);
        return matrimonialInterests.length;
      },
    },
    user: {
      findUnique: async (args: any) => {
        queryLog.push(`user.findUnique(${tenantName})`);
        return users.find((u) => u.id === args.where.id) || null;
      },
    },
    profile: {
      findUnique: async (args: any) => {
        queryLog.push(`profile.findUnique(${tenantName})`);
        return { fullName: 'Member Name' };
      },
    },
    auditLog: {
      create: async (args: any) => {
        queryLog.push(`auditLog.create(${tenantName})`);
        return { id: 'audit-1' };
      },
    },
  };

  return client as PrismaClient & { queryLog: string[]; resetLog: () => void };
}

// ---------------------------------------------------------------------------
// Seed Mock Datasets
// ---------------------------------------------------------------------------

const kewatPosts = [
  {
    id: 'kewat-post-1',
    authorId: 'kewat-user-1',
    type: 'TEXT',
    content: 'Namaste Kewat Samaj brothers and sisters!',
    isPinned: false,
    groupId: null,
    group: null,
    createdAt: new Date('2026-02-01T10:00:00Z'),
    updatedAt: new Date('2026-02-01T10:00:00Z'),
    media: [],
    _count: { likes: 3, comments: 1 },
    likes: [],
    author: {
      id: 'kewat-user-1',
      role: 'MEMBER',
      status: 'ACTIVE',
      profile: {
        fullName: 'Ramesh Kewat',
        avatarUrl: 'https://storage/kewat-ramesh.jpg',
        city: 'Varanasi',
        state: 'Uttar Pradesh',
      },
    },
  },
];

const guptaPosts = [
  {
    id: 'gupta-post-1',
    authorId: 'gupta-user-1',
    type: 'TEXT',
    content: 'Welcome to Gupta Samaj community portal!',
    isPinned: false,
    groupId: null,
    group: null,
    createdAt: new Date('2026-02-02T11:00:00Z'),
    updatedAt: new Date('2026-02-02T11:00:00Z'),
    media: [],
    _count: { likes: 5, comments: 2 },
    likes: [],
    author: {
      id: 'gupta-user-1',
      role: 'MEMBER',
      status: 'ACTIVE',
      profile: {
        fullName: 'Amit Gupta',
        avatarUrl: 'https://storage/gupta-amit.jpg',
        city: 'Kanpur',
        state: 'Uttar Pradesh',
      },
    },
  },
];

const kewatGroups = [
  {
    id: 'kewat-group-1',
    name: 'Kewat Yuva Mandal',
    slug: 'kewat-yuva-mandal',
    description: 'Youth organization of Kewat Samaj',
    coverUrl: null,
    privacy: 'PUBLIC',
    createdById: 'kewat-user-1',
    createdAt: new Date('2026-01-10T00:00:00Z'),
    updatedAt: new Date('2026-01-10T00:00:00Z'),
    _count: { members: 15, posts: 4 },
    creator: { id: 'kewat-user-1', profile: { fullName: 'Ramesh Kewat', avatarUrl: null } },
    members: [
      {
        id: 'km-1',
        groupId: 'kewat-group-1',
        userId: 'kewat-user-1',
        role: 'ADMIN',
        joinedAt: new Date(),
        user: { id: 'kewat-user-1', profile: { fullName: 'Ramesh Kewat', avatarUrl: null, city: 'Varanasi', state: 'UP' } },
      },
    ],
  },
  {
    id: 'kewat-group-private',
    name: 'Kewat Elders Committee',
    slug: 'kewat-elders-committee',
    description: 'Private advisory committee',
    coverUrl: null,
    privacy: 'PRIVATE',
    createdById: 'kewat-user-1',
    createdAt: new Date('2026-01-15T00:00:00Z'),
    updatedAt: new Date('2026-01-15T00:00:00Z'),
    _count: { members: 5, posts: 2 },
    creator: { id: 'kewat-user-1', profile: { fullName: 'Ramesh Kewat', avatarUrl: null } },
    members: [
      {
        id: 'km-2',
        groupId: 'kewat-group-private',
        userId: 'kewat-user-1',
        role: 'ADMIN',
        joinedAt: new Date(),
        user: { id: 'kewat-user-1', profile: { fullName: 'Ramesh Kewat', avatarUrl: null, city: 'Varanasi', state: 'UP' } },
      },
    ],
  },
];

const guptaGroups = [
  {
    id: 'gupta-group-1',
    name: 'Gupta Vyapar Sangh',
    slug: 'gupta-vyapar-sangh',
    description: 'Business community network for Gupta Samaj',
    coverUrl: null,
    privacy: 'PUBLIC',
    createdById: 'gupta-user-1',
    createdAt: new Date('2026-01-12T00:00:00Z'),
    updatedAt: new Date('2026-01-12T00:00:00Z'),
    _count: { members: 22, posts: 8 },
    creator: { id: 'gupta-user-1', profile: { fullName: 'Amit Gupta', avatarUrl: null } },
    members: [
      {
        id: 'gm-1',
        groupId: 'gupta-group-1',
        userId: 'gupta-user-1',
        role: 'ADMIN',
        joinedAt: new Date(),
        user: { id: 'gupta-user-1', profile: { fullName: 'Amit Gupta', avatarUrl: null, city: 'Kanpur', state: 'UP' } },
      },
    ],
  },
];

const kewatMatrimonialProfiles = [
  {
    id: 'kewat-mp-1',
    userId: 'kewat-user-2',
    status: 'APPROVED',
    maritalStatus: 'NEVER_MARRIED',
    heightCm: 175,
    weightKg: 70,
    motherTongue: 'Hindi',
    religion: 'Hindu',
    caste: 'Kewat',
    subCaste: 'Mallāh',
    gotra: 'Kashyap',
    manglik: 'NO',
    birthTime: '10:00',
    birthCity: 'Prayagraj',
    rashi: 'Mesh',
    nakshatra: 'Ashwini',
    highestEducation: 'B.Tech Computer Science',
    educationDetails: 'IIT Kanpur',
    employedIn: 'PRIVATE_SECTOR',
    occupation: 'Software Engineer',
    companyName: 'Tech Corp',
    annualIncome: '18 LPA',
    workCity: 'Bengaluru',
    workState: 'Karnataka',
    workCountry: 'India',
    familyType: 'NUCLEAR',
    familyValues: 'MODERATE',
    fatherName: 'Ram Kewat',
    fatherOccupation: 'Business',
    motherName: 'Shanti Kewat',
    motherOccupation: 'Homemaker',
    brothersCount: 1,
    brothersMarried: 0,
    sistersCount: 0,
    sistersMarried: 0,
    familyNativePlace: 'Prayagraj',
    aboutFamily: 'Loving family',
    diet: 'VEGETARIAN',
    smoking: 'NO',
    drinking: 'NO',
    aboutMe: 'Passionate engineer looking for a compatible life partner.',
    partnerExpectations: 'Educated and understanding partner.',
    createdAt: new Date('2026-02-05T00:00:00Z'),
    updatedAt: new Date('2026-02-05T00:00:00Z'),
    photos: [],
    partnerPreference: null,
    user: {
      id: 'kewat-user-2',
      phone: '+919876543210',
      role: 'MEMBER',
      status: 'ACTIVE',
      profile: {
        fullName: 'Suresh Kewat',
        gender: 'MALE',
        dateOfBirth: new Date('1998-05-15T00:00:00Z'),
        avatarUrl: null,
        city: 'Prayagraj',
        state: 'Uttar Pradesh',
        subCaste: 'Mallāh',
        gotra: 'Kashyap',
      },
    },
  },
];

const guptaMatrimonialProfiles = [
  {
    id: 'gupta-mp-1',
    userId: 'gupta-user-2',
    status: 'APPROVED',
    maritalStatus: 'NEVER_MARRIED',
    heightCm: 165,
    weightKg: 55,
    motherTongue: 'Hindi',
    religion: 'Hindu',
    caste: 'Gupta',
    subCaste: 'Vaishya',
    gotra: 'Garg',
    manglik: 'NO',
    birthTime: '08:30',
    birthCity: 'Kanpur',
    rashi: 'Kanya',
    nakshatra: 'Hasta',
    highestEducation: 'MBA Finance',
    educationDetails: 'IIM Lucknow',
    employedIn: 'BANKING',
    occupation: 'Financial Analyst',
    companyName: 'National Bank',
    annualIncome: '15 LPA',
    workCity: 'Mumbai',
    workState: 'Maharashtra',
    workCountry: 'India',
    familyType: 'JOINT',
    familyValues: 'TRADITIONAL',
    fatherName: 'Mohan Gupta',
    fatherOccupation: 'Chartered Accountant',
    motherName: 'Sunita Gupta',
    motherOccupation: 'Teacher',
    brothersCount: 0,
    brothersMarried: 0,
    sistersCount: 1,
    sistersMarried: 1,
    familyNativePlace: 'Kanpur',
    aboutFamily: 'Reputed joint family',
    diet: 'VEGETARIAN',
    smoking: 'NO',
    drinking: 'NO',
    aboutMe: 'Finance professional looking for a cultured life partner.',
    partnerExpectations: 'Kind, ambitious partner.',
    createdAt: new Date('2026-02-06T00:00:00Z'),
    updatedAt: new Date('2026-02-06T00:00:00Z'),
    photos: [],
    partnerPreference: null,
    user: {
      id: 'gupta-user-2',
      phone: '+919123456789',
      role: 'MEMBER',
      status: 'ACTIVE',
      profile: {
        fullName: 'Priya Gupta',
        gender: 'FEMALE',
        dateOfBirth: new Date('1999-08-20T00:00:00Z'),
        avatarUrl: null,
        city: 'Kanpur',
        state: 'Uttar Pradesh',
        subCaste: 'Vaishya',
        gotra: 'Garg',
      },
    },
  },
];

// Initialize independent mock clients
const kewatClient = createMockTenantClient('kewat', {
  posts: kewatPosts,
  groups: kewatGroups,
  matrimonialProfiles: kewatMatrimonialProfiles,
  users: [
    { id: 'kewat-user-1', status: 'ACTIVE', matrimonialProfile: { id: 'kewat-mp-self', status: 'APPROVED' } },
    { id: 'kewat-user-2', status: 'ACTIVE', matrimonialProfile: { id: 'kewat-mp-1', status: 'APPROVED' } },
  ],
});

const guptaClient = createMockTenantClient('gupta', {
  posts: guptaPosts,
  groups: guptaGroups,
  matrimonialProfiles: guptaMatrimonialProfiles,
  users: [
    { id: 'gupta-user-1', status: 'ACTIVE', matrimonialProfile: { id: 'gupta-mp-self', status: 'APPROVED' } },
    { id: 'gupta-user-2', status: 'ACTIVE', matrimonialProfile: { id: 'gupta-mp-1', status: 'APPROVED' } },
  ],
});

async function runTests() {
  console.log('--- Suite 1: Posts Physical Database Isolation ---');

  // 1. Kewat community feed queries only Kewat client
  kewatClient.resetLog();
  guptaClient.resetLog();
  const kewatFeed = await getCommunityFeed({ page: 1, limit: 10 }, 'kewat-user-1', kewatClient);
  assertTest(
    kewatFeed.posts.length === 1 && kewatFeed.posts[0].content.includes('Kewat Samaj'),
    'Kewat feed returns only Kewat posts'
  );
  assertTest(
    kewatClient.queryLog.some((q) => q.includes('post.findMany(kewat)')),
    'Kewat feed queried supplied Kewat client'
  );
  assertTest(
    guptaClient.queryLog.length === 0,
    'Gupta client received zero queries during Kewat feed request'
  );

  // 2. Gupta community feed queries only Gupta client
  kewatClient.resetLog();
  guptaClient.resetLog();
  const guptaFeed = await getCommunityFeed({ page: 1, limit: 10 }, 'gupta-user-1', guptaClient);
  assertTest(
    guptaFeed.posts.length === 1 && guptaFeed.posts[0].content.includes('Gupta Samaj'),
    'Gupta feed returns only Gupta posts'
  );
  assertTest(
    guptaClient.queryLog.some((q) => q.includes('post.findMany(gupta)')),
    'Gupta feed queried supplied Gupta client'
  );
  assertTest(
    kewatClient.queryLog.length === 0,
    'Kewat client received zero queries during Gupta feed request'
  );

  // 3. No cross-community post access: querying Kewat post on Gupta client fails
  try {
    await getPostById('kewat-post-1', 'gupta-user-1', guptaClient);
    assertTest(false, 'Cross-community post retrieval should have thrown 404');
  } catch (err: any) {
    assertTest(
      err instanceof PostServiceError && err.statusCode === 404,
      'Kewat post on Gupta client fails closed with 404'
    );
  }

  // 4. Missing tenant client fails closed (no silent global fallback)
  try {
    await getCommunityFeed({ page: 1, limit: 10 }, 'kewat-user-1', undefined);
    assertTest(false, 'Missing tenant client should fail closed');
  } catch (err: any) {
    assertTest(
      err instanceof PostServiceError && err.statusCode === 400,
      'Missing tenant db in posts service fails closed with 400'
    );
  }

  // 5. Post likes and comments use supplied client
  kewatClient.resetLog();
  const likeResult = await likePost('kewat-post-1', 'kewat-user-1', kewatClient);
  assertTest(likeResult.isLikedByMe === true, 'Post like succeeds on supplied client');
  assertTest(
    kewatClient.queryLog.some((q) => q.includes('postLike.upsert(kewat)')),
    'likePost queried Kewat client'
  );

  const commentResult = await createComment('kewat-post-1', 'kewat-user-1', 'Great post!', kewatClient);
  assertTest(commentResult.content === 'Great post!', 'Comment created on supplied client');
  assertTest(
    kewatClient.queryLog.some((q) => q.includes('comment.create(kewat)')),
    'createComment queried Kewat client'
  );

  console.log('\n--- Suite 2: Groups Physical Database Isolation & Permissions ---');

  // 6. Kewat groups query only Kewat client
  kewatClient.resetLog();
  guptaClient.resetLog();
  const kewatGroupList = await listGroups({ page: 1, limit: 10 }, 'kewat-user-1', kewatClient);
  assertTest(
    kewatGroupList.groups.length === 2 && kewatGroupList.groups.some((g) => g.name === 'Kewat Yuva Mandal'),
    'Kewat groups list returns only Kewat groups'
  );
  assertTest(
    kewatClient.queryLog.some((q) => q.includes('group.findMany(kewat)')),
    'listGroups queried Kewat client'
  );
  assertTest(
    guptaClient.queryLog.length === 0,
    'Gupta client received zero queries during Kewat groups list'
  );

  // 7. Gupta groups query only Gupta client
  kewatClient.resetLog();
  guptaClient.resetLog();
  const guptaGroupList = await listGroups({ page: 1, limit: 10 }, 'gupta-user-1', guptaClient);
  assertTest(
    guptaGroupList.groups.length === 1 && guptaGroupList.groups[0].name === 'Gupta Vyapar Sangh',
    'Gupta groups list returns only Gupta groups'
  );
  assertTest(
    guptaClient.queryLog.some((q) => q.includes('group.findMany(gupta)')),
    'listGroups queried Gupta client'
  );
  assertTest(
    kewatClient.queryLog.length === 0,
    'Kewat client received zero queries during Gupta groups list'
  );

  // 8. Private group access control enforced on tenant client:
  // Non-member viewing private group details has members list hidden
  const privateGroupDetailsNonMember = await getGroupBySlug(
    'kewat-elders-committee',
    'kewat-non-member-id',
    kewatClient
  );
  assertTest(
    privateGroupDetailsNonMember.privacy === 'PRIVATE' && (privateGroupDetailsNonMember.members?.length ?? 0) === 0,
    'Private group hides member roster from non-members on tenant client'
  );

  // Member viewing private group details sees members list
  const privateGroupDetailsMember = await getGroupBySlug(
    'kewat-elders-committee',
    'kewat-user-1',
    kewatClient
  );
  assertTest(
    privateGroupDetailsMember.isMember === true && (privateGroupDetailsMember.members?.length ?? 0) === 1,
    'Private group reveals member roster to authorized members on tenant client'
  );

  // 9. Joining private group rejected
  try {
    await joinGroup('kewat-group-private', 'kewat-user-2', kewatClient);
    assertTest(false, 'Joining private group directly should fail');
  } catch (err: any) {
    assertTest(
      err instanceof ForbiddenGroupActionError,
      'Direct join on private group fails with ForbiddenGroupActionError'
    );
  }

  // 10. Missing tenant client in groups fails closed
  try {
    await listGroups({ page: 1, limit: 10 }, 'kewat-user-1', undefined);
    assertTest(false, 'Missing tenant client in groups should fail closed');
  } catch (err: any) {
    assertTest(
      err instanceof GroupServiceError && err.statusCode === 400,
      'Missing tenant db in groups service fails closed with 400'
    );
  }

  console.log('\n--- Suite 3: Matrimonial Physical Database Isolation & Privacy ---');

  // 11. Kewat matrimonial discovery queries only Kewat client
  kewatClient.resetLog();
  guptaClient.resetLog();
  const kewatDiscovery = await listDiscoveryProfiles('kewat-user-1', { page: 1, limit: 10 }, kewatClient);
  assertTest(
    kewatDiscovery.profiles.length === 1 && kewatDiscovery.profiles[0].fullName === 'Suresh Kewat',
    'Kewat discovery returns only Kewat matrimonial profiles'
  );
  assertTest(
    kewatClient.queryLog.some((q) => q.includes('matrimonialProfile.findMany(kewat)')),
    'listDiscoveryProfiles queried Kewat client'
  );
  assertTest(
    guptaClient.queryLog.length === 0,
    'Gupta client received zero queries during Kewat matrimonial discovery'
  );

  // 12. Gupta matrimonial discovery queries only Gupta client
  kewatClient.resetLog();
  guptaClient.resetLog();
  const guptaDiscovery = await listDiscoveryProfiles('gupta-user-1', { page: 1, limit: 10 }, guptaClient);
  assertTest(
    guptaDiscovery.profiles.length === 1 && guptaDiscovery.profiles[0].fullName === 'Priya Gupta',
    'Gupta discovery returns only Gupta matrimonial profiles'
  );
  assertTest(
    guptaClient.queryLog.some((q) => q.includes('matrimonialProfile.findMany(gupta)')),
    'listDiscoveryProfiles queried Gupta client'
  );
  assertTest(
    kewatClient.queryLog.length === 0,
    'Kewat client received zero queries during Gupta matrimonial discovery'
  );

  // 13. Matrimonial contact privacy rules enforced on tenant client:
  // When no mutually accepted interest exists, phone number is hidden
  const safeProfileWithoutMutual = await getDiscoveryProfileById(
    'kewat-user-1',
    'kewat-mp-1',
    kewatClient
  );
  assertTest(
    safeProfileWithoutMutual.unlockedContact === null,
    'Contact phone is locked (null) when interest is not mutually accepted'
  );

  // When viewing own profile, phone is unlocked
  const ownProfile = await getDiscoveryProfileById(
    'kewat-user-2',
    'kewat-mp-1',
    kewatClient
  );
  assertTest(
    ownProfile.unlockedContact !== null && ownProfile.unlockedContact?.phone === '+919876543210',
    'Contact phone is unlocked when viewing own profile'
  );

  // 14. Missing tenant client in matrimonial fails closed
  try {
    await listDiscoveryProfiles('kewat-user-1', { page: 1, limit: 10 }, undefined);
    assertTest(false, 'Missing tenant client in matrimonial should fail closed');
  } catch (err: any) {
    assertTest(
      err instanceof MatrimonialServiceError && err.statusCode === 400,
      'Missing tenant db in matrimonial service fails closed with 400'
    );
  }

  // 15. Self-interest rejection enforced
  try {
    await sendInterest('kewat-user-1', { receiverId: 'kewat-user-1' }, kewatClient);
    assertTest(false, 'Sending interest to oneself should be rejected');
  } catch (err: any) {
    assertTest(
      err instanceof MatrimonialServiceError && err.statusCode === 400,
      'Self-interest request rejected with 400 error'
    );
  }

  console.log('\n================================================================');
  console.log(`   Phase 15C.3 Results: ${passedTests} passed, ${failedTests} failed   `);
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
