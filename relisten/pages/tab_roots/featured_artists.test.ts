import { describe, expect, it } from 'vitest';
import { selectFeaturedArtists } from './featured_artists';

function artist(
  uuid: string,
  options: { plays?: number; favorite?: boolean; approved?: boolean; automatic?: boolean } = {}
) {
  return {
    uuid,
    isFavorite: options.favorite ?? false,
    isAutomaticallyCreated: () => options.automatic ?? false,
    isFeatured: () => options.approved ?? false,
    popularity:
      options.plays === undefined ? undefined : { windows: { days30d: { plays: options.plays } } },
  };
}

describe('selectFeaturedArtists', () => {
  it('keeps approved artists beyond the top 50 and avoids duplicates or favorites', () => {
    const ranked = Array.from({ length: 60 }, (_, index) =>
      artist(`ranked-${index}`, { plays: 60 - index, approved: index === 0 || index === 59 })
    );
    const approvedAutomatic = artist('approved-automatic', {
      plays: 0,
      approved: true,
      automatic: true,
    });
    const favorite = artist('favorite', { plays: 1000, favorite: true });
    const unapprovedAutomatic = artist('unapproved-automatic', { plays: 999, automatic: true });

    const selected = selectFeaturedArtists([
      ...ranked,
      approvedAutomatic,
      favorite,
      unapprovedAutomatic,
    ]);
    const uuids = selected.map((item) => item.uuid);

    expect(uuids).toHaveLength(52);
    expect(new Set(uuids).size).toBe(52);
    expect(uuids).toContain('ranked-0');
    expect(uuids).toContain('ranked-49');
    expect(uuids).not.toContain('ranked-50');
    expect(uuids).toContain('ranked-59');
    expect(uuids).toContain('approved-automatic');
    expect(uuids).not.toContain('favorite');
    expect(uuids).not.toContain('unapproved-automatic');
  });

  it('keeps the full catalog fallback when popularity is unavailable', () => {
    const selected = selectFeaturedArtists([
      artist('regular'),
      artist('approved-automatic', { approved: true, automatic: true }),
      artist('unapproved-automatic', { automatic: true }),
      artist('favorite', { favorite: true }),
    ]);

    expect(selected.map((item) => item.uuid)).toEqual(['regular', 'approved-automatic']);
  });
});
