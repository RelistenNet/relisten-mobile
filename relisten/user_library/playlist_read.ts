import Realm from 'realm';
import {
  RelistenUserLibraryApiClient,
  UserLibraryRequestOptions,
} from '@/relisten/api/user_library_client';
import {
  activePlaylistEntriesInQueueOrder,
  QueueV2PlaylistEntryInput,
} from '@/relisten/player/queue_v2';
import { UserMobileAccessGrant } from '@/relisten/realm/models/user_library/playlists';
import {
  applyUserLibraryPlaylistSnapshot,
  UserLibraryPlaylistResponse,
  UserLibraryPlaylistViewerStateResponse,
} from '@/relisten/user_library/playlist_sync';
import {
  buildMobileAccessGrantHeaders,
  MobileAccessGrantSecretStore,
  mobileAccessGrantMetadata,
} from '@/relisten/user_library/share_token_exchange';

export interface ApplyReadUserLibraryPlaylistOptions {
  fetchedAt?: Date;
  viewerState?: UserLibraryPlaylistViewerStateResponse;
}

export interface PlaylistCatalogHydrationPlan<TEntry extends QueueV2PlaylistEntryInput> {
  playableEntries: TEntry[];
  unavailableEntries: TEntry[];
  missingEntries: TEntry[];
  missingSourceTrackUuids: string[];
}

const SOURCE_TRACK_SCHEMA_NAME = 'SourceTrack';

export function getUserLibraryPlaylist(
  client: RelistenUserLibraryApiClient,
  playlistUuidOrShortId: string,
  options: UserLibraryRequestOptions = {}
): Promise<UserLibraryPlaylistResponse> {
  const playlistKey = requiredTrimmed(playlistUuidOrShortId, 'playlist_uuid_or_short_id');
  const requestOptions = userLibraryRequestOptions(options);

  return client.getJson<UserLibraryPlaylistResponse>(
    `/playlists/${encodeURIComponent(playlistKey)}`,
    requestOptions
  );
}

export async function mobileAccessGrantHeadersForPlaylistRead(
  secretStore: MobileAccessGrantSecretStore,
  grants: Iterable<UserMobileAccessGrant>,
  scopeId: string,
  playlistUuidOrShortId: string,
  options: { now?: Date } = {}
): Promise<Record<string, string> | undefined> {
  const activeScopeId = requiredTrimmed(scopeId, 'scope_id');
  const playlistKey = requiredTrimmed(playlistUuidOrShortId, 'playlist_uuid_or_short_id');
  const candidates = [...grants]
    .filter(
      (grant) =>
        grant.scopeId === activeScopeId && mobileAccessGrantMatchesPlaylist(grant, playlistKey)
    )
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());

  for (const grant of candidates) {
    const headers = await buildMobileAccessGrantHeaders(secretStore, grant, options);

    if (headers) {
      return headers;
    }
  }

  return undefined;
}

export function applyReadUserLibraryPlaylistSnapshot(
  realm: Realm,
  scopeId: string,
  playlist: UserLibraryPlaylistResponse,
  options: ApplyReadUserLibraryPlaylistOptions = {}
) {
  const applySnapshot = () => {
    applyUserLibraryPlaylistSnapshot(realm, scopeId, {
      playlist,
      playlist_viewer_state: options.viewerState,
      updated_at: (options.fetchedAt ?? new Date()).toISOString(),
    });
  };

  return realm.isInTransaction ? applySnapshot() : realm.write(applySnapshot);
}

export function playlistCatalogHydrationPlan<TEntry extends QueueV2PlaylistEntryInput>(
  entries: TEntry[],
  hasCatalogSourceTrack: (sourceTrackUuid: string) => boolean
): PlaylistCatalogHydrationPlan<TEntry> {
  const playableEntries: TEntry[] = [];
  const unavailableEntries: TEntry[] = [];
  const missingEntries: TEntry[] = [];
  const missingSourceTrackUuids: string[] = [];
  const seenMissingSourceTrackUuids = new Set<string>();

  for (const entry of activePlaylistEntriesInQueueOrder(entries)) {
    if (entry.unavailableReason) {
      unavailableEntries.push(entry);
      continue;
    }

    if (hasCatalogSourceTrack(entry.sourceTrackUuid)) {
      playableEntries.push(entry);
      continue;
    }

    missingEntries.push(entry);

    if (!seenMissingSourceTrackUuids.has(entry.sourceTrackUuid)) {
      seenMissingSourceTrackUuids.add(entry.sourceTrackUuid);
      missingSourceTrackUuids.push(entry.sourceTrackUuid);
    }
  }

  return {
    playableEntries,
    unavailableEntries,
    missingEntries,
    missingSourceTrackUuids,
  };
}

export function playlistCatalogHydrationPlanFromRealm<TEntry extends QueueV2PlaylistEntryInput>(
  realm: Realm,
  entries: TEntry[]
): PlaylistCatalogHydrationPlan<TEntry> {
  return playlistCatalogHydrationPlan(
    entries,
    (sourceTrackUuid) => !!realm.objectForPrimaryKey(SOURCE_TRACK_SCHEMA_NAME, sourceTrackUuid)
  );
}

function mobileAccessGrantMatchesPlaylist(grant: UserMobileAccessGrant, playlistKey: string) {
  if (grant.revokedAt) {
    return false;
  }

  if (grant.playlistUuid === playlistKey) {
    return true;
  }

  return mobileAccessGrantMetadata(grant).playlistShortId === playlistKey;
}

function userLibraryRequestOptions(
  options: UserLibraryRequestOptions
): UserLibraryRequestOptions | undefined {
  if (!options.accessToken && !options.headers) {
    return undefined;
  }

  return {
    accessToken: options.accessToken,
    headers: options.headers,
  };
}

function requiredTrimmed(value: string | undefined | null, label: string): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new UserLibraryPlaylistReadError(`${label}_required`);
  }

  return trimmed;
}

export class UserLibraryPlaylistReadError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'UserLibraryPlaylistReadError';
  }
}
