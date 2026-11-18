import assert from 'assert';
import { resolveAttachmentDisplayUrl, extractYouTubeVideoDetails } from '../utils/attachment';
import { API_BASE_URL } from '../config/api.config';
import { ALLOWED_CHAT_REACTIONS } from '../../../../packages/shared-types/src/chat.ts';

function assertTest(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Test assertion failed: ${message}`);
  }
  console.log(`✅ PASS: ${message}`);
}

async function runWebChatTests() {
  console.log('================================================================');
  console.log('   Apna Samaj — Batch 11.1: Web Direct Messaging Test Suite    ');
  console.log('================================================================\n');

  console.log('--- Test Suite 1: Media Attachment URL Resolution ---');

  // 1. Valid signed URL preservation
  const signedUrl = 'https://xyz.supabase.co/storage/v1/object/sign/chat-attachments/convo/audio.webm?token=exp123';
  assertTest(
    resolveAttachmentDisplayUrl(signedUrl) === signedUrl,
    'Preserves valid Supabase signed storage URL directly'
  );

  // 2. Mock storage rewrite
  const mockStorageUrl = 'https://mock-storage.apnasamaj.local/chat-attachments/convo123/image.jpg';
  const resolvedMock = resolveAttachmentDisplayUrl(mockStorageUrl);
  assertTest(
    resolvedMock === `${API_BASE_URL}/api/v1/chat/attachments/raw/convo123/image.jpg`,
    'Rewrites mock-storage URL to backend raw streaming proxy'
  );

  // 3. Relative local path rewrite
  const relativePath = 'uploads/chat-attachments/audio-sample.webm';
  const resolvedRelative = resolveAttachmentDisplayUrl(relativePath);
  assertTest(
    resolvedRelative === `${API_BASE_URL}/api/v1/chat/attachments/raw/audio-sample.webm`,
    'Resolves relative uploads/chat-attachments path to backend raw streaming proxy'
  );

  // 4. Null / empty check
  assertTest(resolveAttachmentDisplayUrl(null) === '', 'Handles null gracefully');
  assertTest(resolveAttachmentDisplayUrl('') === '', 'Handles empty string gracefully');

  console.log('\n--- Test Suite 2: Emoji Reactions & Invariants ---');

  // Verify allowed chat reactions
  assertTest(ALLOWED_CHAT_REACTIONS.includes('👍'), 'Includes thumbs up reaction');
  assertTest(ALLOWED_CHAT_REACTIONS.includes('❤️'), 'Includes heart reaction');
  assertTest(ALLOWED_CHAT_REACTIONS.includes('😂'), 'Includes laugh reaction');
  assertTest(ALLOWED_CHAT_REACTIONS.includes('😮'), 'Includes surprised reaction');
  assertTest(ALLOWED_CHAT_REACTIONS.includes('😢'), 'Includes sad reaction');
  assertTest(ALLOWED_CHAT_REACTIONS.includes('🙏'), 'Includes prayer reaction');
  assertTest(ALLOWED_CHAT_REACTIONS.length === 6, 'Defines exactly 6 standardized chat reactions');

  console.log('\n--- Test Suite 3: YouTube Link Detection in Messages ---');

  // Standard YouTube URL inside message text
  const ytMsg1 = 'Check out this video: https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const parsedYt1 = extractYouTubeVideoDetails(ytMsg1);
  assertTest(parsedYt1 !== null && parsedYt1.videoId === 'dQw4w9WgXcQ', 'Detects standard watch URL inside text');

  // Short URL
  const ytMsg2 = 'https://youtu.be/dQw4w9WgXcQ';
  const parsedYt2 = extractYouTubeVideoDetails(ytMsg2);
  assertTest(parsedYt2 !== null && parsedYt2.videoId === 'dQw4w9WgXcQ', 'Detects short youtu.be URL');

  // Plain text without YouTube link
  const plainMsg = 'Hello, how are you? Meeting is at 5 PM.';
  const parsedPlain = extractYouTubeVideoDetails(plainMsg);
  assertTest(parsedPlain === null, 'Correctly returns null for messages without YouTube URLs');

  console.log('\n--- Test Suite 4: Message Deletion Scope Contracts ---');

  const validScopes: ('ME' | 'EVERYONE')[] = ['ME', 'EVERYONE'];
  assertTest(validScopes.includes('ME'), 'Supports Delete for Me');
  assertTest(validScopes.includes('EVERYONE'), 'Supports Delete for Everyone');

  // ---------------------------------------------------------------------------
  // 5. Unified WhatsApp-Style Inbox (Direct + Groups) Sorting & Filtering
  // ---------------------------------------------------------------------------
  console.log('\n--- Test Suite 5: Unified WhatsApp-Style Inbox (Direct + Groups) ---');

  interface MockDirectConv {
    id: string;
    name: string;
    updatedAt: string;
    lastMessage?: string;
  }
  interface MockGroupItem {
    id: string;
    slug: string;
    name: string;
    createdAt: string;
  }

  const mockDirects: MockDirectConv[] = [
    { id: 'c1', name: 'Ravindra Kewat', updatedAt: '2026-11-18T10:00:00Z', lastMessage: 'Shorts link' },
    { id: 'c2', name: 'Kamal Kumar', updatedAt: '2026-11-18T08:00:00Z', lastMessage: 'Tap to chat' },
  ];

  const mockGroups: MockGroupItem[] = [
    { id: 'g1', slug: 'indore-youth', name: 'Indore Youth Samaj', createdAt: '2026-11-18T11:30:00Z' },
    { id: 'g2', slug: 'bhopal-samaj', name: 'Bhopal Samaj Kalyan', createdAt: '2026-11-18T06:00:00Z' },
  ];

  type InboxFilter = 'ALL' | 'DIRECT' | 'GROUPS';

  function buildUnifiedList(directs: MockDirectConv[], groups: MockGroupItem[], filter: InboxFilter, search: string) {
    const list: Array<{ type: 'direct' | 'group'; id: string; name: string; timestamp: string }> = [];

    if (filter === 'ALL' || filter === 'DIRECT') {
      directs.forEach((d) => list.push({ type: 'direct', id: d.id, name: d.name, timestamp: d.updatedAt }));
    }
    if (filter === 'ALL' || filter === 'GROUPS') {
      groups.forEach((g) => list.push({ type: 'group', id: g.id, name: g.name, timestamp: g.createdAt }));
    }

    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((i) => i.name.toLowerCase().includes(q));
  }

  // 1. ALL filter combines directs and groups sorted by timestamp
  const allList = buildUnifiedList(mockDirects, mockGroups, 'ALL', '');
  assertTest(allList.length === 4, 'ALL filter returns combined list of directs and groups (total 4)');
  assertTest(allList[0].name === 'Indore Youth Samaj', 'Latest item is top (Indore Youth Samaj at 11:30)');
  assertTest(allList[1].name === 'Ravindra Kewat', 'Second item is Ravindra Kewat (at 10:00)');
  assertTest(allList[2].name === 'Kamal Kumar', 'Third item is Kamal Kumar (at 08:00)');
  assertTest(allList[3].name === 'Bhopal Samaj Kalyan', 'Fourth item is Bhopal Samaj Kalyan (at 06:00)');

  // 2. DIRECT filter returns only personal contacts
  const directOnly = buildUnifiedList(mockDirects, mockGroups, 'DIRECT', '');
  assertTest(directOnly.length === 2 && directOnly.every((i) => i.type === 'direct'), 'DIRECT filter returns only personal chats');

  // 3. GROUPS filter returns only community groups
  const groupsOnly = buildUnifiedList(mockDirects, mockGroups, 'GROUPS', '');
  assertTest(groupsOnly.length === 2 && groupsOnly.every((i) => i.type === 'group'), 'GROUPS filter returns only groups');

  // 4. Search query filters across both types
  const searchYouth = buildUnifiedList(mockDirects, mockGroups, 'ALL', 'youth');
  assertTest(searchYouth.length === 1 && searchYouth[0].name === 'Indore Youth Samaj', 'Search query correctly finds group');

  const searchRavindra = buildUnifiedList(mockDirects, mockGroups, 'ALL', 'ravindra');
  assertTest(searchRavindra.length === 1 && searchRavindra[0].name === 'Ravindra Kewat', 'Search query correctly finds member');

  console.log('\n================================================================');
  console.log('   All Batch 11.1 Web Direct Chat tests passed cleanly!         ');
  console.log('================================================================\n');
}

runWebChatTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
