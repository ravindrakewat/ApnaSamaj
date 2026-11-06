import assert from 'assert';
import {
  searchGroupMessages,
  getGroupMediaGallery,
  getGroupMessageContext,
  sendChatMessage,
  ChatNotFoundError,
  ForbiddenChatError,
} from '../modules/chat/chat.service';
import {
  searchDirectMessages,
  getDirectMediaGallery,
  getDirectMessageContext,
  sendDirectMessage,
} from '../modules/chat/direct-chat.service';
import { ChatAttachmentType } from '@apnasamaj/shared-types';

console.log('================================================================');
console.log('   Apna Samaj — Batch 8.9: Chat Search & Media Gallery Backend Tests');
console.log('================================================================\n');

// In-memory Mock PrismaClient simulating PostgreSQL multi-tenant database
function createMockPrismaClient() {
  const groups: any[] = [];
  const groupMembers: any[] = [];
  const users: any[] = [];
  const chatMessages: any[] = [];
  const directConversations: any[] = [];
  const directMessages: any[] = [];
  const chatAttachments: any[] = [];

  const db: any = {
    group: {
      findFirst: async ({ where }: any) => {
        return (
          groups.find(
            (g) =>
              g.id === where?.OR?.[0]?.id ||
              g.slug === where?.OR?.[1]?.slug ||
              g.id === where?.id ||
              g.slug === where?.slug
          ) || null
        );
      },
    },
    groupMember: {
      findUnique: async ({ where }: any) => {
        const { groupId, userId } = where.groupId_userId;
        return (
          groupMembers.find((m) => m.groupId === groupId && m.userId === userId) || null
        );
      },
      findMany: async () => [],
    },
    user: {
      findUnique: async ({ where }: any) => {
        return users.find((u) => u.id === where.id) || null;
      },
    },
    chatMessage: {
      findUnique: async ({ where }: any) => {
        const msg = chatMessages.find((m) => m.id === where.id);
        return msg ? { ...msg } : null;
      },
      findFirst: async ({ where }: any) => {
        return chatMessages.find((m) => {
          if (where.id && m.id !== where.id) return false;
          if (where.groupId && m.groupId !== where.groupId) return false;
          return true;
        }) || null;
      },
      create: async ({ data }: any) => {
        const id = data.id || `msg-${Date.now()}-${Math.random()}`;
        const newMsg = {
          id,
          groupId: data.groupId,
          senderId: data.senderId,
          content: data.content || '',
          clientMessageId: data.clientMessageId || null,
          replyToMessageId: data.replyToMessageId || null,
          createdAt: new Date(),
          updatedAt: new Date(),
          sender: users.find((u) => u.id === data.senderId) || null,
          attachments: [],
          reactions: [],
        };
        chatMessages.push(newMsg);
        return newMsg;
      },
      count: async ({ where }: any) => {
        return chatMessages.filter((m) => {
          if (where.groupId && m.groupId !== where.groupId) return false;
          if (where.senderId && m.senderId !== where.senderId) return false;
          if (where.OR) {
            const keyword = where.OR[0]?.content?.contains?.toLowerCase() || '';
            const contentMatch = m.content?.toLowerCase().includes(keyword);
            const attMatch = m.attachments?.some((a: any) => a.fileName?.toLowerCase().includes(keyword));
            if (!contentMatch && !attMatch) return false;
          }
          return true;
        }).length;
      },
      findMany: async ({ where, take, orderBy }: any) => {
        let list = chatMessages.filter((m) => {
          if (where.groupId && m.groupId !== where.groupId) return false;
          if (where.senderId && m.senderId !== where.senderId) return false;
          if (where.createdAt?.lt && m.createdAt >= where.createdAt.lt) return false;
          if (where.createdAt?.gt && m.createdAt <= where.createdAt.gt) return false;
          if (where.createdAt?.gte && m.createdAt < where.createdAt.gte) return false;
          if (where.createdAt?.lte && m.createdAt > where.createdAt.lte) return false;
          if (where.OR) {
            const keyword = where.OR[0]?.content?.contains?.toLowerCase() || '';
            const contentMatch = m.content?.toLowerCase().includes(keyword);
            const attMatch = m.attachments?.some((a: any) => a.fileName?.toLowerCase().includes(keyword));
            if (!contentMatch && !attMatch) return false;
          }
          return true;
        });

        if (orderBy?.createdAt === 'desc') {
          list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        } else if (orderBy?.createdAt === 'asc') {
          list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }

        if (take) {
          list = list.slice(0, take);
        }

        return list;
      },
    },
    directConversation: {
      findUnique: async ({ where }: any) => {
        return directConversations.find((c) => c.id === where.id) || null;
      },
      findFirst: async ({ where }: any) => {
        return (
          directConversations.find(
            (c) =>
              (c.userOneId === where?.userOneId && c.userTwoId === where?.userTwoId) ||
              (c.userOneId === where?.userTwoId && c.userTwoId === where?.userOneId)
          ) || null
        );
      },
      create: async ({ data }: any) => {
        const newConv = {
          id: data.id || `conv-${Date.now()}`,
          userOneId: data.userOneId,
          userTwoId: data.userTwoId,
          createdAt: new Date(),
          updatedAt: new Date(),
          userOne: users.find((u) => u.id === data.userOneId) || null,
          userTwo: users.find((u) => u.id === data.userTwoId) || null,
        };
        directConversations.push(newConv);
        return newConv;
      },
    },
    directMessage: {
      findUnique: async ({ where }: any) => {
        return directMessages.find((m) => m.id === where.id) || null;
      },
      findFirst: async ({ where }: any) => {
        return directMessages.find((m) => {
          if (where.id && m.id !== where.id) return false;
          if (where.conversationId && m.conversationId !== where.conversationId) return false;
          return true;
        }) || null;
      },
      create: async ({ data }: any) => {
        const id = data.id || `dmsg-${Date.now()}-${Math.random()}`;
        const newMsg = {
          id,
          conversationId: data.conversationId,
          senderId: data.senderId,
          content: data.content || '',
          clientMessageId: data.clientMessageId || null,
          replyToMessageId: data.replyToMessageId || null,
          createdAt: new Date(),
          updatedAt: new Date(),
          sender: users.find((u) => u.id === data.senderId) || null,
          attachments: [],
          reactions: [],
        };
        directMessages.push(newMsg);
        return newMsg;
      },
      count: async ({ where }: any) => {
        return directMessages.filter((m) => {
          if (where.conversationId && m.conversationId !== where.conversationId) return false;
          if (where.senderId && m.senderId !== where.senderId) return false;
          if (where.OR) {
            const keyword = where.OR[0]?.content?.contains?.toLowerCase() || '';
            const contentMatch = m.content?.toLowerCase().includes(keyword);
            const attMatch = m.attachments?.some((a: any) => a.fileName?.toLowerCase().includes(keyword));
            if (!contentMatch && !attMatch) return false;
          }
          return true;
        }).length;
      },
      findMany: async ({ where, take, orderBy }: any) => {
        let list = directMessages.filter((m) => {
          if (where.conversationId && m.conversationId !== where.conversationId) return false;
          if (where.senderId && m.senderId !== where.senderId) return false;
          if (where.createdAt?.lt && m.createdAt >= where.createdAt.lt) return false;
          if (where.createdAt?.gt && m.createdAt <= where.createdAt.gt) return false;
          if (where.createdAt?.gte && m.createdAt < where.createdAt.gte) return false;
          if (where.createdAt?.lte && m.createdAt > where.createdAt.lte) return false;
          if (where.OR) {
            const keyword = where.OR[0]?.content?.contains?.toLowerCase() || '';
            const contentMatch = m.content?.toLowerCase().includes(keyword);
            const attMatch = m.attachments?.some((a: any) => a.fileName?.toLowerCase().includes(keyword));
            if (!contentMatch && !attMatch) return false;
          }
          return true;
        });

        if (orderBy?.createdAt === 'desc') {
          list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        } else if (orderBy?.createdAt === 'asc') {
          list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }

        if (take) {
          list = list.slice(0, take);
        }

        return list;
      },
    },
    chatAttachment: {
      findMany: async ({ where, take, orderBy }: any) => {
        let list = chatAttachments.filter((att) => {
          if (where.chatMessage?.groupId) {
            const msg = chatMessages.find((m) => m.id === att.chatMessageId);
            if (!msg || msg.groupId !== where.chatMessage.groupId) return false;
          }
          if (where.directMessage?.conversationId) {
            const msg = directMessages.find((m) => m.id === att.directMessageId);
            if (!msg || msg.conversationId !== where.directMessage.conversationId) return false;
          }
          if (where.type && att.type !== where.type) return false;
          if (where.createdAt?.lt && att.createdAt >= where.createdAt.lt) return false;
          return true;
        });

        if (orderBy?.createdAt === 'desc') {
          list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }

        if (take) {
          list = list.slice(0, take);
        }

        return list.map((att) => {
          const chatMsg = att.chatMessageId ? chatMessages.find((m) => m.id === att.chatMessageId) : null;
          const directMsg = att.directMessageId ? directMessages.find((m) => m.id === att.directMessageId) : null;
          return {
            ...att,
            chatMessage: chatMsg,
            directMessage: directMsg,
          };
        });
      },
    },
  };

  return {
    db,
    groups,
    groupMembers,
    users,
    chatMessages,
    directConversations,
    directMessages,
    chatAttachments,
  };
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    return Promise.resolve()
      .then(fn)
      .then(() => {
        console.log(`✅ PASS: ${name}`);
        passed++;
      })
      .catch((err) => {
        console.error(`❌ FAIL: ${name}`);
        console.error(err);
        failed++;
      });
  }

  const fixture = createMockPrismaClient();
  const { db, groups, groupMembers, users, chatMessages, directConversations, directMessages, chatAttachments } = fixture;

  // Seed Users
  const user1 = { id: 'u1-uuid', email: 'user1@apnasamaj.in', profile: { fullName: 'Sunil Kewat', avatarUrl: null } };
  const user2 = { id: 'u2-uuid', email: 'user2@apnasamaj.in', profile: { fullName: 'Aarav Sharma', avatarUrl: null } };
  const user3 = { id: 'u3-uuid', email: 'user3@apnasamaj.in', profile: { fullName: 'Pooja Patel', avatarUrl: null } };
  const outsider = { id: 'u9-outsider', email: 'outsider@apnasamaj.in', profile: { fullName: 'Outsider User', avatarUrl: null } };
  users.push(user1, user2, user3, outsider);

  // Seed Groups
  const publicGroup = { id: 'grp-public-id', slug: 'youth-mandal', name: 'Youth Mandal', privacy: 'PUBLIC' };
  const privateGroup = { id: 'grp-private-id', slug: 'executive-committee', name: 'Executive Committee', privacy: 'PRIVATE' };
  groups.push(publicGroup, privateGroup);

  // Seed Memberships
  groupMembers.push(
    { groupId: publicGroup.id, userId: user1.id, role: 'ADMIN' },
    { groupId: publicGroup.id, userId: user2.id, role: 'MEMBER' },
    { groupId: privateGroup.id, userId: user1.id, role: 'ADMIN' }
  );

  // Seed Direct Conversation between user1 and user2
  const directConv = {
    id: 'conv-1-2',
    userOneId: user1.id,
    userTwoId: user2.id,
    userOne: user1,
    userTwo: user2,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  directConversations.push(directConv);

  console.log('--- 1. Group Chat Search Functionality ---');

  await test('Seed group messages for search testing', async () => {
    // Message 1: Contains "meeting"
    const m1 = {
      id: 'gmsg-1',
      groupId: publicGroup.id,
      senderId: user1.id,
      content: 'Hello everyone, the general meeting is scheduled for tomorrow at 5 PM.',
      createdAt: new Date('2026-11-06T10:00:00Z'),
      updatedAt: new Date('2026-11-06T10:00:00Z'),
      sender: user1,
      attachments: [],
      reactions: [],
    };
    // Message 2: Contains "budget report" and a document attachment
    const m2 = {
      id: 'gmsg-2',
      groupId: publicGroup.id,
      senderId: user2.id,
      content: 'Please find attached the budget report for annual festival.',
      createdAt: new Date('2026-11-06T11:00:00Z'),
      updatedAt: new Date('2026-11-06T11:00:00Z'),
      sender: user2,
      attachments: [
        {
          id: 'att-doc-1',
          chatMessageId: 'gmsg-2',
          type: 'DOCUMENT' as ChatAttachmentType,
          fileName: 'annual_budget_2026.pdf',
          mimeType: 'application/pdf',
          fileSizeBytes: 204800,
          storagePath: 'groups/main/grp-public-id/att-doc-1.pdf',
          createdAt: new Date('2026-11-06T11:00:00Z'),
        },
      ],
      reactions: [],
    };
    // Message 3: Casual chat
    const m3 = {
      id: 'gmsg-3',
      groupId: publicGroup.id,
      senderId: user1.id,
      content: 'Has anyone seen the event photos?',
      createdAt: new Date('2026-11-06T12:00:00Z'),
      updatedAt: new Date('2026-11-06T12:00:00Z'),
      sender: user1,
      attachments: [],
      reactions: [],
    };
    // Message 4: Photo attachment
    const m4 = {
      id: 'gmsg-4',
      groupId: publicGroup.id,
      senderId: user2.id,
      content: 'Here is the group photo',
      createdAt: new Date('2026-11-06T13:00:00Z'),
      updatedAt: new Date('2026-11-06T13:00:00Z'),
      sender: user2,
      attachments: [
        {
          id: 'att-img-1',
          chatMessageId: 'gmsg-4',
          type: 'IMAGE' as ChatAttachmentType,
          fileName: 'community_gathering.jpg',
          mimeType: 'image/jpeg',
          fileSizeBytes: 1048576,
          storagePath: 'groups/main/grp-public-id/att-img-1.jpg',
          createdAt: new Date('2026-11-06T13:00:00Z'),
        },
      ],
      reactions: [],
    };

    chatMessages.push(m1, m2, m3, m4);
    chatAttachments.push(m2.attachments[0], m4.attachments[0]);
    assert.strictEqual(chatMessages.length, 4);
  });

  await test('Search group messages by text keyword (case-insensitive)', async () => {
    const res = await searchGroupMessages(publicGroup.id, user1.id, { q: 'MEETING' }, db);
    assert.strictEqual(res.results.length, 1);
    assert.strictEqual(res.results[0].id, 'gmsg-1');
    assert.strictEqual(res.results[0].conversationType, 'GROUP');
    assert.strictEqual(res.results[0].matchSource, 'remote');
  });

  await test('Search group messages by attachment filename', async () => {
    const res = await searchGroupMessages(publicGroup.id, user1.id, { q: 'budget_2026' }, db);
    assert.strictEqual(res.results.length, 1);
    assert.strictEqual(res.results[0].id, 'gmsg-2');
    assert.strictEqual(res.results[0].attachmentType, 'DOCUMENT');
  });

  await test('Filter search by specific sender', async () => {
    const res = await searchGroupMessages(publicGroup.id, user1.id, { q: 'photo', senderId: user2.id }, db);
    assert.strictEqual(res.results.length, 1);
    assert.strictEqual(res.results[0].senderId, user2.id);
  });

  await test('Date range filter in message search', async () => {
    const res = await searchGroupMessages(
      publicGroup.id,
      user1.id,
      {
        q: 'photo',
        startDate: '2026-11-06T12:30:00Z',
        endDate: '2026-11-06T13:30:00Z',
      },
      db
    );
    assert.strictEqual(res.results.length, 1);
    assert.strictEqual(res.results[0].id, 'gmsg-4');
  });

  console.log('\n--- 2. Group Chat Privacy & Access Control ---');

  await test('Non-member is blocked from searching private group (403 Forbidden)', async () => {
    let thrown = false;
    try {
      await searchGroupMessages(privateGroup.id, user2.id, { q: 'confidential' }, db);
    } catch (err) {
      thrown = true;
      assert.ok(err instanceof ForbiddenChatError);
    }
    assert.strictEqual(thrown, true);
  });

  await test('Non-existent group throws 404 ChatNotFoundError', async () => {
    let thrown = false;
    try {
      await searchGroupMessages('non-existent-group', user1.id, { q: 'test' }, db);
    } catch (err) {
      thrown = true;
      assert.ok(err instanceof ChatNotFoundError);
    }
    assert.strictEqual(thrown, true);
  });

  console.log('\n--- 3. In-Chat Media Gallery ---');

  await test('Retrieve group media gallery with signed URLs', async () => {
    const res = await getGroupMediaGallery(publicGroup.id, user1.id, {}, db);
    assert.strictEqual(res.media.length, 2);
    // Verified signed URL returned (never raw storage path)
    assert.ok(res.media[0].url.includes('token=mock-signed-token'));
    assert.ok(res.media[1].url.includes('token=mock-signed-token'));
  });

  await test('Filter media gallery by type (DOCUMENT only)', async () => {
    const res = await getGroupMediaGallery(publicGroup.id, user1.id, { type: 'DOCUMENT' }, db);
    assert.strictEqual(res.media.length, 1);
    assert.strictEqual(res.media[0].type, 'DOCUMENT');
    assert.strictEqual(res.media[0].fileName, 'annual_budget_2026.pdf');
  });

  await test('Filter media gallery by type (IMAGE only)', async () => {
    const res = await getGroupMediaGallery(publicGroup.id, user1.id, { type: 'IMAGE' }, db);
    assert.strictEqual(res.media.length, 1);
    assert.strictEqual(res.media[0].type, 'IMAGE');
    assert.strictEqual(res.media[0].fileName, 'community_gathering.jpg');
  });

  await test('Non-member is blocked from private group media gallery', async () => {
    let thrown = false;
    try {
      await getGroupMediaGallery(privateGroup.id, user2.id, {}, db);
    } catch (err) {
      thrown = true;
      assert.ok(err instanceof ForbiddenChatError);
    }
    assert.strictEqual(thrown, true);
  });

  console.log('\n--- 4. Direct Chat Message Search & Access Authorization ---');

  await test('Seed direct messages between user 1 and user 2', async () => {
    const dm1 = {
      id: 'dmsg-1',
      conversationId: directConv.id,
      senderId: user1.id,
      content: 'Can you please review the matrimonial proposal?',
      createdAt: new Date('2026-11-06T09:00:00Z'),
      updatedAt: new Date('2026-11-06T09:00:00Z'),
      sender: user1,
      attachments: [],
      reactions: [],
    };
    const dm2 = {
      id: 'dmsg-2',
      conversationId: directConv.id,
      senderId: user2.id,
      content: 'Yes, looking at the matrimonial bio-data now.',
      createdAt: new Date('2026-11-06T09:05:00Z'),
      updatedAt: new Date('2026-11-06T09:05:00Z'),
      sender: user2,
      attachments: [
        {
          id: 'att-bio-1',
          directMessageId: 'dmsg-2',
          type: 'DOCUMENT' as ChatAttachmentType,
          fileName: 'biodata_candidate.pdf',
          mimeType: 'application/pdf',
          fileSizeBytes: 512000,
          storagePath: 'direct/main/conv-1-2/att-bio-1.pdf',
          createdAt: new Date('2026-11-06T09:05:00Z'),
        },
      ],
      reactions: [],
    };
    const dm3 = {
      id: 'dmsg-3',
      conversationId: directConv.id,
      senderId: user1.id,
      content: 'Listen to this voice message about the temple ceremony',
      createdAt: new Date('2026-11-06T09:10:00Z'),
      updatedAt: new Date('2026-11-06T09:10:00Z'),
      sender: user1,
      attachments: [
        {
          id: 'att-audio-1',
          directMessageId: 'dmsg-3',
          type: 'AUDIO' as ChatAttachmentType,
          fileName: 'voice_note_ceremony.m4a',
          mimeType: 'audio/m4a',
          fileSizeBytes: 84000,
          duration: 38,
          storagePath: 'direct/main/conv-1-2/att-audio-1.m4a',
          createdAt: new Date('2026-11-06T09:10:00Z'),
        },
      ],
      reactions: [],
    };

    directMessages.push(dm1, dm2, dm3);
    chatAttachments.push(dm2.attachments[0], dm3.attachments[0]);
    assert.strictEqual(directMessages.length, 3);
  });

  await test('Search direct messages within conversation', async () => {
    const res = await searchDirectMessages(directConv.id, user1.id, { q: 'matrimonial' }, db);
    assert.strictEqual(res.results.length, 2);
    assert.strictEqual(res.totalMatches, 2);
    assert.strictEqual(res.results[0].conversationType, 'DIRECT');
  });

  await test('Non-participant user cannot search direct conversation (403 Forbidden)', async () => {
    let thrown = false;
    try {
      await searchDirectMessages(directConv.id, outsider.id, { q: 'matrimonial' }, db);
    } catch (err) {
      thrown = true;
      assert.ok(err instanceof ForbiddenChatError);
    }
    assert.strictEqual(thrown, true);
  });

  await test('Retrieve direct media gallery (Voice note & Document)', async () => {
    const res = await getDirectMediaGallery(directConv.id, user2.id, {}, db);
    assert.strictEqual(res.media.length, 2);
    const audioItem = res.media.find((m) => m.type === 'AUDIO');
    assert.ok(audioItem);
    assert.strictEqual(audioItem?.duration, 38);
    assert.ok(audioItem?.url.includes('token=mock-signed-token'));
  });

  await test('Non-participant user cannot access direct media gallery (403 Forbidden)', async () => {
    let thrown = false;
    try {
      await getDirectMediaGallery(directConv.id, outsider.id, {}, db);
    } catch (err) {
      thrown = true;
      assert.ok(err instanceof ForbiddenChatError);
    }
    assert.strictEqual(thrown, true);
  });

  console.log('\n--- 5. Message Context Retrieval for Jump Navigation ---');

  await test('getGroupMessageContext returns target message and context index', async () => {
    const context = await getGroupMessageContext(publicGroup.id, 'gmsg-2', user1.id, 10, db);
    assert.strictEqual(context.targetMessageId, 'gmsg-2');
    assert.ok(context.messages.length >= 3);
    // Verify target message is at targetIndex
    assert.strictEqual(context.messages[context.targetIndex].id, 'gmsg-2');
  });

  await test('getDirectMessageContext returns target message and context index', async () => {
    const context = await getDirectMessageContext(directConv.id, 'dmsg-2', user1.id, 10, db);
    assert.strictEqual(context.targetMessageId, 'dmsg-2');
    assert.strictEqual(context.messages[context.targetIndex].id, 'dmsg-2');
  });

  console.log('\n--- 6. Multi-Tenant Isolation Invariants ---');

  await test('Missing database context throws error (assertDb invariant)', async () => {
    let thrown = false;
    try {
      await searchGroupMessages(publicGroup.id, user1.id, { q: 'test' }, undefined);
    } catch (err) {
      thrown = true;
    }
    assert.strictEqual(thrown, true);
  });

  console.log('\n================================================================');
  console.log(`🎉 TEST SUMMARY: ${passed} passed, ${failed} failed.`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution fatal error:', err);
  process.exit(1);
});

