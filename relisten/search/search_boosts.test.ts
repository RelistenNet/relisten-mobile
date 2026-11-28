import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));
vi.mock('@/relisten/realm/root_services', () => ({ useFavoriteCatalogUuids: vi.fn() }));
vi.mock('@/relisten/realm/models/history/playback_history_entry_repo', () => ({
  useTopPlayedArtistUuidsOnce: vi.fn(),
}));

import { encodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import { buildBoostArtistIds } from './search_boosts';

const uuid = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const id = (n: number) => encodeUuidCatalogId(uuid(n), 'artist');

describe('buildBoostArtistIds', () => {
  it('ranks playlist artists first, then favorites, then most played, without duplicates', () => {
    expect(buildBoostArtistIds([uuid(1), uuid(2)], [uuid(2), uuid(3)], [uuid(3), uuid(4)])).toEqual(
      [id(1), id(2), id(3), id(4)]
    );
  });

  it('sends typed artist_ IDs, not Realm UUIDs', () => {
    const [boost] = buildBoostArtistIds([uuid(1)], [], []);
    expect(boost.startsWith('artist_')).toBe(true);
  });

  it('stops at the server limit of 32', () => {
    const favorites = Array.from({ length: 40 }, (_, n) => uuid(n + 10));
    const boosts = buildBoostArtistIds([uuid(1)], favorites, [uuid(2)]);
    expect(boosts).toHaveLength(32);
    expect(boosts[0]).toBe(id(1));
    expect(boosts).not.toContain(id(2));
  });
});
