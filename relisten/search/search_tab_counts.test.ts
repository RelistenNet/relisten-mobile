import { describe, expect, it } from 'vitest';
import type { SearchInputs } from './search_session';
import { nextTabTotals, responseTabCounts, showsTabChip, tabCountLabel } from './search_tab_counts';
import type { SearchResponse } from './search_types';
import { SEARCH_INPUTS, searchResponse } from './search_test_fixtures';

const inputs: SearchInputs = { ...SEARCH_INPUTS, query: 'cornell 77' };
const response = (change: Partial<SearchResponse>) =>
  searchResponse({ q: inputs.query, ...change });

// Production's reply to `cornell 77` in All, 2026-11-25.
const cornell = response({
  counts: { shows: 1 },
  count_lower_bounds: { artists: 0, songs: 0, venues: 0, sources: 0, reviews: 12, playlists: 0 },
});

describe('search tab totals', () => {
  it('shows a tab counted only as a minimum, such as Reviews for cornell 77', () => {
    const counts = responseTabCounts(cornell);
    expect(counts.reviews).toEqual({ count: 12, atLeast: true });
    expect(counts.shows).toEqual({ count: 1, atLeast: false });
    expect(tabCountLabel(counts.reviews!)).toBe('12+');
    expect(tabCountLabel(counts.shows!)).toBe('1');

    const chip = (scope: Parameters<typeof showsTabChip>[0]) =>
      showsTabChip(scope, { selected: 'all', counts, moreScopes: [] });
    expect(chip('reviews')).toBe(true);
    expect(chip('shows')).toBe(true);
    expect(chip('sources')).toBe(false);
    expect(chip('artists')).toBe(false);
  });

  it('keeps the other tabs while a tab answers with only its own total', () => {
    const fromAll = nextTabTotals(null, inputs, cornell);
    const reviewsInputs: SearchInputs = { ...inputs, scope: 'reviews' };
    const fromReviews = nextTabTotals(
      fromAll,
      reviewsInputs,
      response({ scope: 'reviews', count_lower_bounds: { reviews: 21 } })
    );

    expect(fromReviews.counts.shows).toEqual({ count: 1, atLeast: false });
    expect(fromReviews.counts.reviews).toEqual({ count: 21, atLeast: true });
  });

  it('starts over for another query or reading', () => {
    const fromAll = nextTabTotals(null, inputs, cornell);
    const next = nextTabTotals(
      fromAll,
      { ...inputs, readingId: 'place:cornell' },
      response({ counts: { sources: 3 } })
    );
    expect(next.counts).toEqual({ sources: { count: 3, atLeast: false } });
  });

  it('keeps the selected tab, tabs with more results, and every tab before any totals', () => {
    const counts = responseTabCounts(response({ count_lower_bounds: { shows: 0 } }));
    expect(showsTabChip('shows', { selected: 'shows', counts, moreScopes: [] })).toBe(true);
    expect(showsTabChip('shows', { selected: 'all', counts, moreScopes: ['shows'] })).toBe(true);
    expect(showsTabChip('shows', { selected: 'all', counts, moreScopes: [] })).toBe(false);
    expect(showsTabChip('artists', { selected: 'all', counts: undefined, moreScopes: [] })).toBe(
      true
    );
    expect(showsTabChip('reviews', { selected: 'all', counts: undefined, moreScopes: [] })).toBe(
      false
    );
  });
});
