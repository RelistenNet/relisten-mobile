import { useAccountScope } from '@/relisten/accounts/account_context';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SectionHeader } from '@/relisten/components/section_header';
import {
  FAVORITE_CATALOG_TYPES,
  FavoriteMutation,
  FavoriteMutationState,
  FavoriteSyncState,
  UserFavorite,
} from '@/relisten/realm/models/library';
import { useLibraryMembershipIndex } from '@/relisten/realm/root_services';
import { useQuery, useRealm } from '@/relisten/realm/schema';
import { View } from 'react-native';
import { Artist } from '@/relisten/realm/models/artist';
import { Show } from '@/relisten/realm/models/show';
import { Song } from '@/relisten/realm/models/song';
import { Source } from '@/relisten/realm/models/source';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { Tour } from '@/relisten/realm/models/tour';
import { Venue } from '@/relisten/realm/models/venue';

/**
 * Temporary production-visible counters for the first account-sync builds.
 * They intentionally report each layer separately: a server favorite can be
 * present in Realm while missing the catalog metadata needed by My Library.
 */
export function FavoriteDiagnostics() {
  const accountScope = useAccountScope();
  const realm = useRealm();
  const libraryIndex = useLibraryMembershipIndex();
  const favorites = useQuery(
    UserFavorite,
    (query) => query.filtered('scopeId == $0', accountScope.scopeId),
    [accountScope.scopeId]
  );
  const mutations = useQuery(
    FavoriteMutation,
    (query) => query.filtered('scopeId == $0', accountScope.scopeId),
    [accountScope.scopeId]
  );
  const syncStates = useQuery(
    FavoriteSyncState,
    (query) => query.filtered('scopeId == $0', accountScope.scopeId),
    [accountScope.scopeId]
  );

  const activeFavorites = [...favorites].filter((favorite) => favorite.effectivePresent);
  const favoriteCounts = FAVORITE_CATALOG_TYPES.flatMap((catalogType) => {
    const count = activeFavorites.filter((favorite) => favorite.catalogType === catalogType).length;
    return count > 0 ? [`${catalogType.replace('_', ' ')} ${count}`] : [];
  });
  const pendingCount = mutations.filtered('state == $0', FavoriteMutationState.Pending).length;
  const inFlightCount = mutations.filtered('state == $0', FavoriteMutationState.InFlight).length;
  const attentionCount = mutations.filtered(
    'state == $0',
    FavoriteMutationState.NeedsAttention
  ).length;
  const projected = libraryIndex.libraryMembershipCounts();
  const syncState = syncStates[0];
  const resolvedFavoriteCount = activeFavorites.filter((favorite) =>
    favoriteCatalogObjectExists(realm, favorite.catalogType, favorite.catalogUuid)
  ).length;

  return (
    <>
      <SectionHeader title="Library diagnostics" />
      <View className="px-4 py-3">
        <DiagnosticRow
          label="Realm rows"
          value={`${activeFavorites.length} active · ${favorites.length - activeFavorites.length} inactive`}
        />
        <DiagnosticRow label="Favorite types" value={favoriteCounts.join(' · ') || 'none'} />
        <DiagnosticRow
          label="Catalog metadata"
          value={`${resolvedFavoriteCount} / ${activeFavorites.length} favorite rows resolved`}
        />
        <DiagnosticRow
          label="My Library projection"
          value={`${projected.artists} artists · ${projected.years} years · ${projected.shows} shows`}
        />
        <DiagnosticRow
          label="Outbox"
          value={`${pendingCount} pending · ${inFlightCount} sending · ${attentionCount} attention`}
        />
        <DiagnosticRow
          label="Sync position"
          value={
            syncState
              ? `${syncState.runStatus} · revision ${syncState.highestObservedLibraryRevision} · ${syncState.libraryCursor ? 'cursor saved' : 'no cursor'}`
              : 'no local sync state'
          }
        />
      </View>
    </>
  );
}

function favoriteCatalogObjectExists(
  realm: ReturnType<typeof useRealm>,
  catalogType: (typeof FAVORITE_CATALOG_TYPES)[number],
  catalogUuid: string
) {
  switch (catalogType) {
    case 'artist':
      return !!realm.objectForPrimaryKey(Artist, catalogUuid);
    case 'show':
      return !!realm.objectForPrimaryKey(Show, catalogUuid);
    case 'source':
      return !!realm.objectForPrimaryKey(Source, catalogUuid);
    case 'source_track':
      return !!realm.objectForPrimaryKey(SourceTrack, catalogUuid);
    case 'song':
      return !!realm.objectForPrimaryKey(Song, catalogUuid);
    case 'tour':
      return !!realm.objectForPrimaryKey(Tour, catalogUuid);
    case 'venue':
      return !!realm.objectForPrimaryKey(Venue, catalogUuid);
  }
}

function DiagnosticRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="mb-2 flex-row items-start">
      <RelistenText className="w-36 shrink-0 text-sm font-semibold">{label}</RelistenText>
      <RelistenText className="min-w-0 flex-1 text-right text-sm text-gray-400" selectable>
        {value}
      </RelistenText>
    </View>
  );
}
