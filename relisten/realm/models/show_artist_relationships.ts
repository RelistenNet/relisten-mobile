import Realm from 'realm';
import { groupByUuid } from '@/relisten/util/group_by';
import { Artist } from '@/relisten/realm/models/artist';
import { Show } from '@/relisten/realm/models/show';

function attachShowsToArtists(
  realm: Realm,
  shows: Iterable<Show>,
  artistsByUuid: Record<string, Artist>
): number {
  const showsNeedingArtists = Array.from(shows).filter((show) => !show.artist);
  let attached = 0;

  if (showsNeedingArtists.length === 0) {
    return attached;
  }

  const writeHandler = () => {
    for (const show of showsNeedingArtists) {
      const artist = artistsByUuid[show.artistUuid];
      if (artist) {
        show.artist = artist;
        attached += 1;
      } else {
        // Do not publish a positive API row with a required link still missing.
        show.deletedAt ??= new Date();
        show.isFavorite = false;
      }
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
  const artistUuids = Object.keys(artistsByUuid);

  if (artistUuids.length === 0) {
    return 0;
  }

  return attachShowsToArtists(
    realm,
    realm.objects(Show).filtered('artist == nil AND artistUuid IN $0', artistUuids),
    artistsByUuid
  );
}
