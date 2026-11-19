import { describe, expect, it } from 'vitest';
import type { PlaylistSnapshot } from '@/relisten/playlists/playlist_operations';
import {
  assertDescriptionLength,
  assertGuideLimits,
  GuideLimitError,
  normalizeGuideText,
  rewriteEntryLinks,
} from './guide_text';

const OLD = 'playlist_entry_01k8000000e008000000000004';
const NEW = 'playlist_entry_01k8000000e008000000000009';

describe('guide text', () => {
  it('normalizes like the server: trimmed, NFC, blank is none', () => {
    expect(normalizeGuideText('  Cafe\u0301  ')).toBe('Caf\u00e9');
    expect(normalizeGuideText('   ')).toBeUndefined();
    expect(normalizeGuideText(null)).toBeUndefined();
  });

  it('limits one description by characters, not UTF-16 units', () => {
    expect(() => assertDescriptionLength('🎸'.repeat(2_000))).not.toThrow();
    expect(() => assertDescriptionLength('a'.repeat(2_001))).toThrow(GuideLimitError);
  });

  it('limits prose-only segments and total bytes, counting the playlist description', () => {
    const proseOnly: PlaylistSnapshot = {
      segments: new Map(
        Array.from({ length: 101 }, (_, i) => [
          `s${i}`,
          { segmentId: `s${i}`, rank: `a${i}`, description: 'x' },
        ])
      ),
      entries: new Map(),
    };
    expect(() => assertGuideLimits(proseOnly)).toThrow(GuideLimitError);

    const heavy: PlaylistSnapshot = {
      segments: new Map([['s', { segmentId: 's', rank: 'a0', description: 'é'.repeat(2_000) }]]),
      entries: new Map(),
    };
    expect(() => assertGuideLimits(heavy, 'x'.repeat(196_001))).toThrow(GuideLimitError);
    expect(() => assertGuideLimits(heavy, 'x'.repeat(196_000))).not.toThrow();
  });

  it('rewrites only the exact entry-link prefix', () => {
    const text = `[Hear it](#entry=${OLD}&t=6:42) and \`#entry=${OLD}&t=\` but not ${OLD}.`;
    expect(rewriteEntryLinks(text, new Map([[OLD, NEW]]))).toBe(
      `[Hear it](#entry=${NEW}&t=6:42) and \`#entry=${NEW}&t=\` but not ${OLD}.`
    );
  });
});
