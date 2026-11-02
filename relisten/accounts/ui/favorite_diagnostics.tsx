import { useAccountScope } from '@/relisten/accounts/account_context';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SectionHeader } from '@/relisten/components/section_header';
import {
  FAVORITE_TARGET_KINDS,
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
import {
  catalogIdForFavoriteTarget,
  catalogReferenceForFavoriteTarget,
} from '@/relisten/library/favorite_catalog_target';
import { NormalizedSong, NormalizedVenue } from '@/relisten/realm/models/v4_catalog';

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
  const favoriteCounts = FAVORITE_TARGET_KINDS.flatMap((targetKind) => {
    const count = activeFavorites.filter((favorite) => favorite.targetKind === targetKind).length;
    return count > 0 ? [`${targetKind.replace('_', ' ')} ${count}`] : [];
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
    favoriteCatalogObjectExists(realm, favorite.targetKind, favorite.targetId)
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
  targetKind: (typeof FAVORITE_TARGET_KINDS)[number],
  targetId: string
) {
  const target = { kind: targetKind, id: targetId };
  const catalogId = catalogIdForFavoriteTarget(target);
  if (!catalogId) {
    return false;
  }
  if (targetKind === 'song') {
    return !!realm.objectForPrimaryKey(NormalizedSong, catalogId);
  }
  if (targetKind === 'venue') {
    return !!realm.objectForPrimaryKey(NormalizedVenue, catalogId);
  }

  const reference = catalogReferenceForFavoriteTarget(target);
  if (!reference) {
    return false;
  }

  switch (reference.catalog_type) {
    case 'artist':
      return !!realm.objectForPrimaryKey(Artist, reference.catalog_uuid);
    case 'show':
      return !!realm.objectForPrimaryKey(Show, reference.catalog_uuid);
    case 'source':
      return !!realm.objectForPrimaryKey(Source, reference.catalog_uuid);
    case 'source_track':
      return !!realm.objectForPrimaryKey(SourceTrack, reference.catalog_uuid);
    case 'song':
      return !!realm.objectForPrimaryKey(Song, reference.catalog_uuid);
    case 'tour':
      return !!realm.objectForPrimaryKey(Tour, reference.catalog_uuid);
    case 'venue':
      return !!realm.objectForPrimaryKey(Venue, reference.catalog_uuid);
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
