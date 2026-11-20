import { describe, expect, it, vi } from 'vitest';

vi.mock('@/relisten/realm/schema', () => ({ useObject: vi.fn(), useRealm: vi.fn() }));
vi.mock('@/relisten/realm/models/route_filter_config', () => ({
  RouteFilterConfig: class {},
  serializeFilters: vi.fn(),
}));

import { prioritized } from './filters';

describe('prioritized', () => {
  it('lists priority items first, keeping each part in its original order', () => {
    const items = ['b', 'A', 'c', 'B', 'a'];
    expect(prioritized(items, (item) => item === item.toUpperCase())).toEqual([
      'A',
      'B',
      'b',
      'c',
      'a',
    ]);
  });
});
