import Realm from 'realm';
import { groupByUuid } from '@/relisten/util/group_by';
import { Artist } from '@/relisten/realm/models/artist';
import { Show } from '@/relisten/realm/models/show';

function attachShowsToArtists(
  realm: Realm,
  shows: Iterable<Show>,
  artistsByUuid: Record<string, Artist>
): number {
  const showsWithAvailableArtists = Array.from(shows).filter(
    (show) => !show.artist && artistsByUuid[show.artistUuid]
  );
  let attached = 0;

  if (showsWithAvailableArtists.length === 0) {
    return attached;
  }

  const writeHandler = () => {
    for (const show of showsWithAvailableArtists) {
      show.artist = artistsByUuid[show.artistUuid];
      attached += 1;
    }
  };

  if (realm.isInTransaction) {
    writeHandler();
  } else {
    realm.write(writeHandler);
  }

  return attached;
}

export function attachShowArtists(realm: Realm, shows: Iterable<Show>): number {
  const showsNeedingArtists = Array.from(shows).filter((show) => !show.artist);

  if (showsNeedingArtists.length === 0) {
    return 0;
  }

  const artistUuids = [...new Set(showsNeedingArtists.map((show) => show.artistUuid))];
  const artistsByUuid = groupByUuid(
    Array.from(realm.objects(Artist).filtered('uuid in $0', artistUuids))
  );

  return attachShowsToArtists(realm, showsNeedingArtists, artistsByUuid);
}

export function attachArtistsToExistingShows(realm: Realm, artists: Iterable<Artist>): number {
  const artistsByUuid = groupByUuid(Array.from(artists));

  if (Object.keys(artistsByUuid).length === 0) {
    return 0;
  }

  return attachShowsToArtists(realm, realm.objects(Show).filtered('artist == nil'), artistsByUuid);
}
