import Realm from 'realm';
import {
  AccountsApiError,
  type AuthorizedAccountsApiClient,
} from '@/relisten/accounts/api/accounts_api_client';
import type { AccountScopeCapture, AccountScopeSource } from '@/relisten/accounts/account_context';
import { Playlist } from '@/relisten/realm/models/playlists/playlist';
import { recordPublication } from '@/relisten/playlists/sync/playlist_sync_state';
import { isPermanentRejection } from './accounts_http';
import { applyFollowChanges, storeConfirmedFollow } from './followed_playlists';
import { copyCommandFor, dropCopyCommand, finishCopy } from './playlist_copies';
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
  /** Nobody is signed in, or the session ended: sign in and try again. */
  | 'signed_out'
  /** The playlist was removed after a report and can't be shared. */
  | 'taken_down'
  /** It isn't public any more, or never was. */
  | 'unavailable'
  /** The account can't follow or hold any more playlists. */
  | 'full'
  /** Too many reports in a minute. */
  | 'rate_limited'
  /** Anything else: no connection, server trouble, or an answer the app can't use. Try again. */
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
 * queued except Make a Copy (see playlist_copies).
 *
 * Errors: every method rejects only with a `SharingError`, whose `failure`
 * says what to tell the listener. A method that resolves means the server
 * did what was asked.
 *
 * Account switches: a response that arrives after the account changed writes
 * nothing to the device. If the server had confirmed the action, the method
 * still resolves, and the library feed delivers the follow or copy the next
 * time that account syncs. If the switch interrupted the request itself, the
 * outcome is unknown and the method rejects with `retry`.
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
    private readonly refreshLibrary: () => void
  ) {}

  /** The public playlist behind a link, or null when it isn't available. Works signed out. */
  publicSnapshot(publicCode: string): Promise<PublicPlaylistSnapshot | null> {
    return this.send(() => fetchPublicSnapshot(this.api, publicCode));
  }

  /** Makes an owned playlist public or private. Returns its link code when public. */
  async setPublished(playlistId: string, published: boolean): Promise<string | null> {
    const capture = this.requireSignedIn();

    let response;
    try {
      response = await this.send(() => requestPublication(this.api, playlistId, published));
    } catch (error) {
      if (error instanceof SharingError && error.failure === 'taken_down') {
        this.writeIfCurrent(capture, () => {
          const playlist = this.realm.objectForPrimaryKey(Playlist, playlistId);
          if (playlist) {
            playlist.takenDown = true;
          }
        });
      }
      throw error;
    }

    this.writeIfCurrent(capture, () => {
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
    const capture = this.requireSignedIn();
    const userId = capture.userId!;
    await this.send(() => requestFollow(this.api, snapshot.public_code));

    const wroteForCurrentAccount = this.writeIfCurrent(capture, () =>
      storeConfirmedFollow(this.realm, userId, snapshot)
    );
    if (wroteForCurrentAccount) {
      this.refreshLibrary();
    }
  }

  async unfollow(playlistId: string) {
    const capture = this.requireSignedIn();
    await this.send(() => requestUnfollow(this.api, playlistId));

    const wroteForCurrentAccount = this.writeIfCurrent(capture, () =>
      applyFollowChanges(this.realm, capture.userId!, [{ playlistId, followed: false }])
    );
    if (wroteForCurrentAccount) {
      this.refreshLibrary();
    }
  }

  /**
   * Copies a public playlist into the listener's account and returns the
   * copy's ID. Storing the copy wakes the playlist sync, which fetches its
   * contents.
   *
   * The command is stored before it is sent. A failure that isn't final keeps
   * it, so trying again (or the next sync) sends the same command and gets
   * the copy already made instead of a second one.
   */
  async copy(publicCode: string, name: string): Promise<string> {
    const capture = this.requireSignedIn();
    const userId = capture.userId!;
    const commandId = this.realm.write(
      () => copyCommandFor(this.realm, userId, publicCode).commandId
    );

    // Not through `send`: whether to keep the command depends on the raw error.
    let created;
    try {
      created = await requestCopy(this.api, publicCode, commandId);
    } catch (error) {
      if (isPermanentRejection(error)) {
        this.writeIfCurrent(capture, () => dropCopyCommand(this.realm, commandId));
      }
      throw toSharingError(error);
    }

    const wroteForCurrentAccount = this.writeIfCurrent(capture, () =>
      finishCopy(this.realm, userId, commandId, created, name)
    );
    if (wroteForCurrentAccount) {
      this.refreshLibrary();
    }
    return created.playlist_id;
  }

  async report(publicCode: string, reason: string) {
    this.requireSignedIn();
    await this.send(() => requestReport(this.api, publicCode, reason));
  }

  private requireSignedIn(): AccountScopeCapture {
    const capture = this.scopes.capture();
    if (!capture.isAuthenticated || !capture.userId) {
      throw new SharingError('signed_out');
    }
    return capture;
  }

  private async send<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      throw toSharingError(error);
    }
  }

  /**
   * Writes for the account that made the request, and returns whether it did.
   * After an account switch the device shows another library, so nothing is
   * written; the previous account's own sync catches up when it returns.
   */
  private writeIfCurrent(capture: AccountScopeCapture, callback: () => void): boolean {
    if (!this.scopes.isCurrent(capture)) {
      return false;
    }
    this.realm.write(callback);
    return true;
  }
}

/**
 * Names a failed request for the screen. A response the parser rejected and
 * an account switch mid-request are not `AccountsApiError`s; both are `retry`.
 */
function toSharingError(error: unknown): SharingError {
  if (!(error instanceof AccountsApiError)) {
    return new SharingError('retry');
  }
  if (error.status === 401) {
    return new SharingError('signed_out');
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
  return new SharingError('retry');
}
