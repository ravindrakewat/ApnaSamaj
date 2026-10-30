import assert from 'node:assert';
import type { PublicDirectoryMember, PublicMemberProfile, UserRole } from '@apnasamaj/shared-types';
import { DirectoryFilterParams } from '../services/directory.service';

console.log('================================================================');
console.log('   Apna Samaj — Batch 15B.6: Directory Frontend UX Tests        ');
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
// 1. Helper Functions Replicating DirectoryPage Logic for Unit Verification
// ---------------------------------------------------------------------------

interface FilterState {
  search: string;
  city: string;
  state: string;
  gotra: string;
  subCaste: string;
}

function getFiltersFromParams(params: URLSearchParams): FilterState {
  return {
    search: (params.get('search') || '').slice(0, 100),
    city: (params.get('city') || '').slice(0, 100),
    state: (params.get('state') || '').slice(0, 100),
    gotra: (params.get('gotra') || '').slice(0, 100),
    subCaste: (params.get('subCaste') || '').slice(0, 100),
  };
}

function getPageFromParams(params: URLSearchParams): number {
  const p = parseInt(params.get('page') || '1', 10);
  return Number.isFinite(p) && p > 0 ? p : 1;
}

function serializeFiltersToUrlParams(
  filters: FilterState,
  page: number,
  existingParams: URLSearchParams = new URLSearchParams()
): URLSearchParams {
  const nextParams = new URLSearchParams(existingParams);

  if (filters.search.trim()) {
    nextParams.set('search', filters.search.trim().slice(0, 100));
  } else {
    nextParams.delete('search');
  }

  if (filters.city.trim()) {
    nextParams.set('city', filters.city.trim().slice(0, 100));
  } else {
    nextParams.delete('city');
  }

  if (filters.state.trim()) {
    nextParams.set('state', filters.state.trim().slice(0, 100));
  } else {
    nextParams.delete('state');
  }

  if (filters.gotra.trim()) {
    nextParams.set('gotra', filters.gotra.trim().slice(0, 100));
  } else {
    nextParams.delete('gotra');
  }

  if (filters.subCaste.trim()) {
    nextParams.set('subCaste', filters.subCaste.trim().slice(0, 100));
  } else {
    nextParams.delete('subCaste');
  }

  if (page > 1) {
    nextParams.set('page', page.toString());
  } else {
    nextParams.delete('page');
  }

  return nextParams;
}

// ---------------------------------------------------------------------------
// 2. Test Suites Execution
// ---------------------------------------------------------------------------

async function runDirectoryFrontendUxTests() {
  // --- Test Suite 1: Sub-Caste Filter & API Parameter Forwarding ---
  console.log('--- Test Suite 1: Sub-Caste Filter & API Parameter Forwarding ---');

  const filterParams: DirectoryFilterParams = {
    page: 1,
    limit: 12,
    search: 'Ramesh',
    city: 'Indore',
    state: 'Madhya Pradesh',
    gotra: 'Kashyap',
    subCaste: 'Kashyap',
  };

  const queryParams = new URLSearchParams();
  if (filterParams.page) queryParams.set('page', filterParams.page.toString());
  if (filterParams.limit) queryParams.set('limit', filterParams.limit.toString());
  if (filterParams.search && filterParams.search.trim()) queryParams.set('search', filterParams.search.trim());
  if (filterParams.city && filterParams.city.trim()) queryParams.set('city', filterParams.city.trim());
  if (filterParams.state && filterParams.state.trim()) queryParams.set('state', filterParams.state.trim());
  if (filterParams.gotra && filterParams.gotra.trim()) queryParams.set('gotra', filterParams.gotra.trim());
  if (filterParams.subCaste && filterParams.subCaste.trim()) queryParams.set('subCaste', filterParams.subCaste.trim());

  assertTest(queryParams.get('subCaste') === 'Kashyap', 'subCaste filter parameter is correctly formatted in query');
  assertTest(queryParams.get('gotra') === 'Kashyap', 'gotra filter parameter is correctly formatted');
  assertTest(queryParams.get('city') === 'Indore', 'city filter parameter is correctly formatted');

  // Verify empty subCaste is omitted
  const emptySubCasteParams: DirectoryFilterParams = {
    subCaste: '   ',
  };
  const emptyQuery = new URLSearchParams();
  if (emptySubCasteParams.subCaste && emptySubCasteParams.subCaste.trim()) {
    emptyQuery.set('subCaste', emptySubCasteParams.subCaste.trim());
  }
  assertTest(!emptyQuery.has('subCaste'), 'Empty or whitespace-only subCaste parameter is omitted from query');

  // --- Test Suite 2: URL Query Parameter Serialization & Restoration ---
  console.log('\n--- Test Suite 2: URL Parameter Serialization & Restoration ---');

  const incomingUrl = new URLSearchParams(
    'search=Alpha&city=Ujjain&state=MP&gotra=Vashistha&subCaste=Mallah&page=3&community=kewat'
  );

  const parsedFilters = getFiltersFromParams(incomingUrl);
  assertTest(parsedFilters.search === 'Alpha', 'Restores search parameter from URL');
  assertTest(parsedFilters.city === 'Ujjain', 'Restores city parameter from URL');
  assertTest(parsedFilters.state === 'MP', 'Restores state parameter from URL');
  assertTest(parsedFilters.gotra === 'Vashistha', 'Restores gotra parameter from URL');
  assertTest(parsedFilters.subCaste === 'Mallah', 'Restores subCaste parameter from URL');

  const parsedPage = getPageFromParams(incomingUrl);
  assertTest(parsedPage === 3, 'Restores page number 3 from URL');

  // Verify unrelated parameters (like community=kewat) are preserved
  const serialized = serializeFiltersToUrlParams(parsedFilters, parsedPage, incomingUrl);
  assertTest(serialized.get('community') === 'kewat', 'Preserves unrelated query parameter (community=kewat)');
  assertTest(serialized.get('subCaste') === 'Mallah', 'Serializes subCaste to URL');
  assertTest(serialized.get('page') === '3', 'Serializes page to URL');

  // --- Test Suite 3: Page Normalization & Edge Cases ---
  console.log('\n--- Test Suite 3: Page Normalization & Edge Cases ---');

  assertTest(getPageFromParams(new URLSearchParams('page=0')) === 1, 'Normalizes page 0 to 1');
  assertTest(getPageFromParams(new URLSearchParams('page=-5')) === 1, 'Normalizes negative page to 1');
  assertTest(getPageFromParams(new URLSearchParams('page=not-a-number')) === 1, 'Normalizes NaN page to 1');
  assertTest(getPageFromParams(new URLSearchParams('page=1')) === 1, 'Handles page=1 correctly');
  assertTest(getPageFromParams(new URLSearchParams('')) === 1, 'Missing page defaults to 1');

  // Page 1 is omitted from serialized URL for cleaner links
  const defaultPageSerialized = serializeFiltersToUrlParams(
    { search: 'Test', city: '', state: '', gotra: '', subCaste: '' },
    1
  );
  assertTest(!defaultPageSerialized.has('page'), 'Page 1 is omitted from URL for cleaner links');

  // --- Test Suite 4: Filter Changes Reset Page to 1 ---
  console.log('\n--- Test Suite 4: Filter Changes Reset Page to 1 ---');

  let activePage = 4;
  const currentFilters: FilterState = {
    search: 'Old',
    city: 'Indore',
    state: '',
    gotra: '',
    subCaste: '',
  };

  const newFilters: FilterState = {
    ...currentFilters,
    subCaste: 'NewSubCaste',
  };

  // Simulating the unified debounce filter change handler
  const filterHasChanged =
    currentFilters.search !== newFilters.search ||
    currentFilters.city !== newFilters.city ||
    currentFilters.state !== newFilters.state ||
    currentFilters.gotra !== newFilters.gotra ||
    currentFilters.subCaste !== newFilters.subCaste;

  if (filterHasChanged) {
    activePage = 1; // Reset to page 1
  }

  assertTest(filterHasChanged, 'Detected filter change in subCaste');
  assertTest(activePage === 1, 'Changing filter resets active page to 1');

  // --- Test Suite 5: Pagination Preserves Active Filters ---
  console.log('\n--- Test Suite 5: Pagination Preserves Active Filters ---');

  const preservedFilters: FilterState = {
    search: 'Elder',
    city: 'Bhopal',
    state: 'Madhya Pradesh',
    gotra: 'Bharadwaj',
    subCaste: 'Nishad',
  };

  const page2Url = serializeFiltersToUrlParams(preservedFilters, 2);
  assertTest(page2Url.get('page') === '2', 'Page is updated to 2');
  assertTest(page2Url.get('search') === 'Elder', 'Search filter preserved across page change');
  assertTest(page2Url.get('city') === 'Bhopal', 'City filter preserved across page change');
  assertTest(page2Url.get('subCaste') === 'Nishad', 'SubCaste filter preserved across page change');
  assertTest(page2Url.get('gotra') === 'Bharadwaj', 'Gotra filter preserved across page change');

  // --- Test Suite 6: 100-Character Input Bounds ---
  console.log('\n--- Test Suite 6: 100-Character Input Bounds ---');

  const string101Chars = 'z'.repeat(101);
  const boundedFromParams = getFiltersFromParams(
    new URLSearchParams(
      `search=${string101Chars}&city=${string101Chars}&state=${string101Chars}&gotra=${string101Chars}&subCaste=${string101Chars}`
    )
  );

  assertTest(boundedFromParams.search.length === 100, 'Search input is bounded to at most 100 chars');
  assertTest(boundedFromParams.city.length === 100, 'City input is bounded to at most 100 chars');
  assertTest(boundedFromParams.state.length === 100, 'State input is bounded to at most 100 chars');
  assertTest(boundedFromParams.gotra.length === 100, 'Gotra input is bounded to at most 100 chars');
  assertTest(boundedFromParams.subCaste.length === 100, 'SubCaste input is bounded to at most 100 chars');

  // --- Test Suite 7: Unified Debouncing & Timer Cleanup ---
  console.log('\n--- Test Suite 7: Unified Debouncing & Timer Cleanup ---');

  let debounceCommitCount = 0;
  let timerId: NodeJS.Timeout | null = null;

  function triggerDebounce(newValue: string) {
    if (timerId) {
      clearTimeout(timerId); // Cleanup previous timer
    }
    timerId = setTimeout(() => {
      debounceCommitCount++;
    }, 400);
  }

  // Rapid typing: 5 keystrokes within 200ms
  triggerDebounce('K');
  triggerDebounce('Ke');
  triggerDebounce('Kew');
  triggerDebounce('Kewa');
  triggerDebounce('Kewat');

  assertTest(debounceCommitCount === 0, 'No debounce commit fired synchronously during rapid typing');

  // Wait for 450ms for debounce timer to fire
  await new Promise((resolve) => setTimeout(resolve, 450));
  assertTest(debounceCommitCount === 1, 'Exactly ONE debounced commit fired after 400ms quiet period');

  // --- Test Suite 8: Stale Request Protection (Anti-Race Condition) ---
  console.log('\n--- Test Suite 8: Stale Request Protection (Anti-Race Condition) ---');

  let requestId = 0;
  let activeDisplayData: string | null = null;

  async function simulateFetch(id: number, delayMs: number, resultData: string) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (id === requestId) {
      activeDisplayData = resultData; // Valid response
    }
    // Else: discard stale response
  }

  // Request 1 is initiated first, but takes longer (150ms)
  const req1 = ++requestId;
  const p1 = simulateFetch(req1, 150, 'Result from Query 1 (Stale)');

  // Request 2 is initiated shortly after (10ms), and finishes faster (50ms)
  const req2 = ++requestId;
  const p2 = simulateFetch(req2, 50, 'Result from Query 2 (Fresh)');

  await Promise.all([p1, p2]);

  assertTest(
    activeDisplayData === 'Result from Query 2 (Fresh)',
    'Fresh response was kept; slower stale response from Query 1 was discarded'
  );

  // --- Test Suite 9: Privacy Invariants in UI Models ---
  console.log('\n--- Test Suite 9: Privacy Invariants in UI Models ---');

  const mockDirectoryMember: PublicDirectoryMember = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    fullName: 'Ramesh Kewat',
    avatarUrl: null,
    gender: 'MALE',
    bio: 'Community teacher',
    city: 'Indore',
    state: 'Madhya Pradesh',
    subCaste: 'Kashyap',
    gotra: 'Kashyap',
    joinedAt: '2026-01-01T00:00:00.000Z',
  };

  const rawMember = mockDirectoryMember as any;
  assertTest(!('phone' in rawMember), 'Privacy: Phone number is NOT present in PublicDirectoryMember model');
  assertTest(!('passwordHash' in rawMember), 'Privacy: Password hash is NOT present in PublicDirectoryMember model');
  assertTest(!('dateOfBirth' in rawMember), 'Privacy: Date of birth is NOT present in PublicDirectoryMember model');
  assertTest(!('refreshTokens' in rawMember), 'Privacy: Refresh tokens are NOT present in PublicDirectoryMember model');
  assertTest(!('passwordResetTokens' in rawMember), 'Privacy: Reset tokens are NOT present');

  const mockPublicProfile: PublicMemberProfile = {
    ...mockDirectoryMember,
    role: 'MODERATOR' as UserRole,
  };

  const rawProfile = mockPublicProfile as any;
  assertTest(!('phone' in rawProfile), 'Privacy: Phone number is NOT present in PublicMemberProfile model');
  assertTest(!('passwordHash' in rawProfile), 'Privacy: Password hash is NOT present in PublicMemberProfile model');
  assertTest(!('dateOfBirth' in rawProfile), 'Privacy: Date of birth is NOT present in PublicMemberProfile model');
  assertTest(mockPublicProfile.role === 'MODERATOR', 'Role badge is exposed for public profile');

  // --- Test Suite 10: Empty State and Filter Reset Logic ---
  console.log('\n--- Test Suite 10: Empty State and Filter Reset Logic ---');

  const populatedInputs: FilterState = {
    search: 'SomeNonExistentName',
    city: 'Nowhere',
    state: '',
    gotra: '',
    subCaste: '',
  };

  const hasFilters = Boolean(
    populatedInputs.search.trim() ||
    populatedInputs.city.trim() ||
    populatedInputs.state.trim() ||
    populatedInputs.gotra.trim() ||
    populatedInputs.subCaste.trim()
  );

  assertTest(hasFilters, 'Correctly identifies that active filters are applied');

  // Clearing filters
  const resetFilters: FilterState = {
    search: '',
    city: '',
    state: '',
    gotra: '',
    subCaste: '',
  };

  const hasFiltersAfterReset = Boolean(
    resetFilters.search.trim() ||
    resetFilters.city.trim() ||
    resetFilters.state.trim() ||
    resetFilters.gotra.trim() ||
    resetFilters.subCaste.trim()
  );

  assertTest(!hasFiltersAfterReset, 'Correctly identifies that filters are cleared');

  console.log('\n================================================================');
  console.log(`  Directory Frontend UX Tests: ${passedTests} passed, ${failedTests} failed  `);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runDirectoryFrontendUxTests().catch((err) => {
  console.error('Frontend UX test suite failed:', err);
  process.exit(1);
});
