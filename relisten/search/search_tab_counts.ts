import type { SearchInputs } from './search_session';
import type { SearchResponse, SearchScope } from './search_types';

/** A tab's total: exact, or a minimum when the server couldn't count them all. */
export interface SearchTabCount {
  count: number;
  atLeast: boolean;
}

export type SearchTabCounts = Partial<Record<SearchScope, SearchTabCount>>;

/**
 * Tab totals for one reading of one query. A scoped response counts only its
 * own tab, so totals from All and from each tab visited are merged while the
 * query, reading, filter and removed chips stay the same. `key` names that
 * combination; the scope isn't part of it.
 */
export interface SearchTabTotals {
  key: string;
  counts: SearchTabCounts;
}

function tabTotalsKey(inputs: SearchInputs): string {
  return JSON.stringify([
    inputs.query.trim(),
    inputs.readingId,
    inputs.artistFilter?.artistId ?? null,
    [...inputs.removedChipKeys].sort(),
  ]);
}

/** `counts` are exact; `count_lower_bounds` fill in the tabs `counts` leaves out. */
export function responseTabCounts(response: SearchResponse): SearchTabCounts {
  const counts: SearchTabCounts = {};
  for (const [scope, count] of Object.entries(response.count_lower_bounds ?? {})) {
    counts[scope as SearchScope] = { count, atLeast: true };
  }
  for (const [scope, count] of Object.entries(response.counts)) {
    counts[scope as SearchScope] = { count, atLeast: false };
  }
  return counts;
}

/** The totals after `response` arrives for `inputs`. Another query starts over. */
export function nextTabTotals(
  previous: SearchTabTotals | null,
  inputs: SearchInputs,
  response: SearchResponse
): SearchTabTotals {
  const key = tabTotalsKey(inputs);
  const counts = responseTabCounts(response);
  if (previous?.key !== key) {
    return { key, counts };
  }
  return { key, counts: { ...previous.counts, ...counts } };
}

/** `24`, or `12+` for a minimum. */
export function tabCountLabel({ count, atLeast }: SearchTabCount): string {
  return atLeast ? `${count}+` : String(count);
}

/**
 * Whether a tab's chip shows. All and the selected tab always do. Another tab
 * shows when it has results, or when `more_scopes` says All left some out.
 * Before any totals arrive, every tab but Reviews shows, so the row doesn't
 * collapse on the first keystroke; Reviews waits for a count because many
 * queries can't match reviews at all.
 */
export function showsTabChip(
  scope: SearchScope,
  {
    selected,
    counts,
    moreScopes,
  }: {
    selected: SearchScope;
    counts: SearchTabCounts | undefined;
    moreScopes: readonly SearchScope[];
  }
): boolean {
  if (scope === 'all' || scope === selected) {
    return true;
  }
  if (!counts) {
    return scope !== 'reviews';
  }
  return (counts[scope]?.count ?? 0) > 0 || moreScopes.includes(scope);
}
