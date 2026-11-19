import Realm from 'realm';
import {
  AccountsApiError,
  type AuthorizedAccountsApiClient,
} from '@/relisten/accounts/api/accounts_api_client';
import {
  type AccountScopeCapture,
  type AccountScopeSource,
  StaleAccountScopeError,
} from '@/relisten/accounts/account_context';
import { FavoriteSyncState } from '@/relisten/realm/models/library/favorite_sync_state';
import { Playlist } from '@/relisten/realm/models/playlists/playlist';
import { recordPublication } from '@/relisten/playlists/sync/playlist_sync_state';
import {
  applyFollowChanges,
  applyFollowedHeads,
  writeFollowedSnapshot,
} from './followed_playlists';
import { copyCommandFor, dropCopyCommand, finishCopy, isFinalCopyRefusal } from './playlist_copies';
import {
  fetchPublicSnapshot,
  requestCopy,
  requestFollow,
  requestPublication,
  requestReport,
  requestUnfollow,
} from './sharing_requests';
import type { PublicPlaylistSnapshot } from './sharing_wire';

/** Why a sharing action didn't happen, for the screen to explain. */
export type SharingFailure =
  /** The playlist was removed after a report and can't be shared. */
  | 'taken_down'
  /** It isn't public any more, or never was. */
  | 'unavailable'
  /** The account can't follow or hold any more playlists. */
  | 'full'
  /** Too many reports in a minute. */
  | 'rate_limited'
  /** No connection, or the server had trouble: try again. */
  | 'retry';

export class SharingError extends Error {
  constructor(readonly failure: SharingFailure) {
    super(`Playlist sharing failed: ${failure}`);
    this.name = 'SharingError';
  }
}

/**
 * The listener's sharing actions: publishing, following, copying and
 * reporting. Each needs the internet and the signed-in account, and none is
 * queued except Make a Copy (see playlist_copies). A request that finishes
 * after an account switch writes nothing.
 *
 * Follow and Unfollow write the confirmed change at once so the screen
 * doesn't wait for the library feed, which then delivers the same change.
 */
export class PlaylistSharingService {
  constructor(
    private readonly realm: Realm,
    private readonly api: AuthorizedAccountsApiClient,
    private readonly scopes: AccountScopeSource,
    /** Pulls the library feed, which carries follows and new copies. */
    private readonly refreshLibrary: () => void,
    /** Sends and pulls playlists now, which fetches a new copy's contents. */
    private readonly syncPlaylists: () => void
  ) {}

  /** The public playlist behind a link, or null when it isn't available. Works signed out. */
  async publicSnapshot(publicCode: string): Promise<PublicPlaylistSnapshot | null> {
    try {
      return await fetchPublicSnapshot(this.api, publicCode);
    } catch (error) {
      throw toSharingError(error);
    }
  }

  /** Makes an owned playlist public or private. Returns its link code when public. */
  async setPublished(playlistId: string, published: boolean): Promise<string | null> {
    const capture = this.signedIn();
    let response;
    try {
      response = await requestPublication(this.api, playlistId, published);
    } catch (error) {
      if (problemCode(error) === 'playlist_taken_down') {
        this.write(capture, () => {
          const playlist = this.realm.objectForPrimaryKey(Playlist, playlistId);
          if (playlist) {
            playlist.takenDown = true;
          }
        });
        throw new SharingError('taken_down');
      }
      throw toSharingError(error);
    }

    this.write(capture, () => {
      const playlist = this.realm.objectForPrimaryKey(Playlist, playlistId);
      if (playlist) {
        recordPublication(playlist, {
          public_code: response.public_code ?? playlist.publicCode,
          published: response.published,
          taken_down: playlist.takenDown,
        });
      }
    });
    return response.public_code;
  }

  /**
   * Follows a public playlist. With the snapshot the screen already shows,
   * the followed copy is ready at once, offline included.
   */
  async follow(snapshot: PublicPlaylistSnapshot) {
    const capture = this.signedIn();
    try {
      await requestFollow(this.api, snapshot.public_code);
    } catch (error) {
      throw toSharingError(error);
    }

    this.write(capture, () => {
      const userId = capture.userId!;
      applyFollowChanges(this.realm, userId, [
        { playlistId: snapshot.playlist_id, followed: true },
      ]);
      applyFollowedHeads(this.realm, userId, [
        {
          playlist_id: snapshot.playlist_id,
          available: true,
          public_code: snapshot.public_code,
          name: snapshot.metadata.name,
          owner: snapshot.owner,
          revision: snapshot.revision,
        },
      ]);
      const playlist = this.realm.objectForPrimaryKey(Playlist, snapshot.playlist_id);
      if (
        playlist?.access === 'follower' &&
        playlist.libraryUserId === userId &&
        this.isLibraryGeneration(userId, snapshot.history_generation)
      ) {
        writeFollowedSnapshot(this.realm, playlist, snapshot);
      }
    });
    this.refreshLibrary();
  }

  async unfollow(playlistId: string) {
    const capture = this.signedIn();
    try {
      await requestUnfollow(this.api, playlistId);
    } catch (error) {
      throw toSharingError(error);
    }
    this.write(capture, () =>
      applyFollowChanges(this.realm, capture.userId!, [{ playlistId, followed: false }])
    );
    this.refreshLibrary();
  }

  /**
   * Copies a public playlist into the listener's account and returns the
   * copy's ID. Its contents arrive with the next playlist sync, started here.
   */
  async copy(publicCode: string, name: string): Promise<string> {
    const capture = this.signedIn();
    const userId = capture.userId!;
    const commandId = this.write(
      capture,
      () => copyCommandFor(this.realm, userId, publicCode).commandId
    );

    let created;
    try {
      created = await requestCopy(this.api, publicCode, commandId);
    } catch (error) {
      if (isFinalCopyRefusal(error)) {
        this.write(capture, () => dropCopyCommand(this.realm, commandId));
      }
      throw toSharingError(error);
    }

    this.write(capture, () => finishCopy(this.realm, userId, commandId, created, name));
    this.syncPlaylists();
    this.refreshLibrary();
    return created.playlist_id;
  }

  async report(publicCode: string, reason: string) {
    this.signedIn();
    try {
      await requestReport(this.api, publicCode, reason);
    } catch (error) {
      throw toSharingError(error);
    }
  }

  private isLibraryGeneration(userId: string, generation: string) {
    const known = this.realm
      .objects(FavoriteSyncState)
      .filtered('scopeId == $0', userId)[0]?.historyGeneration;
    return !known || known === generation;
  }

  private signedIn(): AccountScopeCapture {
    const capture = this.scopes.capture();
    if (!capture.isAuthenticated || !capture.userId) {
      throw new AccountsApiError('Sign in to use playlist sharing.', 401, 'signed_out', false);
    }
    return capture;
  }

  private write<T>(capture: AccountScopeCapture, callback: () => T): T {
    if (!this.scopes.isCurrent(capture)) {
      throw new StaleAccountScopeError();
    }
    return this.realm.write(callback);
  }
}

function problemCode(error: unknown) {
  return error instanceof AccountsApiError ? error.code : null;
}

function toSharingError(error: unknown): Error {
  if (!(error instanceof AccountsApiError)) {
    return error instanceof Error ? error : new SharingError('retry');
  }
  if (error.status === 404) {
    return new SharingError('unavailable');
  }
  if (error.code === 'quota_exceeded') {
    return new SharingError('full');
  }
  if (error.code === 'playlist_report_rate_limited') {
    return new SharingError('rate_limited');
  }
  if (error.code === 'playlist_taken_down') {
    return new SharingError('taken_down');
  }
  return error.retryable || error.status === null ? new SharingError('retry') : error;
}
