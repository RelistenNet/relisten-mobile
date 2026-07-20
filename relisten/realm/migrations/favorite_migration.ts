import Realm from 'realm';
import { createUuidV7 } from '@/relisten/util/uuid_v7';
import {
  AnonymousFavoriteImport,
  FavoriteCatalogType,
  UserFavorite,
} from '@/relisten/realm/models/library';
import { ANONYMOUS_ACCOUNT_SCOPE_ID } from '@/relisten/realm/models/accounts';
import { anonymousFavoriteSourceFingerprint } from '@/relisten/library/anonymous_favorite_import_fingerprint';

const LEGACY_FAVORITES_MIGRATION_VERSION = 14;
const IMPORT_BATCH_FINGERPRINT_VERSION = 16;
const FAVORITE_METADATA_SIMPLIFICATION_VERSION = 18;
export const FAVORITES_SCHEMA_VERSION = FAVORITE_METADATA_SIMPLIFICATION_VERSION;

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
 * Realm invokes this while upgrading the app schema. The catalog-flag backfill
 * belongs only to versions before scoped favorites first ship in schema 14.
 * Old catalog flags always belong to the anonymous partition; assigning them to
 * whichever account happens to be active during an upgrade would leak data on a
 * shared device. Schema 16 identifies each anonymous import decision by the
 * source snapshot instead of permanently by installation and account. Schema
 * 17 records whether a failed sync can retry automatically; older ambiguous
 * failures safely require user attention. Schema 18 removes resolver-status
 * state that was incorrectly used as a durable network-playback gate.
 */
export function migrateLegacyFavoritesToAnonymous(
  oldRealm: Realm,
  newRealm: Realm,
  migratedAt = new Date()
) {
  if (oldRealm.schemaVersion < LEGACY_FAVORITES_MIGRATION_VERSION) {
    const oldModelNames = new Set(oldRealm.schema.map((model) => model.name));

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

  if (oldRealm.schemaVersion < IMPORT_BATCH_FINGERPRINT_VERSION) {
    const anonymousFavorites = [
      ...newRealm
        .objects(UserFavorite)
        .filtered('scopeId == $0 AND effectivePresent == true', ANONYMOUS_ACCOUNT_SCOPE_ID),
    ];

    for (const receipt of newRealm.objects(AnonymousFavoriteImport)) {
      const sourceSnapshot = anonymousFavorites.filter(
        (favorite) => favorite.createdAt <= receipt.updatedAt
      );
      receipt.sourceFingerprint = anonymousFavoriteSourceFingerprint(sourceSnapshot);
    }
  }
}
