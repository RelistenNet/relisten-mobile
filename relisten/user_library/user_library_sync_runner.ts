import Realm from 'realm';
import {
  RelistenUserLibraryApiClient,
  safeUserLibraryErrorMessage,
} from '@/relisten/api/user_library_client';
import { getActiveUserDataScope } from '@/relisten/user_library/active_user_data_scope_service';
import { UserDataScopeKind } from '@/relisten/user_library/user_data_scope';
import {
  pullUserLibrarySync,
  UserLibraryPlaylistSyncApplier,
} from '@/relisten/user_library/playlist_sync';
import {
  ReplayPlaylistOperationsResult,
  UserLibraryPlaylistOperationReplayService,
} from '@/relisten/user_library/playlist_operation_outbox';
import {
  UploadPlaybackHistoryResult,
  UserLibraryPlaybackHistoryUploadService,
} from '@/relisten/user_library/playback_history_batch';

export type UserLibrarySyncRunReason =
  | 'mount'
  | 'scope-change'
  | 'network'
  | 'foreground'
  | 'history'
  | 'manual';

export type UserLibrarySyncRunStatus = 'completed' | 'skipped' | 'already_running' | 'failed';
export type UserLibrarySyncSkipReason =
  | 'missing_scope'
  | 'signed_out'
  | 'missing_auth_session'
  | 'session_scope_mismatch'
  | 'stale_scope';

export interface UserLibrarySyncRunOptions {
  now?: Date;
  maxOperations?: number;
}

export interface UserLibrarySyncRunResult {
  status: UserLibrarySyncRunStatus;
  reason: UserLibrarySyncRunReason;
  scopeId?: string;
  skipReason?: UserLibrarySyncSkipReason;
  replay?: ReplayPlaylistOperationsResult;
  historyUpload?: UploadPlaybackHistoryResult;
  cursorBefore?: string;
  cursorAfter?: string;
  error?: string;
}

export interface UserLibrarySyncRunnerAuthSession {
  withAuthenticatedSessionRetry<T>(
    request: (
      session:
        | {
            accessToken: string;
            scopeId: string;
          }
        | undefined
    ) => Promise<T>,
    options?: { expectedScopeId?: string }
  ): Promise<T>;
}

// Serializes sync-loop network work for the active authenticated scope.
// Local outbox/history writes are pushed before pull sync so the stored cursor
// only advances after this device's pending mutations have had a chance to
// reconcile with the server.
export class UserLibrarySyncRunner {
  private inFlight: Promise<UserLibrarySyncRunResult> | undefined;
  private inFlightScopeId: string | undefined;
  private pendingRun:
    | {
        reason: UserLibrarySyncRunReason;
        options: UserLibrarySyncRunOptions;
      }
    | undefined;

  constructor(
    private readonly realm: Realm,
    private readonly client: RelistenUserLibraryApiClient,
    private readonly authSession: UserLibrarySyncRunnerAuthSession
  ) {}

  runOnce(
    reason: UserLibrarySyncRunReason,
    options: UserLibrarySyncRunOptions = {}
  ): Promise<UserLibrarySyncRunResult> {
    if (this.inFlight) {
      // Scope-changing and user-initiated work should not be dropped. Collapse
      // repeated triggers into one pending run so React/Realm notifier bursts do
      // not start overlapping sync loops.
      if (this.shouldQueuePendingRun(reason)) {
        this.pendingRun = { reason, options };
      }

      return Promise.resolve({
        status: 'already_running',
        reason,
      });
    }

    return this.startRun(reason, options);
  }

  private startRun(
    reason: UserLibrarySyncRunReason,
    options: UserLibrarySyncRunOptions
  ): Promise<UserLibrarySyncRunResult> {
    const run = this.runOnceUnlocked(reason, options).finally(() => {
      if (this.inFlight === run) {
        this.inFlight = undefined;
        this.inFlightScopeId = undefined;

        const pendingRun = this.pendingRun;
        this.pendingRun = undefined;

        if (pendingRun) {
          void this.startRun(pendingRun.reason, pendingRun.options);
        }
      }
    });
    this.inFlight = run;

    return run;
  }

  private async runOnceUnlocked(
    reason: UserLibrarySyncRunReason,
    options: UserLibrarySyncRunOptions
  ): Promise<UserLibrarySyncRunResult> {
    const activeScope = getActiveUserDataScope(this.realm);

    if (!activeScope) {
      return {
        status: 'skipped',
        reason,
        skipReason: 'missing_scope',
      };
    }

    const scopeId = activeScope.scopeId;
    this.inFlightScopeId = scopeId;

    if (activeScope.scopeKind !== UserDataScopeKind.Authenticated) {
      return {
        status: 'skipped',
        reason,
        scopeId,
        skipReason: 'signed_out',
      };
    }

    try {
      return await this.authSession.withAuthenticatedSessionRetry(
        (session) =>
          this.isActiveAuthenticatedScope(scopeId)
            ? this.runAuthenticated(scopeId, reason, session, options)
            : Promise.resolve(this.staleScopeResult(reason, scopeId)),
        { expectedScopeId: scopeId }
      );
    } catch (error) {
      return {
        status: 'failed',
        reason,
        scopeId,
        error: safeUserLibraryErrorMessage(error),
      };
    }
  }

  private async runAuthenticated(
    scopeId: string,
    reason: UserLibrarySyncRunReason,
    session: { accessToken: string; scopeId: string } | undefined,
    options: UserLibrarySyncRunOptions
  ): Promise<UserLibrarySyncRunResult> {
    const applier = new UserLibraryPlaylistSyncApplier(this.realm);
    const replayService = new UserLibraryPlaylistOperationReplayService(this.realm, this.client);
    const historyUploadService = new UserLibraryPlaybackHistoryUploadService(
      this.realm,
      this.client
    );

    if (!this.isActiveAuthenticatedScope(scopeId)) {
      return this.staleScopeResult(reason, scopeId);
    }

    if (!session) {
      return {
        status: 'skipped',
        reason,
        scopeId,
        skipReason: 'missing_auth_session',
      };
    }

    if (session.scopeId !== scopeId) {
      return {
        status: 'skipped',
        reason,
        scopeId,
        skipReason: 'session_scope_mismatch',
      };
    }

    const replay = await replayService.replayPending(scopeId, {
      accessToken: session.accessToken,
      throwAuthenticationErrors: true,
      shouldContinue: () => this.isActiveAuthenticatedScope(scopeId),
      now: options.now,
      maxOperations: options.maxOperations,
    });

    if (!this.isActiveAuthenticatedScope(scopeId)) {
      return this.staleScopeResult(reason, scopeId);
    }

    const historyUpload = await historyUploadService.flushPending(scopeId, {
      accessToken: session.accessToken,
      throwAuthenticationErrors: true,
      shouldContinue: () => this.isActiveAuthenticatedScope(scopeId),
      now: options.now,
    });

    if (!this.isActiveAuthenticatedScope(scopeId)) {
      return this.staleScopeResult(reason, scopeId);
    }

    const cursorBefore = applier.getCursor(scopeId)?.cursor;
    const response = await pullUserLibrarySync(this.client, cursorBefore, {
      accessToken: session.accessToken,
    });

    if (!this.isActiveAuthenticatedScope(scopeId)) {
      return this.staleScopeResult(reason, scopeId);
    }

    applier.applyPullResponse(scopeId, response);

    return {
      status: 'completed',
      reason,
      scopeId,
      replay,
      historyUpload,
      cursorBefore,
      cursorAfter: applier.getCursor(scopeId)?.cursor,
    };
  }

  private shouldQueuePendingRun(reason: UserLibrarySyncRunReason) {
    if (reason === 'scope-change' || reason === 'history' || reason === 'manual') {
      return true;
    }

    const activeScope = getActiveUserDataScope(this.realm);
    return (
      activeScope?.scopeKind === UserDataScopeKind.Authenticated &&
      activeScope.scopeId !== this.inFlightScopeId
    );
  }

  private isActiveAuthenticatedScope(scopeId: string) {
    const activeScope = getActiveUserDataScope(this.realm);

    // Network calls can outlive sign-out/scope switches. Every phase checks this
    // before applying server data so a stale async response cannot write into
    // the wrong active account.
    return (
      activeScope?.scopeKind === UserDataScopeKind.Authenticated && activeScope.scopeId === scopeId
    );
  }

  private staleScopeResult(
    reason: UserLibrarySyncRunReason,
    scopeId: string
  ): UserLibrarySyncRunResult {
    return {
      status: 'skipped',
      reason,
      scopeId,
      skipReason: 'stale_scope',
    };
  }
}
