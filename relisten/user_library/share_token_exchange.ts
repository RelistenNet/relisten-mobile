import { Buffer } from 'buffer';
import Realm from 'realm';
import {
  RelistenUserLibraryApiClient,
  UserLibraryRequestOptions,
} from '@/relisten/api/user_library_client';
import { ActiveUserDataScope } from '@/relisten/realm/models/user_library/scope';
import {
  UserMobileAccessGrant,
  UserPlaylistAccessRole,
} from '@/relisten/realm/models/user_library/playlists';
import {
  ensureAnonymousUserDataScope,
  getActiveUserDataScope,
} from '@/relisten/user_library/active_user_data_scope_service';
import { latestActiveUserLibrarySessionDeviceId } from '@/relisten/user_library/auth_session_realm_service';
import {
  UserLibraryPlaylistResponse,
  UserLibraryPlaylistViewerStateResponse,
} from '@/relisten/user_library/playlist_sync';
import {
  DEFAULT_ANONYMOUS_DEVICE_ID,
  scopedUserDataPrimaryKey,
  UserDataScopeKind,
} from '@/relisten/user_library/user_data_scope';

export const MOBILE_ACCESS_GRANT_HEADER_NAME = 'X-Relisten-Mobile-Grant';
export const MOBILE_ACCESS_GRANT_DEVICE_ID_HEADER_NAME = 'X-Relisten-Device-Id';
export const MOBILE_ACCESS_GRANT_TYPE_SHARE_TOKEN = 'share-token';

export type MobileShareTokenPlatform = 'ios' | 'android' | 'web';

export interface ExchangePlaylistShareTokenRequest {
  token: string;
  device_id: string;
  platform: MobileShareTokenPlatform;
}

export interface PlaylistShareTokenMobileAccessGrantResponse {
  token: string;
  expires_at: string;
  header_name?: string | null;
  grant_uuid?: string | null;
  grant_id?: string | null;
}

export interface PlaylistShareTokenExchangeResponse {
  playlist_uuid?: string;
  short_id?: string | null;
  role?: UserPlaylistAccessRole;
  mobile_access_grant?: PlaylistShareTokenMobileAccessGrantResponse | null;
  playlist?: UserLibraryPlaylistResponse;
  playlist_viewer_state?: UserLibraryPlaylistViewerStateResponse;
  requires_sign_in?: boolean;
}

export interface ParsedMobileAccessGrantToken {
  selector: string;
  secret: string;
}

export interface MobileAccessGrantMetadata {
  tokenSelector: string;
  deviceId: string;
  platform: MobileShareTokenPlatform;
  headerName: typeof MOBILE_ACCESS_GRANT_HEADER_NAME;
  playlistShortId?: string;
  receivedAt: string;
}

export interface MobileAccessGrantSecretStore {
  getGrantSecret(storageKey: string): Promise<string | null>;
  setGrantSecret(storageKey: string, secret: string): Promise<void>;
  clearGrantSecret(storageKey: string): Promise<void>;
}

export interface PersistMobileAccessGrantFromExchangeInput {
  scopeId: string;
  deviceId: string;
  platform: MobileShareTokenPlatform;
  response: PlaylistShareTokenExchangeResponse;
  receivedAt?: Date;
}

export interface BuildMobileAccessGrantHeadersOptions {
  now?: Date;
}

export interface UserLibraryShareTokenExchangeAuthSession {
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

export interface ExchangeOpenedPlaylistShareTokenInput {
  playlistUuidOrShortId: string;
  token: string;
}

export interface ExchangeOpenedPlaylistShareTokenOptions {
  realm: Realm;
  client: RelistenUserLibraryApiClient;
  secretStore: MobileAccessGrantSecretStore;
  platform: MobileShareTokenPlatform;
  authSession?: UserLibraryShareTokenExchangeAuthSession;
  now?: Date;
}

export interface ExchangeOpenedPlaylistShareTokenResult {
  scopeId: string;
  deviceId: string;
  response: PlaylistShareTokenExchangeResponse;
  grant: UserMobileAccessGrant | null;
}

interface OpenedShareTokenScopeSnapshot {
  scopeId: string;
  scopeKind: string;
  deviceId: string;
}

export class PlaylistShareTokenExchangeError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'PlaylistShareTokenExchangeError';
  }
}

export function exchangePlaylistShareToken(
  client: RelistenUserLibraryApiClient,
  playlistUuidOrShortId: string,
  request: ExchangePlaylistShareTokenRequest,
  options?: UserLibraryRequestOptions
): Promise<PlaylistShareTokenExchangeResponse> {
  const playlistKey = requiredTrimmed(playlistUuidOrShortId, 'playlist_uuid_or_short_id');
  const requestBody = validatedShareTokenExchangeRequest(request);

  return client.postJson<PlaylistShareTokenExchangeResponse>(
    `/playlists/${encodeURIComponent(playlistKey)}/share-tokens/exchange`,
    requestBody,
    options
  );
}

export async function exchangeOpenedPlaylistShareToken(
  input: ExchangeOpenedPlaylistShareTokenInput,
  options: ExchangeOpenedPlaylistShareTokenOptions
): Promise<ExchangeOpenedPlaylistShareTokenResult> {
  const playlistKey = requiredTrimmed(input.playlistUuidOrShortId, 'playlist_uuid_or_short_id');
  const token = requiredTrimmed(input.token, 'token');
  const platform = validatedPlatform(options.platform);
  const activeScope = openedShareTokenScopeSnapshot(options.realm);
  const request: ExchangePlaylistShareTokenRequest = {
    token,
    device_id: activeScope.deviceId,
    platform,
  };
  const performExchange = async (
    session: { accessToken: string; scopeId: string } | undefined
  ): Promise<ExchangeOpenedPlaylistShareTokenResult> => {
    const response = await exchangePlaylistShareToken(
      options.client,
      playlistKey,
      request,
      session?.accessToken ? { accessToken: session.accessToken } : undefined
    );

    if (getActiveUserDataScope(options.realm)?.scopeId !== activeScope.scopeId) {
      throw new PlaylistShareTokenExchangeError('scope_changed');
    }

    const grant = await persistMobileAccessGrantFromExchange(options.realm, options.secretStore, {
      scopeId: activeScope.scopeId,
      deviceId: activeScope.deviceId,
      platform,
      response,
      receivedAt: options.now,
    });

    return {
      scopeId: activeScope.scopeId,
      deviceId: activeScope.deviceId,
      response,
      grant,
    };
  };

  if (activeScope.scopeKind === UserDataScopeKind.Authenticated && options.authSession) {
    return options.authSession.withAuthenticatedSessionRetry(performExchange, {
      expectedScopeId: activeScope.scopeId,
    });
  }

  return performExchange(undefined);
}

export function parseMobileAccessGrantToken(token: string): ParsedMobileAccessGrantToken {
  const value = requiredTrimmed(token, 'mobile_access_grant.token');
  const separatorIndex = value.indexOf('.');

  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    throw new PlaylistShareTokenExchangeError('invalid_mobile_access_grant_token');
  }

  const selector = value.slice(0, separatorIndex).trim();
  const secret = value.slice(separatorIndex + 1).trim();

  if (!selector || !secret) {
    throw new PlaylistShareTokenExchangeError('invalid_mobile_access_grant_token');
  }

  return { selector, secret };
}

export function mobileAccessGrantScopedId(scopeId: string, tokenSelector: string): string {
  return scopedUserDataPrimaryKey(
    requiredTrimmed(scopeId, 'scope_id'),
    `${MOBILE_ACCESS_GRANT_TYPE_SHARE_TOKEN}:${requiredTrimmed(tokenSelector, 'token_selector')}`
  );
}

export function mobileAccessGrantSecretStorageKey(scopeId: string, tokenSelector: string): string {
  return [
    'relisten_user_library_mobile_access_grant_v1',
    secureStoreKeyPart(requiredTrimmed(scopeId, 'scope_id')),
    secureStoreKeyPart(requiredTrimmed(tokenSelector, 'token_selector')),
  ].join('.');
}

export async function persistMobileAccessGrantFromExchange(
  realm: Realm,
  secretStore: MobileAccessGrantSecretStore,
  input: PersistMobileAccessGrantFromExchangeInput
): Promise<UserMobileAccessGrant | null> {
  const grantResponse = input.response.mobile_access_grant;

  if (!grantResponse) {
    return null;
  }

  const scopeId = requiredTrimmed(input.scopeId, 'scope_id');
  const deviceId = requiredTrimmed(input.deviceId, 'device_id');
  const platform = validatedPlatform(input.platform);
  const playlistUuid = playlistUuidFromExchangeResponse(input.response);
  const { selector, secret } = parseMobileAccessGrantToken(grantResponse.token);
  const headerName = grantHeaderName(grantResponse.header_name);
  const receivedAt = input.receivedAt ?? new Date();
  const expiresAt = parseServerDate(grantResponse.expires_at, 'mobile_access_grant.expires_at');
  const storageKey = mobileAccessGrantSecretStorageKey(scopeId, selector);
  const metadata: MobileAccessGrantMetadata = {
    tokenSelector: selector,
    deviceId,
    platform,
    headerName,
    playlistShortId: input.response.short_id ?? input.response.playlist?.short_id ?? undefined,
    receivedAt: receivedAt.toISOString(),
  };

  await secretStore.setGrantSecret(storageKey, secret);

  try {
    return writeRealm(realm, () => {
      const scopedId = mobileAccessGrantScopedId(scopeId, selector);
      const existing = realm.objectForPrimaryKey(UserMobileAccessGrant, scopedId);

      return realm.create(
        UserMobileAccessGrant.schema.name,
        {
          scopedId,
          scopeId,
          uuid: grantResponse.grant_uuid ?? grantResponse.grant_id ?? selector,
          playlistUuid,
          role:
            input.response.role ??
            input.response.playlist_viewer_state?.access_role ??
            UserPlaylistAccessRole.Viewer,
          grantType: MOBILE_ACCESS_GRANT_TYPE_SHARE_TOKEN,
          metadataJson: JSON.stringify(metadata),
          createdAt: existing?.createdAt ?? receivedAt,
          updatedAt: receivedAt,
          expiresAt,
          revokedAt: null,
        },
        Realm.UpdateMode.Modified
      ) as unknown as UserMobileAccessGrant;
    });
  } catch (error) {
    await secretStore.clearGrantSecret(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function buildMobileAccessGrantHeaders(
  secretStore: MobileAccessGrantSecretStore,
  grant: UserMobileAccessGrant,
  options: BuildMobileAccessGrantHeadersOptions = {}
): Promise<Record<string, string> | undefined> {
  const now = options.now ?? new Date();

  if (grant.revokedAt || (grant.expiresAt && grant.expiresAt <= now)) {
    return undefined;
  }

  const metadata = mobileAccessGrantMetadata(grant);
  const secret = await secretStore.getGrantSecret(
    mobileAccessGrantSecretStorageKey(grant.scopeId, metadata.tokenSelector)
  );

  if (!secret) {
    return undefined;
  }

  return {
    [metadata.headerName]: `${metadata.tokenSelector}.${secret}`,
    [MOBILE_ACCESS_GRANT_DEVICE_ID_HEADER_NAME]: metadata.deviceId,
  };
}

export function mobileAccessGrantMetadata(grant: UserMobileAccessGrant): MobileAccessGrantMetadata {
  if (!grant.metadataJson) {
    throw new PlaylistShareTokenExchangeError('missing_mobile_access_grant_metadata');
  }

  const value = JSON.parse(grant.metadataJson) as Partial<MobileAccessGrantMetadata>;

  if (
    !value.tokenSelector ||
    !value.deviceId ||
    !value.platform ||
    value.headerName !== MOBILE_ACCESS_GRANT_HEADER_NAME ||
    !value.receivedAt
  ) {
    throw new PlaylistShareTokenExchangeError('invalid_mobile_access_grant_metadata');
  }

  return {
    tokenSelector: value.tokenSelector,
    deviceId: value.deviceId,
    platform: validatedPlatform(value.platform),
    headerName: value.headerName,
    playlistShortId: value.playlistShortId,
    receivedAt: value.receivedAt,
  };
}

function validatedShareTokenExchangeRequest(
  request: ExchangePlaylistShareTokenRequest
): ExchangePlaylistShareTokenRequest {
  return {
    token: requiredTrimmed(request.token, 'token'),
    device_id: requiredTrimmed(request.device_id, 'device_id'),
    platform: validatedPlatform(request.platform),
  };
}

function openedShareTokenScopeSnapshot(realm: Realm): OpenedShareTokenScopeSnapshot {
  const activeScope = getActiveUserDataScope(realm) ?? ensureAnonymousUserDataScope(realm);

  return {
    scopeId: activeScope.scopeId,
    scopeKind: activeScope.scopeKind,
    deviceId: deviceIdForOpenedShareToken(realm, activeScope),
  };
}

function deviceIdForOpenedShareToken(realm: Realm, activeScope: ActiveUserDataScope): string {
  if (activeScope.scopeKind === UserDataScopeKind.Anonymous) {
    return requiredTrimmed(activeScope.deviceId ?? DEFAULT_ANONYMOUS_DEVICE_ID, 'device_id');
  }

  if (activeScope.scopeKind === UserDataScopeKind.Authenticated) {
    return (
      latestActiveUserLibrarySessionDeviceId(realm, activeScope.scopeId) ??
      DEFAULT_ANONYMOUS_DEVICE_ID
    );
  }

  return DEFAULT_ANONYMOUS_DEVICE_ID;
}

function validatedPlatform(platform: string): MobileShareTokenPlatform {
  if (platform === 'ios' || platform === 'android' || platform === 'web') {
    return platform;
  }

  throw new PlaylistShareTokenExchangeError('unsupported_platform');
}

function playlistUuidFromExchangeResponse(response: PlaylistShareTokenExchangeResponse): string {
  return requiredTrimmed(
    response.playlist_uuid ?? response.playlist?.playlist_uuid,
    'playlist_uuid'
  );
}

function grantHeaderName(
  headerName: string | null | undefined
): typeof MOBILE_ACCESS_GRANT_HEADER_NAME {
  const value = headerName ?? MOBILE_ACCESS_GRANT_HEADER_NAME;

  if (value !== MOBILE_ACCESS_GRANT_HEADER_NAME) {
    throw new PlaylistShareTokenExchangeError('unsupported_mobile_access_grant_header');
  }

  return MOBILE_ACCESS_GRANT_HEADER_NAME;
}

function parseServerDate(value: string, label: string) {
  const date = new Date(requiredTrimmed(value, label));

  if (Number.isNaN(date.getTime())) {
    throw new PlaylistShareTokenExchangeError(`invalid_${label}`);
  }

  return date;
}

function requiredTrimmed(value: string | undefined | null, label: string): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new PlaylistShareTokenExchangeError(`${label}_required`);
  }

  return trimmed;
}

function writeRealm<T>(realm: Realm, callback: () => T): T {
  return realm.isInTransaction ? callback() : realm.write(callback);
}

function secureStoreKeyPart(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
