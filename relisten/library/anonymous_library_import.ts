import { ANONYMOUS_ACCOUNT_SCOPE_ID } from '@/relisten/realm/models/accounts';
import {
  AnonymousFavoriteImport,
  AnonymousFavoriteImportState,
  UserFavorite,
} from '@/relisten/realm/models/library';
import { anonymousFavoriteSourceFingerprint } from '@/relisten/library/anonymous_favorite_import_fingerprint';
import {
  FavoriteAccountScopeCapture,
  FavoriteRepository,
  StaleFavoriteAccountScopeError,
  write,
} from '@/relisten/library/favorite_repository';
import { createUuidV7 } from '@/relisten/util/uuid_v7';

export class AnonymousLibraryImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnonymousLibraryImportError';
  }
}

export class AnonymousLibraryImportService {
  constructor(private readonly favoriteRepository: FavoriteRepository) {}

  anonymousFavoriteCount() {
    return this.anonymousFavorites().length;
  }

  receiptForDestination(destinationScopeId: string, sourceFingerprint?: string) {
    const receipts = this.favoriteRepository.realm
      .objects(AnonymousFavoriteImport)
      .filtered('destinationScopeId == $0', destinationScopeId)
      .sorted('createdAt', true);

    return sourceFingerprint
      ? receipts.filtered('sourceFingerprint == $0', sourceFingerprint)[0]
      : receipts[0];
  }

  defer(
    installationUuid: string,
    capture = this.favoriteRepository.captureScope(),
    now = new Date()
  ) {
    this.assertSignedIn(capture);
    const realm = this.favoriteRepository.realm;

    return write(realm, () => {
      this.assertCurrent(capture);
      const anonymousFavorites = this.anonymousFavorites();
      const sourceFingerprint = anonymousFavoriteSourceFingerprint(anonymousFavorites);
      const receipt = this.receiptForBatch(installationUuid, capture.scopeId, sourceFingerprint);
      if (receipt?.state === AnonymousFavoriteImportState.Completed) {
        return receipt;
      }

      if (receipt) {
        receipt.state = AnonymousFavoriteImportState.Deferred;
        receipt.sourceFavoriteCount = anonymousFavorites.length;
        receipt.updatedAt = now;
        return receipt;
      }

      return realm.create(AnonymousFavoriteImport, {
        importUuid: createUuidV7(),
        installationUuid,
        destinationScopeId: capture.scopeId,
        sourceFingerprint,
        state: AnonymousFavoriteImportState.Deferred,
        sourceFavoriteCount: anonymousFavorites.length,
        createdAt: now,
        updatedAt: now,
        completedAt: undefined,
      });
    });
  }

  importToActiveAccount(
    installationUuid: string,
    capture = this.favoriteRepository.captureScope(),
    now = new Date()
  ) {
    this.assertSignedIn(capture);
    const realm = this.favoriteRepository.realm;

    return write(realm, () => {
      this.assertCurrent(capture);
      const anonymousFavorites = [...this.anonymousFavorites()];
      const sourceFingerprint = anonymousFavoriteSourceFingerprint(anonymousFavorites);
      let receipt = this.receiptForBatch(installationUuid, capture.scopeId, sourceFingerprint);

      if (receipt?.state === AnonymousFavoriteImportState.Completed) {
        return receipt;
      }

      if (!receipt) {
        receipt = realm.create(AnonymousFavoriteImport, {
          importUuid: createUuidV7(),
          installationUuid,
          destinationScopeId: capture.scopeId,
          sourceFingerprint,
          state: AnonymousFavoriteImportState.Importing,
          sourceFavoriteCount: anonymousFavorites.length,
          createdAt: now,
          updatedAt: now,
          completedAt: undefined,
        });
      } else {
        receipt.state = AnonymousFavoriteImportState.Importing;
        receipt.sourceFavoriteCount = anonymousFavorites.length;
        receipt.updatedAt = now;
      }

      const result = this.favoriteRepository.setFavorites(
        anonymousFavorites.map((favorite) => ({
          catalogType: favorite.catalogType,
          catalogUuid: favorite.catalogUuid,
          isFavorite: true,
        })),
        { capture, importUuid: receipt.importUuid, now }
      );

      const remainingImportMutations = realm
        .objects('FavoriteMutation')
        .filtered('importUuid == $0', receipt.importUuid);
      if (result.mutationUuids.length === 0 && remainingImportMutations.length === 0) {
        receipt.state = AnonymousFavoriteImportState.Completed;
        receipt.completedAt = now;
        receipt.updatedAt = now;
      }

      return receipt;
    });
  }

  private anonymousFavorites() {
    return this.favoriteRepository.realm
      .objects(UserFavorite)
      .filtered('scopeId == $0 AND effectivePresent == true', ANONYMOUS_ACCOUNT_SCOPE_ID);
  }

  private receiptForBatch(
    installationUuid: string,
    destinationScopeId: string,
    sourceFingerprint: string
  ) {
    return this.favoriteRepository.realm
      .objects(AnonymousFavoriteImport)
      .filtered(
        'installationUuid == $0 AND destinationScopeId == $1 AND sourceFingerprint == $2',
        installationUuid,
        destinationScopeId,
        sourceFingerprint
      )
      .sorted('createdAt', true)[0];
  }

  private assertSignedIn(capture: FavoriteAccountScopeCapture) {
    this.assertCurrent(capture);
    if (capture.scopeId === ANONYMOUS_ACCOUNT_SCOPE_ID) {
      throw new AnonymousLibraryImportError('Anonymous favorites need a signed-in destination.');
    }
  }

  private assertCurrent(capture: FavoriteAccountScopeCapture) {
    if (!this.favoriteRepository.isCaptureCurrent(capture)) {
      throw new StaleFavoriteAccountScopeError();
    }
  }
}
