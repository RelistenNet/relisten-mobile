import { useMemo } from 'react';
import { parseUuidTypedId } from '@/relisten/util/typed_uuid_id';
import { Artist } from '@/relisten/realm/models/artist';
import { useRealm } from '@/relisten/realm/schema';
import type { SearchArtistNames } from './search_rows';

/** Looks up artist names on this device for rows that carry only an ID or a slug. */
export function useSearchArtistNames(): SearchArtistNames {
  const realm = useRealm();

  return useMemo(
    () => ({
      byId: (artistId) => {
        const uuid = parseUuidTypedId(artistId, 'artist');
        return uuid ? realm.objectForPrimaryKey(Artist, uuid)?.name : undefined;
      },
      bySlug: (slug) => realm.objects(Artist).filtered('slug == $0', slug)[0]?.name,
    }),
    [realm]
  );
}
