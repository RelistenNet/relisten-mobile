import Realm from 'realm';
import { UserAuthSessionMetadata } from '@/relisten/realm/models/user_library/auth';
import {
  getActiveUserDataScope,
  setActiveUserDataScope,
} from '@/relisten/user_library/active_user_data_scope_service';
import {
  DevelopmentSessionRequest,
  UserLibraryAuthTokenResponse,
} from '@/relisten/user_library/auth_session';
import { UserLibraryAuthSessionRealmService } from '@/relisten/user_library/auth_session_realm_service';
import {
  DEFAULT_ANONYMOUS_DEVICE_ID,
  UserDataScopeKind,
} from '@/relisten/user_library/user_data_scope';

export interface UserLibraryDevelopmentAuthSession {
  signInDevelopmentSession(
    request: DevelopmentSessionRequest
  ): Promise<UserLibraryAuthTokenResponse>;
  signOut(): Promise<void>;
}

export interface SignInDevelopmentUserLibraryOptions {
  username: string;
  displayName?: string;
  deviceId?: string;
  deviceName?: string;
  platform?: 'ios' | 'android' | 'web';
  authenticatedAt?: Date;
}

export interface SignOutUserLibraryOptions {
  signedOutAt?: Date;
}

export class UserLibraryDevelopmentAuthController {
  private readonly realmSession: UserLibraryAuthSessionRealmService;

  constructor(
    private readonly realm: Realm,
    private readonly authSession: UserLibraryDevelopmentAuthSession,
    realmSession?: UserLibraryAuthSessionRealmService
  ) {
    this.realmSession = realmSession ?? new UserLibraryAuthSessionRealmService(realm);
  }

  async signIn(options: SignInDevelopmentUserLibraryOptions): Promise<UserAuthSessionMetadata> {
    const request = developmentSessionRequest(options);
    const response = await this.authSession.signInDevelopmentSession(request);

    try {
      return this.realmSession.applySignInResponse(response, {
        authenticatedAt: options.authenticatedAt,
        provider: 'development',
      });
    } catch (error) {
      await this.authSession.signOut().catch(() => {});
      throw error;
    }
  }

  async signOut(options: SignOutUserLibraryOptions = {}): Promise<UserAuthSessionMetadata | null> {
    const metadata = currentUserLibrarySessionMetadata(this.realm);
    let signOutError: unknown;

    try {
      await this.authSession.signOut();
    } catch (error) {
      signOutError = error;
    }

    const signedOutMetadata = this.applyLocalSignOut(metadata, options);

    if (signOutError) {
      throw signOutError;
    }

    return signedOutMetadata;
  }

  private applyLocalSignOut(
    metadata: UserAuthSessionMetadata | null,
    options: SignOutUserLibraryOptions
  ) {
    if (metadata?.sessionUuid) {
      return this.realmSession.markSignedOut(
        {
          scopeId: metadata.scopeId,
          sessionUuid: metadata.sessionUuid,
        },
        {
          anonymousDeviceId: metadata.deviceId ?? undefined,
          signedOutAt: options.signedOutAt,
        }
      );
    }

    setActiveUserDataScope(
      this.realm,
      {
        kind: UserDataScopeKind.Anonymous,
        deviceId: DEFAULT_ANONYMOUS_DEVICE_ID,
      },
      {
        activatedAt: options.signedOutAt,
      }
    );
    return null;
  }
}

export function currentUserLibrarySessionMetadata(realm: Realm): UserAuthSessionMetadata | null {
  const activeScope = getActiveUserDataScope(realm);

  if (activeScope?.scopeKind !== UserDataScopeKind.Authenticated) {
    return null;
  }

  return (
    [...realm.objects(UserAuthSessionMetadata)]
      .filter(
        (metadata) =>
          metadata.scopeId === activeScope.scopeId &&
          !!metadata.sessionUuid &&
          !metadata.signedOutAt
      )
      .sort(compareSessionMetadataNewest)[0] ?? null
  );
}

export function defaultDevelopmentSessionRequest(username: string): DevelopmentSessionRequest {
  return developmentSessionRequest({ username });
}

function developmentSessionRequest(
  options: SignInDevelopmentUserLibraryOptions
): DevelopmentSessionRequest {
  const username = options.username.trim();
  const platform = options.platform ?? platformForDevelopmentSession();
  const deviceId = options.deviceId?.trim() || defaultDevelopmentDeviceId(platform);

  return {
    username,
    display_name: options.displayName?.trim() || username,
    device_id: deviceId,
    device_name: options.deviceName?.trim() || defaultDevelopmentDeviceName(),
    platform,
  };
}

function compareSessionMetadataNewest(
  left: UserAuthSessionMetadata,
  right: UserAuthSessionMetadata
) {
  return latestSessionTimestamp(right) - latestSessionTimestamp(left);
}

function latestSessionTimestamp(metadata: UserAuthSessionMetadata) {
  return (metadata.lastRefreshAt ?? metadata.lastAuthenticatedAt).getTime();
}

function platformForDevelopmentSession(): 'ios' | 'android' | 'web' {
  return 'ios';
}

function defaultDevelopmentDeviceId(platform: 'ios' | 'android' | 'web') {
  return `${platform}-development-device`;
}

function defaultDevelopmentDeviceName() {
  return 'Relisten Development Device';
}
