import Realm from 'realm';
import { clearRefreshTokenEnvelope } from '@/relisten/accounts/auth/secure_tokens';
import { clearPendingAuthTransaction } from '@/relisten/accounts/auth/pkce_transaction';
import {
  AccountIdentityUpgradeState,
  TYPED_ACCOUNT_IDENTITY_UPGRADE_VERSION,
} from '@/relisten/realm/models/accounts/account_identity_upgrade_state';
import {
  ANONYMOUS_ACCOUNT_SCOPE_ID,
  AccountProfile,
  ActiveAccountScope,
  PendingUsernameCommand,
} from '@/relisten/realm/models/accounts';
import {
  AnonymousFavoriteImport,
  AnonymousFavoriteImportState,
  FavoriteMutation,
  FavoriteSyncState,
  UserFavorite,
} from '@/relisten/realm/models/library';
import {
  CatalogFavoriteTargetKind,
  favoriteTargetForCatalogReference,
  favoriteTargetForCatalogUuid,
  V3FavoriteCatalogType,
} from '@/relisten/library/favorite_catalog_target';
import { anonymousFavoriteSourceFingerprint } from '@/relisten/library/anonymous_favorite_import_fingerprint';
import { formatUuidTypedId } from '@/relisten/util/typed_uuid_id';

type ClearLegacyAccountStorage = () => Promise<void>;

type StagedFavoriteKind = V3FavoriteCatalogType | CatalogFavoriteTargetKind;

const STAGED_FAVORITE_KINDS: ReadonlySet<string> = new Set([
  'artist',
  'show',
  'source',
  'source_track',
  'track',
  'song',
  'imported_song',
  'tour',
  'venue',
  'imported_venue',
]);

const upgradeByRealmPath = new Map<string, Promise<void>>();

async function clearLegacyAccountStorage(): Promise<void> {
  // Keep these sequential. If either operation fails, no unobserved deletion remains in
  // flight when startup retries and eventually permits a new sign-in.
  await clearRefreshTokenEnvelope();
  await clearPendingAuthTransaction();
}

function hasCompletedUpgrade(realm: Realm) {
  return !!realm.objectForPrimaryKey(
    AccountIdentityUpgradeState,
    TYPED_ACCOUNT_IDENTITY_UPGRADE_VERSION
  );
}

function typedTarget(kind: StagedFavoriteKind, uuid: string) {
  if (kind === 'track' || kind === 'imported_song' || kind === 'imported_venue') {
    return favoriteTargetForCatalogUuid(kind, uuid);
  }

  return favoriteTargetForCatalogReference({ catalog_type: kind, catalog_uuid: uuid });
}

function typedScopeId(legacyScopeId: string): string | null {
  const rawUserId = legacyScopeId.startsWith('user:') ? legacyScopeId.slice('user:'.length) : null;
  if (!rawUserId) {
    return null;
  }

  try {
    return formatUuidTypedId('user', rawUserId);
  } catch {
    return null;
  }
}

function typedImportFingerprint(serialized: string): string | null {
  let targetKeys: unknown;
  try {
    targetKeys = JSON.parse(serialized);
  } catch {
    return null;
  }
  if (!Array.isArray(targetKeys)) {
    return null;
  }

  const targets = [];
  for (const targetKey of targetKeys) {
    if (typeof targetKey !== 'string') {
      return null;
    }
    const separator = targetKey.indexOf(':');
    const kind = targetKey.slice(0, separator);
    const id = targetKey.slice(separator + 1);
    if (separator <= 0 || !id || !STAGED_FAVORITE_KINDS.has(kind)) {
      return null;
    }

    try {
      targets.push(typedTarget(kind as StagedFavoriteKind, id));
    } catch {
      return null;
    }
  }

  return anonymousFavoriteSourceFingerprint(
    targets.map((target) => ({ targetKind: target.kind, targetId: target.id }))
  );
}

function migrateRealmAccountState(realm: Realm, completedAt: Date) {
  const anonymousFavorites = realm
    .objects(UserFavorite)
    .filtered('scopeId == $0', ANONYMOUS_ACCOUNT_SCOPE_ID)
    .map((favorite) => ({
      favoriteId: formatUuidTypedId('favorite', favorite.favoriteId),
      target: typedTarget(favorite.targetKind as StagedFavoriteKind, favorite.targetId),
      acknowledgedPresent: favorite.acknowledgedPresent,
      effectivePresent: favorite.effectivePresent,
      acknowledgedRevision: favorite.acknowledgedRevision,
      lastLocalSequence: favorite.lastLocalSequence,
      serverCreatedAt: favorite.serverCreatedAt,
      serverUpdatedAt: favorite.serverUpdatedAt,
      createdAt: favorite.createdAt,
      updatedAt: favorite.updatedAt,
    }));

  realm.delete(realm.objects(UserFavorite));
  realm.delete(realm.objects(FavoriteMutation));
  realm.delete(realm.objects(FavoriteSyncState));
  realm.delete(realm.objects(AccountProfile));
  realm.delete(realm.objects(ActiveAccountScope));
  realm.delete(realm.objects(PendingUsernameCommand));

  for (const favorite of anonymousFavorites) {
    realm.create(UserFavorite, {
      favoriteId: favorite.favoriteId,
      scopeId: ANONYMOUS_ACCOUNT_SCOPE_ID,
      targetKind: favorite.target.kind,
      targetId: favorite.target.id,
      acknowledgedPresent: favorite.acknowledgedPresent,
      effectivePresent: favorite.effectivePresent,
      acknowledgedRevision: favorite.acknowledgedRevision,
      lastLocalSequence: favorite.lastLocalSequence,
      serverCreatedAt: favorite.serverCreatedAt,
      serverUpdatedAt: favorite.serverUpdatedAt,
      createdAt: favorite.createdAt,
      updatedAt: favorite.updatedAt,
    });
  }

  for (const receipt of [...realm.objects(AnonymousFavoriteImport)]) {
    const destinationScopeId = typedScopeId(receipt.destinationScopeId);
    const sourceFingerprint = typedImportFingerprint(receipt.sourceFingerprint);
    if (!destinationScopeId || !sourceFingerprint) {
      realm.delete(receipt);
      continue;
    }

    receipt.destinationScopeId = destinationScopeId;
    receipt.sourceFingerprint = sourceFingerprint;
    if (receipt.state === AnonymousFavoriteImportState.Importing) {
      receipt.state = AnonymousFavoriteImportState.Deferred;
      receipt.completedAt = undefined;
      receipt.updatedAt = completedAt;
    }
  }

  realm.create(AccountIdentityUpgradeState, {
    version: TYPED_ACCOUNT_IDENTITY_UPGRADE_VERSION,
    completedAt,
  });
}

type LegacyFieldRename = readonly [oldName: string, newName: string];

function stageRenamedFields(
  oldRealm: Realm,
  newRealm: Realm,
  modelName: string,
  renames: ReadonlyArray<LegacyFieldRename>
) {
  const oldSchema = oldRealm.schema.find((schema) => schema.name === modelName);
  if (!oldSchema || !renames.some(([oldName]) => oldSchema.properties[oldName])) {
    return;
  }

  const oldObjects = oldRealm.objects(modelName);
  const newObjects = newRealm.objects(modelName);
  for (let index = 0; index < oldObjects.length; index += 1) {
    const source = oldObjects[index] as unknown as Record<string, unknown>;
    const destination = newObjects[index] as unknown as Record<string, unknown>;
    for (const [oldName, newName] of renames) {
      destination[newName] = source[oldName];
    }
  }
}

/** Carries raw alpha values across Realm property renames; the startup gate converts or clears them. */
export function stageLegacyAccountIdentityFields(oldRealm: Realm, newRealm: Realm): void {
  stageRenamedFields(oldRealm, newRealm, 'AccountProfile', [['userUuid', 'userId']]);
  stageRenamedFields(oldRealm, newRealm, 'ActiveAccountScope', [['userUuid', 'userId']]);
  stageRenamedFields(oldRealm, newRealm, 'PendingUsernameCommand', [['commandUuid', 'commandId']]);
  stageRenamedFields(oldRealm, newRealm, 'UserFavorite', [
    ['favoriteUuid', 'favoriteId'],
    ['catalogType', 'targetKind'],
    ['catalogUuid', 'targetId'],
  ]);
  stageRenamedFields(oldRealm, newRealm, 'FavoriteMutation', [
    ['mutationUuid', 'mutationId'],
    ['favoriteUuid', 'favoriteId'],
    ['catalogType', 'targetKind'],
    ['catalogUuid', 'targetId'],
  ]);
}

async function performUpgrade(
  realm: Realm,
  clearSecureStorage: ClearLegacyAccountStorage
): Promise<void> {
  if (hasCompletedUpgrade(realm)) {
    return;
  }

  await clearSecureStorage();

  if (hasCompletedUpgrade(realm)) {
    return;
  }

  realm.write(() => migrateRealmAccountState(realm, new Date()));
}

/**
 * Clears the unreleased UUID account client once, before any auth service can start.
 * Calls for the same Realm path share one retained promise so a slower cleanup can
 * never arrive after a newer attempt has enabled sign-in.
 */
export function upgradeTypedAccountIdentity(
  realm: Realm,
  clearSecureStorage: ClearLegacyAccountStorage = clearLegacyAccountStorage
): Promise<void> {
  if (hasCompletedUpgrade(realm)) {
    return Promise.resolve();
  }

  const existing = upgradeByRealmPath.get(realm.path);
  if (existing) {
    return existing;
  }

  const attempt = performUpgrade(realm, clearSecureStorage);
  upgradeByRealmPath.set(realm.path, attempt);
  void attempt.catch(() => {
    if (upgradeByRealmPath.get(realm.path) === attempt) {
      upgradeByRealmPath.delete(realm.path);
    }
  });
  return attempt;
}
