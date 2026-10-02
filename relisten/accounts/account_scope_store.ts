import Realm from 'realm';
import { AccountProfileSnapshot } from './api/account_profile';
import {
  ACTIVE_ACCOUNT_SCOPE_ID,
  ANONYMOUS_ACCOUNT_SCOPE_ID,
  AccountProfile,
  ActiveAccountScope,
} from '@/relisten/realm/models/accounts';

type Listener = () => void;

export interface AccountScopeSnapshot {
  scopeId: string;
  userUuid: string | null;
  generation: number;
  nativeSessionId: string | null;
  isAuthenticated: boolean;
}

export type AccountScopeCapture = AccountScopeSnapshot;

export interface AccountScopeSource {
  subscribe(listener: Listener): () => void;
  getSnapshot(): AccountScopeSnapshot;
  capture(): AccountScopeCapture;
  isCurrent(capture: AccountScopeCapture): boolean;
}

export class StaleAccountScopeError extends Error {
  constructor() {
    super('The active Relisten account changed while this work was running.');
    this.name = 'StaleAccountScopeError';
  }
}

function anonymousSnapshot(generation = 0): AccountScopeSnapshot {
  return Object.freeze({
    scopeId: ANONYMOUS_ACCOUNT_SCOPE_ID,
    userUuid: null,
    generation,
    nativeSessionId: null,
    isAuthenticated: false,
  });
}

function scopeSnapshot(scope: ActiveAccountScope | null): AccountScopeSnapshot {
  if (!scope || !scope.userUuid || !scope.nativeSessionId) {
    return anonymousSnapshot(scope?.generation ?? 0);
  }

  return Object.freeze({
    scopeId: scope.scopeId,
    userUuid: scope.userUuid,
    generation: scope.generation,
    nativeSessionId: scope.nativeSessionId,
    isAuthenticated: true,
  });
}

function sameScope(left: AccountScopeSnapshot, right: AccountScopeSnapshot) {
  return (
    left.scopeId === right.scopeId &&
    left.userUuid === right.userUuid &&
    left.generation === right.generation &&
    left.nativeSessionId === right.nativeSessionId
  );
}

function toRealmProfile(profile: AccountProfileSnapshot) {
  return {
    scopeId: `user:${profile.userUuid}`,
    userUuid: profile.userUuid,
    username: profile.username,
    usernameVersion: profile.usernameVersion,
    usernameReviewNeeded: profile.usernameReviewNeeded,
    usernameReviewedAt: profile.usernameReviewedAt ?? undefined,
    usernameChangeAvailableAt: profile.usernameChangeAvailableAt ?? undefined,
    nativeSessionId: profile.nativeSessionId,
    lastSyncedAt: profile.lastSyncedAt,
  };
}

function fromRealmProfile(profile: AccountProfile): AccountProfileSnapshot {
  return {
    userUuid: profile.userUuid,
    username: profile.username,
    usernameVersion: profile.usernameVersion,
    usernameReviewNeeded: profile.usernameReviewNeeded,
    usernameReviewedAt: profile.usernameReviewedAt ?? null,
    usernameChangeAvailableAt: profile.usernameChangeAvailableAt ?? null,
    nativeSessionId: profile.nativeSessionId,
    lastSyncedAt: profile.lastSyncedAt,
  };
}

export class AccountScopeStore implements AccountScopeSource {
  private readonly listeners = new Set<Listener>();
  private realmScope: ActiveAccountScope | null = null;
  private snapshot: AccountScopeSnapshot;

  constructor(private readonly realm: Realm) {
    this.realmScope = realm.objectForPrimaryKey(ActiveAccountScope, ACTIVE_ACCOUNT_SCOPE_ID);
    this.snapshot = scopeSnapshot(this.realmScope);
  }

  start() {
    if (!this.realmScope) {
      this.realm.write(() => {
        this.realmScope = this.realm.create(ActiveAccountScope, {
          id: ACTIVE_ACCOUNT_SCOPE_ID,
          scopeId: ANONYMOUS_ACCOUNT_SCOPE_ID,
          generation: 0,
          updatedAt: new Date(),
        });
      });
    }

    this.realmScope!.addListener(this.handleRealmScopeChange);
    this.refreshSnapshot();
  }

  tearDown() {
    if (this.realmScope?.isValid()) {
      this.realmScope.removeListener(this.handleRealmScopeChange);
    }

    this.listeners.clear();
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  capture = () => this.snapshot;

  isCurrent = (capture: AccountScopeCapture) => sameScope(capture, this.snapshot);

  isSessionBlocked(nativeSessionId: string) {
    return this.realmScope?.blockedNativeSessionId === nativeSessionId;
  }

  activeProfile(): AccountProfileSnapshot | null {
    const { scopeId, isAuthenticated } = this.snapshot;

    if (!isAuthenticated) {
      return null;
    }

    const profile = this.realm.objectForPrimaryKey(AccountProfile, scopeId);
    return profile ? fromRealmProfile(profile) : null;
  }

  promote(profile: AccountProfileSnapshot): AccountScopeSnapshot {
    const nextGeneration = this.snapshot.generation + 1;
    const scopeId = `user:${profile.userUuid}`;

    this.realm.write(() => {
      this.realm.create(AccountProfile, toRealmProfile(profile), Realm.UpdateMode.Modified);
      const scope = this.realm.create(
        ActiveAccountScope,
        {
          id: ACTIVE_ACCOUNT_SCOPE_ID,
          scopeId,
          userUuid: profile.userUuid,
          generation: nextGeneration,
          nativeSessionId: profile.nativeSessionId,
          updatedAt: new Date(),
        },
        Realm.UpdateMode.Modified
      );
      scope.blockedNativeSessionId = undefined;
    });

    this.refreshSnapshot();
    return this.snapshot;
  }

  updateProfile(capture: AccountScopeCapture, profile: AccountProfileSnapshot) {
    if (!this.isCurrent(capture) || profile.userUuid !== capture.userUuid) {
      throw new StaleAccountScopeError();
    }

    this.realm.write(() => {
      this.realm.create(AccountProfile, toRealmProfile(profile), Realm.UpdateMode.Modified);
    });
  }

  invalidateInFlightWork(): AccountScopeSnapshot {
    const nextGeneration = this.snapshot.generation + 1;

    this.realm.write(() => {
      const scope = this.realmScope!;
      scope.generation = nextGeneration;
      scope.updatedAt = new Date();
    });

    this.refreshSnapshot();
    return this.snapshot;
  }

  selectAnonymous(
    forceGenerationChange = false,
    blockedNativeSessionId?: string
  ): AccountScopeSnapshot {
    if (!forceGenerationChange && !this.snapshot.isAuthenticated) {
      return this.snapshot;
    }

    const nextGeneration = this.snapshot.generation + 1;

    this.realm.write(() => {
      const scope = this.realmScope!;
      scope.scopeId = ANONYMOUS_ACCOUNT_SCOPE_ID;
      scope.userUuid = undefined;
      scope.generation = nextGeneration;
      scope.nativeSessionId = undefined;
      if (blockedNativeSessionId !== undefined) {
        scope.blockedNativeSessionId = blockedNativeSessionId;
      }
      scope.updatedAt = new Date();
    });

    this.refreshSnapshot();
    return this.snapshot;
  }

  private readonly handleRealmScopeChange = () => {
    this.refreshSnapshot();
  };

  private refreshSnapshot() {
    const nextSnapshot = scopeSnapshot(this.realmScope);

    if (sameScope(this.snapshot, nextSnapshot)) {
      return;
    }

    this.snapshot = nextSnapshot;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
