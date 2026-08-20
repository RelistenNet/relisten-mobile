import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import { carplay_logger } from '@/relisten/carplay/carplay_logger';
import { RelistenCarPlayContext } from '@/relisten/carplay/relisten_car_play_context';
import { CarPlayScope } from '@/relisten/carplay/scope';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { buildTrackSections, isTrackPlayableInScope } from '@/relisten/carplay/track_sections';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { upsertShowWithSources } from '@/relisten/realm/models/show_repo';
import { Source } from '@/relisten/realm/models/source';
import { Artist } from '@/relisten/realm/models/artist';
import {
  CarPlayCatalogAccess,
  catalogAccessForScope,
  selectedCatalogObjectForAccess,
} from '@/relisten/carplay/catalog_scope';
import { readRetainedCatalogObject } from '@/relisten/realm/catalog_retirement';

export function queueTracksFromSelection({
  ctx,
  scope,
  orderedTrackUuids,
  selectedTrackUuid,
  sourceUuid,
  catalogAccess = catalogAccessForScope(scope),
}: {
  ctx: RelistenCarPlayContext;
  scope: CarPlayScope;
  orderedTrackUuids: string[];
  selectedTrackUuid: string;
  sourceUuid?: string;
  catalogAccess?: CarPlayCatalogAccess;
}) {
  const offlineMode = ctx.userSettings.offlineModeWithDefault();
  const playableTracks = orderedTrackUuids
    .map((uuid) =>
      selectedCatalogObjectForAccess(
        ctx.realm,
        catalogAccess,
        SourceTrack,
        uuid,
        'carplay.queue.source-track-selection'
      )
    )
    .filter((track): track is SourceTrack => track !== undefined)
    .filter((track) => isTrackPlayableInScope(scope, offlineMode, track));

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
  const offlineMode = ctx.userSettings.offlineModeWithDefault();
  const entryUuid = entry.uuid;
  const sourceUuid = entry.source?.uuid;
  const artistUuid = entry.artist?.uuid;
  const showUuid = entry.show?.uuid;
  const selectedTrackUuid = entry.sourceTrack?.uuid;
  let source = readRetainedCatalogObject(entry.source, 'carplay.history.initial-source');
  let artist = readRetainedCatalogObject(entry.artist, 'carplay.history.initial-artist');
  readRetainedCatalogObject(entry.show, 'carplay.history.initial-show');
  readRetainedCatalogObject(entry.sourceTrack, 'carplay.history.initial-source-track');

  if (!sourceUuid || !artistUuid || !showUuid || !selectedTrackUuid || !source || !artist) {
    carplay_logger.warn('History entry missing source or artist', { id: entryUuid });
    return;
  }

  if (!source.sourceSets?.length) {
    const response = await ctx.apiClient.showWithSources(showUuid);

    if (response?.data?.uuid) {
      upsertShowWithSources(ctx.realm, response.data);
    }

    source = selectedCatalogObjectForAccess(
      ctx.realm,
      'retained',
      Source,
      sourceUuid,
      'carplay.history.source-after-refresh'
    );
    artist = selectedCatalogObjectForAccess(
      ctx.realm,
      'retained',
      Artist,
      artistUuid,
      'carplay.history.artist-after-refresh'
    );

    if (!source || !artist) {
      carplay_logger.warn('History catalog data disappeared during refresh', { id: entryUuid });
      return;
    }
  }

  const { orderedTrackUuids } = buildTrackSections({
    source,
    artist,
    scope,
    offlineMode,
    currentTrackUuid: ctx.player.queue.currentTrack?.sourceTrack.uuid,
    catalogAccess: 'retained',
  });

  queueTracksFromSelection({
    ctx,
    scope,
    orderedTrackUuids,
    selectedTrackUuid,
    sourceUuid: source.uuid,
    catalogAccess: 'retained',
  });
}
