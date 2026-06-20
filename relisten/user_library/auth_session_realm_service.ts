import Realm from 'realm';
import { UserAuthSessionMetadata } from '@/relisten/realm/models/user_library/auth';
import { setActiveUserDataScope } from '@/relisten/user_library/active_user_data_scope_service';
import {
  authenticatedUserDataScopeId,
  DEFAULT_ANONYMOUS_DEVICE_ID,
  scopedUserDataPrimaryKey,
  UserDataScopeKind,
} from '@/relisten/user_library/user_data_scope';
import {
  UserLibraryAuthSessionError,
  UserLibraryAuthTokenResponse,
} from '@/relisten/user_library/auth_session';

export interface UserLibrarySessionMetadataReference {
  scopeId: string;
  sessionUuid: string;
}

export interface ApplyUserLibraryAuthSessionOptions {
  authenticatedAt?: Date;
  refreshedAt?: Date;
  provider?: string;
}

export interface MarkUserLibrarySessionSignedOutOptions {
  anonymousDeviceId?: string;
  signedOutAt?: Date;
}

export function userLibrarySessionMetadataScopedId(scopeId: string, sessionUuid: string) {
  return scopedUserDataPrimaryKey(scopeId, `session:${sessionUuid}`);
}

export class UserLibraryAuthSessionRealmService {
  constructor(private readonly realm: Realm) {}

  applySignInResponse(
    response: UserLibraryAuthTokenResponse,
    options: ApplyUserLibraryAuthSessionOptions = {}
  ): UserAuthSessionMetadata {
    return this.applyTokenResponse(response, 'sign-in', options);
  }

  applyRefreshResponse(
    response: UserLibraryAuthTokenResponse,
    options: ApplyUserLibraryAuthSessionOptions = {}
  ): UserAuthSessionMetadata {
    return this.applyTokenResponse(response, 'refresh', options);
  }

  markSignedOut(
    reference: UserLibrarySessionMetadataReference,
    options: MarkUserLibrarySessionSignedOutOptions = {}
  ): UserAuthSessionMetadata | null {
    const signedOutAt = options.signedOutAt ?? new Date();

    return this.write(() => {
      const metadata = this.getSessionMetadata(reference);

      if (metadata) {
        metadata.signedOutAt = signedOutAt;
      }

      setActiveUserDataScope(
        this.realm,
        {
          kind: UserDataScopeKind.Anonymous,
          deviceId: options.anonymousDeviceId ?? DEFAULT_ANONYMOUS_DEVICE_ID,
        },
        {
          activatedAt: signedOutAt,
        }
      );

      return metadata;
    });
  }

  getSessionMetadata(
    reference: UserLibrarySessionMetadataReference
  ): UserAuthSessionMetadata | null {
    return this.realm.objectForPrimaryKey(
      UserAuthSessionMetadata,
      userLibrarySessionMetadataScopedId(reference.scopeId, reference.sessionUuid)
    );
  }

  private applyTokenResponse(
    response: UserLibraryAuthTokenResponse,
    event: 'sign-in' | 'refresh',
    options: ApplyUserLibraryAuthSessionOptions
  ): UserAuthSessionMetadata {
    const scopeId = validatedAuthenticatedScopeId(response);
    const sessionLastUsedAt = parseServerDate(
      response.session.last_used_at,
      'session.last_used_at'
    );
    const sessionCreatedAt = parseServerDate(response.session.created_at, 'session.created_at');
    const reference = {
      scopeId,
      sessionUuid: response.session.session_uuid,
    };

    return this.write(() => {
      const existing = this.getSessionMetadata(reference);

      if (event === 'refresh' && existing?.signedOutAt) {
        throw new UserLibraryAuthSessionError('session_signed_out');
      }

      setActiveUserDataScope(
        this.realm,
        {
          kind: UserDataScopeKind.Authenticated,
          userUuid: response.user.user_uuid,
        },
        {
          activatedAt: sessionLastUsedAt,
          displayName: response.user.display_name ?? response.user.username,
        }
      );

      const metadata =
        existing ??
        this.realm.create(UserAuthSessionMetadata, {
          scopedId: userLibrarySessionMetadataScopedId(scopeId, response.session.session_uuid),
          scopeId,
          lastAuthenticatedAt:
            event === 'sign-in' ? (options.authenticatedAt ?? sessionLastUsedAt) : sessionCreatedAt,
        });

      metadata.scopeId = scopeId;
      metadata.userUuid = response.user.user_uuid;
      metadata.sessionUuid = response.session.session_uuid;
      metadata.deviceId = response.session.device_id;
      metadata.provider = options.provider ?? metadata.provider;
      metadata.username = response.user.username;
      metadata.displayName = response.user.display_name ?? undefined;
      metadata.signedOutAt = undefined;

      if (event === 'sign-in') {
        metadata.lastAuthenticatedAt = options.authenticatedAt ?? sessionLastUsedAt;
        metadata.lastRefreshAt = undefined;
      } else {
        metadata.lastAuthenticatedAt = existing?.lastAuthenticatedAt ?? sessionCreatedAt;
        metadata.lastRefreshAt = options.refreshedAt ?? sessionLastUsedAt;
      }

      return metadata;
    });
  }

  private write<T>(callback: () => T): T {
    return this.realm.isInTransaction ? callback() : this.realm.write(callback);
  }
}

function validatedAuthenticatedScopeId(response: UserLibraryAuthTokenResponse) {
  const expectedScopeId = authenticatedUserDataScopeId(response.user.user_uuid);

  if (response.user.scope_id !== expectedScopeId) {
    throw new UserLibraryAuthSessionError('scope_mismatch');
  }

  return expectedScopeId;
}

function parseServerDate(value: string, label: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new UserLibraryAuthSessionError(`invalid_${label}`);
  }

  return date;
}
