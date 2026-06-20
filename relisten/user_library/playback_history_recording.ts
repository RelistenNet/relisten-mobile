import Realm from 'realm';
import {
  queueV2HistoryAttribution,
  QueueV2HistoryAttribution,
  QueueV2Item,
} from '@/relisten/player/queue_v2';
import { ScopedPlaybackHistoryEntry } from '@/relisten/realm/models/user_library/history';
import { getActiveUserDataScope } from '@/relisten/user_library/active_user_data_scope_service';
import { latestActiveUserLibrarySessionDeviceId } from '@/relisten/user_library/auth_session_realm_service';
import { UserDataScopeKind } from '@/relisten/user_library/user_data_scope';
import {
  PlaybackHistoryJournalInput,
  UserLibraryPlaybackHistoryRepository,
} from '@/relisten/user_library/playback_history_batch';

export interface AuthenticatedPlaybackHistoryEventInput {
  clientEventUuid: string;
  sourceTrackUuid: string;
  sourceUuid: string;
  showUuid?: string | null;
  artistUuid?: string | null;
  queueV2Item?: QueueV2Item;
  playedAt: Date;
  playbackFlags: number;
  platform: string;
  appVersion: string;
  historyEnabled?: boolean;
}

export function recordAuthenticatedPlaybackHistoryEvent(
  realm: Realm,
  input: AuthenticatedPlaybackHistoryEventInput
): ScopedPlaybackHistoryEntry | undefined {
  const activeScope = getActiveUserDataScope(realm);

  if (activeScope?.scopeKind !== UserDataScopeKind.Authenticated) {
    return undefined;
  }

  const deviceId = latestActiveUserLibrarySessionDeviceId(realm, activeScope.scopeId);

  if (!deviceId) {
    return undefined;
  }

  const attribution: QueueV2HistoryAttribution = input.queueV2Item
    ? queueV2HistoryAttribution(input.queueV2Item)
    : { sourceTrackUuid: input.sourceTrackUuid };
  const journalInput: PlaybackHistoryJournalInput = {
    clientEventUuid: input.clientEventUuid,
    deviceId,
    sourceTrackUuid: attribution.sourceTrackUuid,
    sourceUuid: input.sourceUuid,
    showUuid: input.showUuid,
    artistUuid: input.artistUuid,
    playlistUuid: attribution.playlistUuid,
    playlistEntryUuid: attribution.playlistEntryUuid,
    blockUuid: attribution.blockUuid,
    blockPosition: attribution.blockPosition,
    playedAt: input.playedAt,
    playbackFlags: input.playbackFlags,
    platform: input.platform,
    appVersion: input.appVersion,
  };

  return new UserLibraryPlaybackHistoryRepository(realm).record(activeScope.scopeId, journalInput, {
    historyEnabled: input.historyEnabled,
  });
}
