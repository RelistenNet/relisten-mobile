import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import { carplay_logger } from '@/relisten/carplay/carplay_logger';
import { RelistenCarPlayContext } from '@/relisten/carplay/relisten_car_play_context';
import { CarPlayScope } from '@/relisten/carplay/scope';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { buildTrackSections, isTrackPlayableInScope } from '@/relisten/carplay/track_sections';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { upsertShowWithSources } from '@/relisten/realm/models/show_repo';
import { Source } from '@/relisten/realm/models/source';

export function queueTracksFromSelection({
  ctx,
  scope,
  orderedTracks,
  selectedTrackUuid,
  sourceUuid,
}: {
  ctx: RelistenCarPlayContext;
  scope: CarPlayScope;
  orderedTracks: SourceTrack[];
  selectedTrackUuid: string;
  sourceUuid?: string;
}) {
  const offlineMode = ctx.userSettings.offlineModeWithDefault();
  const playableTracks = orderedTracks.filter((track) =>
    isTrackPlayableInScope(scope, offlineMode, track)
  );

  const queueTracks = playableTracks.map((track) => PlayerQueueTrack.fromSourceTrack(track));
  const playIndex = playableTracks.findIndex((track) => track.uuid === selectedTrackUuid);

  if (queueTracks.length === 0) {
    carplay_logger.warn('No playable tracks found for source', sourceUuid);
    return false;
  }

  if (playIndex < 0) {
    carplay_logger.warn('Selected track not playable in current scope', selectedTrackUuid);
    return false;
  }

  carplay_logger.info('Replacing queue from CarPlay', {
    queueLength: queueTracks.length,
    playIndex,
    source: sourceUuid,
  });
  ctx.player.queue.replaceQueue(queueTracks, playIndex, { resetShuffle: true });
  ctx.showNowPlaying?.();

  return true;
}

export async function queuePlaybackHistoryEntry(
  ctx: RelistenCarPlayContext,
  scope: CarPlayScope,
  entry: PlaybackHistoryEntry
) {
  if (!entry.isValid() || !entry.sourceTrack || !entry.artist || !entry.show || !entry.source) {
    return;
  }

  const offlineMode = ctx.userSettings.offlineModeWithDefault();
  const entryUuid = entry.uuid;
  const showUuid = entry.show.uuid;
  const sourceUuid = entry.source.uuid;
  const sourceTrackUuid = entry.sourceTrack.uuid;
  let source = entry.source;
  let artist = entry.artist;

  if (!source.sourceSets?.length) {
    const response = await ctx.apiClient.showWithSources(showUuid);

    if (response?.data?.uuid) {
      const show = upsertShowWithSources(ctx.realm, response.data);
      source = ctx.realm.objectForPrimaryKey(Source, sourceUuid) || source;
      artist = show?.artist || artist;
    }
  }

  if (!source.isValid() || !artist.isValid()) {
    carplay_logger.warn('History source or artist was deleted while loading', { id: entryUuid });
    return;
  }

  const { orderedTracks } = buildTrackSections({
    source,
    artist,
    scope,
    offlineMode,
    currentTrackUuid: ctx.player.queue.currentTrack?.sourceTrack.uuid,
  });

  queueTracksFromSelection({
    ctx,
    scope,
    orderedTracks,
    selectedTrackUuid: sourceTrackUuid,
    sourceUuid: source.uuid,
  });
}
