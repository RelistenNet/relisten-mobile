import Realm from 'realm';
import { createUuidV7 } from '@/relisten/util/uuid_v7';
import { FavoriteCatalogType, UserFavorite } from '@/relisten/realm/models/library';
import { ANONYMOUS_ACCOUNT_SCOPE_ID } from '@/relisten/realm/models/accounts';

const LEGACY_FAVORITE_MODELS: ReadonlyArray<{
  modelName: string;
  catalogType: FavoriteCatalogType;
}> = [
  { modelName: 'Artist', catalogType: 'artist' },
  { modelName: 'Show', catalogType: 'show' },
  { modelName: 'Source', catalogType: 'source' },
  { modelName: 'SourceTrack', catalogType: 'source_track' },
  { modelName: 'Song', catalogType: 'song' },
  { modelName: 'Tour', catalogType: 'tour' },
  { modelName: 'Venue', catalogType: 'venue' },
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

  for (const { modelName, catalogType } of LEGACY_FAVORITE_MODELS) {
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
        favoriteUuid: createUuidV7(),
        scopeId: ANONYMOUS_ACCOUNT_SCOPE_ID,
        catalogType,
        catalogUuid,
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
