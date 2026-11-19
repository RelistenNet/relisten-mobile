import {
  AccountsApiError,
  type AuthorizedAccountsApiClient,
} from '@/relisten/accounts/api/accounts_api_client';
import { createUuidV7TypedId } from '@/relisten/util/typed_uuid_id';
import { jsonRequest } from './accounts_http';
import {
  parsePublicSnapshot,
  type PlaylistCreatedResponse,
  type PlaylistPublicationResponse,
  type PublicPlaylistSnapshot,
} from './sharing_wire';

/**
 * The sharing requests. Each is online-only and never queued, except Make a
 * Copy, whose command is stored first (see playlist_copies).
 */

/**
 * Reads a public playlist without credentials, or null when it isn't
 * available. Private, taken-down and missing playlists all answer the same 404.
 */
export async function fetchPublicSnapshot(
  api: AuthorizedAccountsApiClient,
  publicCode: string
): Promise<PublicPlaylistSnapshot | null> {
  try {
    const response = await api.requestAnonymously<unknown>(`/v1/public-playlists/${publicCode}`);
    return parsePublicSnapshot(response, publicCode);
  } catch (error) {
    if (error instanceof AccountsApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/** Makes an owned playlist public or private. A publish returns its stable code. */
export function requestPublication(
  api: AuthorizedAccountsApiClient,
  playlistId: string,
  published: boolean
): Promise<PlaylistPublicationResponse> {
  return api.request<PlaylistPublicationResponse>(
    `/v1/playlists/${playlistId}/publication`,
    jsonRequest('PUT', {
      contract_version: 1,
      command_id: createUuidV7TypedId('command'),
      published,
    })
  );
}

export function requestFollow(api: AuthorizedAccountsApiClient, publicCode: string) {
  return api.request<void>(`/v1/public-playlists/${publicCode}/follow`, { method: 'PUT' });
}

/** Succeeds even if the follow is already gone or the playlist was deleted. */
export function requestUnfollow(api: AuthorizedAccountsApiClient, playlistId: string) {
  return api.request<void>(`/v1/playlists/${playlistId}/follow`, { method: 'DELETE' });
}

/** Sends a stored copy command. A retry with its ID returns the copy already made. */
export function requestCopy(
  api: AuthorizedAccountsApiClient,
  publicCode: string,
  commandId: string
): Promise<PlaylistCreatedResponse> {
  return api.request<PlaylistCreatedResponse>(
    `/v1/public-playlists/${publicCode}/copy`,
    jsonRequest('POST', { contract_version: 1, command_id: commandId })
  );
}

export function requestReport(
  api: AuthorizedAccountsApiClient,
  publicCode: string,
  reason: string
) {
  return api.request<void>(
    `/v1/public-playlists/${publicCode}/reports`,
    jsonRequest('POST', { reason })
  );
}
