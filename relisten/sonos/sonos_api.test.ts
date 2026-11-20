import { describe, expect, it, vi } from 'vitest';

vi.mock('@/relisten/util/logging', () => ({
  log: { extend: () => ({ info: vi.fn(), warn: vi.fn() }) },
}));

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes,
}));

import { groupSonosHouseholds, type SonosGroup } from './sonos_api';

const room = (householdId: string, name: string): SonosGroup => ({
  householdId,
  id: `${householdId}-${name}`,
  name,
});

describe('groupSonosHouseholds', () => {
  it('lists each household by its first room, keeping rooms in name order', () => {
    const groups = [
      room('lake', 'Deck'),
      room('home', 'Kitchen'),
      room('lake', 'Loft'),
      room('home', 'Office'),
    ];

    expect(groupSonosHouseholds(groups)).toEqual([
      [room('lake', 'Deck'), room('lake', 'Loft')],
      [room('home', 'Kitchen'), room('home', 'Office')],
    ]);
  });
});
