import Realm from 'realm';
import { createUuidV7 } from '@/relisten/util/uuid_v7';
import { UserFavorite } from '@/relisten/realm/models/library';
import { ANONYMOUS_ACCOUNT_SCOPE_ID } from '@/relisten/realm/models/accounts';

type StagedFavoriteKind =
  | 'artist'
  | 'show'
  | 'source'
  | 'track'
  | 'imported_song'
  | 'imported_venue'
  | 'tour';

const LEGACY_FAVORITE_MODELS: ReadonlyArray<{
  modelName: string;
  targetKind: StagedFavoriteKind;
}> = [
  { modelName: 'Artist', targetKind: 'artist' },
  { modelName: 'Show', targetKind: 'show' },
  { modelName: 'Source', targetKind: 'source' },
  { modelName: 'SourceTrack', targetKind: 'track' },
  { modelName: 'Song', targetKind: 'imported_song' },
  { modelName: 'Tour', targetKind: 'tour' },
  { modelName: 'Venue', targetKind: 'imported_venue' },
];

/**
 * Copy catalog-owned favorite flags into scoped UserFavorite rows.
 * Existing flags belong to the anonymous scope because older app versions had
 * no account ownership information.
 */
export function migrateLegacyFavoritesToAnonymous(
  oldRealm: Realm,
  newRealm: Realm,
  migratedAt = new Date()
) {
  const oldModelNames = new Set(oldRealm.schema.map((model) => model.name));
  // Main's schema 14 still owns catalog flags; accounts' schema 14 already has
  // scoped favorites. Reimporting its compatibility flags would duplicate them.
  if (oldModelNames.has('UserFavorite')) {
    return;
  }

  for (const { modelName, targetKind } of LEGACY_FAVORITE_MODELS) {
    if (!oldModelNames.has(modelName)) {
      continue;
    }

    const legacyFavorites = oldRealm.objects(modelName).filtered('isFavorite == true');

    for (const legacyFavorite of legacyFavorites) {
      const catalogUuid = legacyFavorite.uuid;
      if (typeof catalogUuid !== 'string' || catalogUuid.length === 0) {
        continue;
      }

      newRealm.create(UserFavorite, {
        favoriteId: createUuidV7(),
        scopeId: ANONYMOUS_ACCOUNT_SCOPE_ID,
        targetKind,
        targetId: catalogUuid,
        acknowledgedPresent: true,
        effectivePresent: true,
        acknowledgedRevision: undefined,
        lastLocalSequence: 0,
        serverCreatedAt: undefined,
        serverUpdatedAt: undefined,
        createdAt: migratedAt,
        updatedAt: migratedAt,
      });
    }
  }
}
