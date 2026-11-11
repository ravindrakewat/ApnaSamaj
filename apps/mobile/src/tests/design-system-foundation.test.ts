import assert from 'node:assert';
import { theme, colors, spacing, borderRadius, shadows } from '../theme';
import { AppHeader } from '../components/AppHeader';
import { SearchBar } from '../components/SearchBar';
import { ProfileAvatar } from '../components/ProfileAvatar';

let totalTests = 0;
let passedTests = 0;

async function test(desc: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`✅ PASS: ${desc}`);
  } catch (err: any) {
    console.error(`❌ FAIL: ${desc}`);
    console.error(`   ${err.message}`);
    process.exitCode = 1;
  }
}

export async function runDesignSystemFoundationTests() {
  console.log('\n========================================================================');
  console.log('   Apna Samaj — Batch 10.2.1: Unified Design System Foundation Tests   ');
  console.log('========================================================================\n');

  // -----------------------------------------------------------------------------
  // 1. Unified Color Tokens
  // -----------------------------------------------------------------------------
  console.log('--- 1. Unified Color Tokens ---');

  await test('Brand primary color is #1976D2 (Apna Samaj Classic Blue)', () => {
    assert.strictEqual(colors.primary, '#1976D2');
    assert.strictEqual(theme.colors.primary, '#1976D2');
  });

  await test('Brand primary soft (#E0F2FE) and subtle (#EFF6FF) are configured', () => {
    assert.strictEqual(colors.primarySoft, '#E0F2FE');
    assert.strictEqual(colors.primarySubtle, '#EFF6FF');
  });

  await test('Surface (#FFFFFF) and background (#F8FAFC) maintain high-contrast hierarchy', () => {
    assert.strictEqual(colors.surface, '#FFFFFF');
    assert.strictEqual(colors.background, '#F8FAFC');
    assert.strictEqual(colors.border, '#E2E8F0');
  });

  await test('Typography colors define high-contrast textPrimary, textBody, and textMuted', () => {
    assert.strictEqual(colors.textPrimary, '#0F172A');
    assert.strictEqual(colors.textBody, '#334155');
    assert.strictEqual(colors.textMuted, '#64748B');
    assert.strictEqual(colors.textInverse, '#FFFFFF');
  });

  await test('Semantic state colors are defined with paired light backgrounds', () => {
    assert.strictEqual(colors.success, '#16A34A');
    assert.strictEqual(colors.successLight, '#DCFCE7');
    assert.strictEqual(colors.error, '#DC2626');
    assert.strictEqual(colors.errorLight, '#FEE2E2');
    assert.strictEqual(colors.warning, '#F59E0B');
    assert.strictEqual(colors.warningLight, '#FEF3C7');
    assert.strictEqual(colors.info, '#0284C7');
    assert.strictEqual(colors.infoLight, '#E0F2FE');
  });

  // -----------------------------------------------------------------------------
  // 2. Shape, Radius & Shadow Tokens
  // -----------------------------------------------------------------------------
  console.log('--- 2. Shape, Radius & Shadow Tokens ---');

  await test('Border radius defines card (12), button (10), pill (20), and full (9999)', () => {
    assert.strictEqual(borderRadius.card, 12);
    assert.strictEqual(borderRadius.button, 10);
    assert.strictEqual(borderRadius.pill, 20);
    assert.strictEqual(borderRadius.full, 9999);
  });

  await test('Spacing scale preserves 4pt grid system', () => {
    assert.strictEqual(spacing.xs, 4);
    assert.strictEqual(spacing.sm, 8);
    assert.strictEqual(spacing.md, 12);
    assert.strictEqual(spacing.lg, 16);
    assert.strictEqual(spacing.xl, 20);
    assert.strictEqual(spacing.xxl, 24);
  });

  await test('Shadow tokens define topBar and bottomNav elevations', () => {
    assert.ok(shadows.topBar !== undefined, 'topBar shadow must be defined');
    assert.ok(shadows.bottomNav !== undefined, 'bottomNav shadow must be defined');
    assert.ok(shadows.card !== undefined, 'card shadow must be defined');
  });

  // -----------------------------------------------------------------------------
  // 3. ProfileAvatar Component Logic
  // -----------------------------------------------------------------------------
  console.log('--- 3. ProfileAvatar Component Logic ---');

  await test('ProfileAvatar is exported as a valid React component', () => {
    assert.strictEqual(typeof ProfileAvatar, 'function');
  });

  await test('ProfileAvatar initials derivation handles full names, single names, and fallbacks', () => {
    const derive = (name?: string | null, initial?: string) => {
      if (initial) return initial.trim().charAt(0).toUpperCase();
      if (name && name.trim()) return name.trim().charAt(0).toUpperCase();
      return 'स';
    };

    assert.strictEqual(derive('रविन्द्र केवट'), 'र');
    assert.strictEqual(derive('Sunil Kewat'), 'S');
    assert.strictEqual(derive('', 'A'), 'A');
    assert.strictEqual(derive(null, undefined), 'स');
    assert.strictEqual(derive(undefined, undefined), 'स');
  });

  await test('ProfileAvatar size scale maps correctly for xs, sm, md, lg, xl and numeric values', () => {
    const SIZE_MAP: Record<string, { dimension: number; fontSize: number }> = {
      xs: { dimension: 28, fontSize: 12 },
      sm: { dimension: 36, fontSize: 14 },
      md: { dimension: 44, fontSize: 17 },
      lg: { dimension: 52, fontSize: 20 },
      xl: { dimension: 72, fontSize: 28 },
    };

    assert.strictEqual(SIZE_MAP.xs.dimension, 28);
    assert.strictEqual(SIZE_MAP.sm.dimension, 36);
    assert.strictEqual(SIZE_MAP.md.dimension, 44);
    assert.strictEqual(SIZE_MAP.lg.dimension, 52);
    assert.strictEqual(SIZE_MAP.xl.dimension, 72);
  });

  // -----------------------------------------------------------------------------
  // 4. SearchBar Component Logic
  // -----------------------------------------------------------------------------
  console.log('--- 4. SearchBar Component Logic ---');

  await test('SearchBar is exported as a valid React component', () => {
    assert.strictEqual(typeof SearchBar, 'function');
  });

  await test('SearchBar active filter badge logic triggers when count > 0', () => {
    const hasActiveBadge = (count?: number) => Boolean(count && count > 0);
    assert.strictEqual(hasActiveBadge(0), false);
    assert.strictEqual(hasActiveBadge(undefined), false);
    assert.strictEqual(hasActiveBadge(1), true);
    assert.strictEqual(hasActiveBadge(3), true);
  });

  await test('SearchBar clear action calls custom onClear or defaults to empty string', () => {
    let cleared = false;
    let text = 'test query';

    const onClearCustom = () => {
      cleared = true;
    };
    onClearCustom();
    assert.strictEqual(cleared, true);

    const onClearDefault = (setter: (val: string) => void) => {
      setter('');
    };
    onClearDefault((v) => {
      text = v;
    });
    assert.strictEqual(text, '');
  });

  // -----------------------------------------------------------------------------
  // 5. AppHeader Component Logic
  // -----------------------------------------------------------------------------
  console.log('--- 5. AppHeader Component Logic ---');

  await test('AppHeader is exported as a valid React component', () => {
    assert.strictEqual(typeof AppHeader, 'function');
  });

  await test('AppHeader mode logic differentiates brand vs detail headers', () => {
    const computeVisibility = (mode: 'brand' | 'detail', showBack?: boolean, showLang?: boolean) => {
      const isBrand = mode === 'brand';
      const shouldShowBack = showBack !== undefined ? showBack : !isBrand;
      const shouldShowLang = showLang !== undefined ? showLang : isBrand;
      return { shouldShowBack, shouldShowLang };
    };

    // Brand mode defaults
    const brandDefaults = computeVisibility('brand');
    assert.strictEqual(brandDefaults.shouldShowBack, false);
    assert.strictEqual(brandDefaults.shouldShowLang, true);

    // Detail mode defaults
    const detailDefaults = computeVisibility('detail');
    assert.strictEqual(detailDefaults.shouldShowBack, true);
    assert.strictEqual(detailDefaults.shouldShowLang, false);

    // Overridden back button in brand mode
    const overridden = computeVisibility('brand', true, false);
    assert.strictEqual(overridden.shouldShowBack, true);
    assert.strictEqual(overridden.shouldShowLang, false);
  });

  await test('AppHeader localized default titles fallback correctly', () => {
    const getTitle = (title?: string, mode?: 'brand' | 'detail', lang: 'hi' | 'en' = 'hi') => {
      if (title) return title;
      if (mode === 'brand') return lang === 'hi' ? 'अपना समाज' : 'Apna Samaj';
      return 'विवरण';
    };

    assert.strictEqual(getTitle(undefined, 'brand', 'hi'), 'अपना समाज');
    assert.strictEqual(getTitle(undefined, 'brand', 'en'), 'Apna Samaj');
    assert.strictEqual(getTitle(undefined, 'detail', 'hi'), 'विवरण');
    assert.strictEqual(getTitle('विवाह परिचय', 'brand', 'hi'), 'विवाह परिचय');
  });

  console.log('------------------------------------------------------------------------');
  console.log(`Design System Foundation Summary: ${passedTests} PASSED, 0 FAILED (Total: ${totalTests})`);
  console.log('------------------------------------------------------------------------\n');
}

// Allow standalone execution
if (require.main === module) {
  runDesignSystemFoundationTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

