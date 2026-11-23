import { useMemo } from 'react';
import { encodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import { useFavoriteCatalogUuids } from '@/relisten/realm/root_services';
import { useTopPlayedArtistUuidsOnce } from '@/relisten/realm/models/history/playback_history_entry_repo';
import { MAX_BOOST_ARTIST_IDS } from './search_client';

const TOP_PLAYED_BOOSTS = 3;
const NO_PLAYLIST_ARTISTS: readonly string[] = [];

/**
 * The artists a search ranks up, most relevant first: the destination
 * playlist's artists (Add Tracks only), then favorite artists, then the
 * listener's most-played artists. Takes Realm artist UUIDs and returns
 * deduplicated `artist_` IDs, capped at the server's limit.
 */
export function buildBoostArtistIds(
  playlistArtistUuids: Iterable<string>,
  favoriteArtistUuids: Iterable<string>,
  topPlayedArtistUuids: Iterable<string>
): string[] {
  const ordered = new Set<string>();
  const add = (uuids: Iterable<string>) => {
    for (const uuid of uuids) {
      ordered.add(uuid);
    }
  };

  add(playlistArtistUuids);
  add(favoriteArtistUuids);
  add(topPlayedArtistUuids);

  return [...ordered]
    .slice(0, MAX_BOOST_ARTIST_IDS)
    .map((uuid) => encodeUuidCatalogId(uuid, 'artist'));
}

/**
 * The boost list for this listener. The most-played hook is asked for 6
 * though only 3 are used: it shares a module cache with the Artists tab's
 * 6-item call, and whichever call finishes first sets the cached length.
 */
export function useSearchBoostArtistIds(
  playlistArtistUuids: readonly string[] = NO_PLAYLIST_ARTISTS
): string[] {
  const favoriteArtistUuids = useFavoriteCatalogUuids('artist');
  const topPlayed = useTopPlayedArtistUuidsOnce(6);

  return useMemo(
    () =>
      buildBoostArtistIds(
        playlistArtistUuids,
        favoriteArtistUuids,
        topPlayed.slice(0, TOP_PLAYED_BOOSTS)
      ),
    [playlistArtistUuids, favoriteArtistUuids, topPlayed]
  );
}
