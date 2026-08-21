import Realm from 'realm';
import { log } from '@/relisten/util/logging';
import { Artist } from '@/relisten/realm/models/artist';
import { Year } from '@/relisten/realm/models/year';
import { Show } from '@/relisten/realm/models/show';
import { Song } from '@/relisten/realm/models/song';
import { Source } from '@/relisten/realm/models/source';
import { SourceSet } from '@/relisten/realm/models/source_set';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { SourceTrackOfflineInfo } from '@/relisten/realm/models/source_track_offline_info';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { PlayerState } from '@/relisten/realm/models/player_state';

const logger = log.extend('catalog-startup-repair');

export interface CatalogRepairSummary {
  repairedLinks: number;
  tombstonedRows: number;
  deletedLeafRows: number;
  removedQueueEntries: number;
}

type RepairableFavorite = Show | Source | SourceTrack;

function tombstoneIrreparableRow(row: RepairableFavorite, deletedAt: Date) {
  const newlyTombstoned = row.deletedAt == null;

  row.deletedAt ??= deletedAt;
  row.isFavorite = false;

  return newlyTombstoned;
}

function removeTrackFromCurrentMembership(realm: Realm, track: SourceTrack) {
  const sourceSets = realm.objects(SourceSet).filtered('ANY sourceTracks.uuid == $0', track.uuid);

  for (const sourceSet of sourceSets) {
    for (let index = sourceSet.sourceTracks.length - 1; index >= 0; index -= 1) {
      if (sourceSet.sourceTracks[index].uuid === track.uuid) {
        sourceSet.sourceTracks.splice(index, 1);
      }
    }
  }
}

function removeShowFromSongMembership(realm: Realm, show: Show) {
  const songs = realm.objects(Song).filtered('ANY shows.uuid == $0', show.uuid);

  for (const song of songs) {
    song.shows.delete(show);
  }
}

/**
 * Repairs damage left by older builds that physically deleted linked catalog rows.
 *
 * This is deliberately an explicit list of the links the app treats as required. Keep it close
 * to the Realm schemas: adding a generic graph walker would make startup behavior harder to audit.
 */
export function repairCatalogAtStartup(realm: Realm): CatalogRepairSummary {
  const summary: CatalogRepairSummary = {
    repairedLinks: 0,
    tombstonedRows: 0,
    deletedLeafRows: 0,
    removedQueueEntries: 0,
  };
  const repairDate = new Date();

  realm.write(() => {
    const irreparableShowUuids = new Set<string>();
    const irreparableSourceUuids = new Set<string>();
    const irreparableTrackUuids = new Set<string>();
    const offlineInfoUuidsToDelete = new Set<string>();

    // Snapshot each broken-row query because the repair removes rows from the live result set.
    for (const show of Array.from(realm.objects(Show).filtered('artist == nil'))) {
      const artist = realm.objectForPrimaryKey(Artist, show.artistUuid);
      if (artist) {
        show.artist = artist;
        summary.repairedLinks += 1;
      } else {
        if (tombstoneIrreparableRow(show, repairDate)) {
          summary.tombstonedRows += 1;
        }
        irreparableShowUuids.add(show.uuid);
        removeShowFromSongMembership(realm, show);
      }
    }

    for (const source of Array.from(realm.objects(Source).filtered('artist == nil'))) {
      const artist = realm.objectForPrimaryKey(Artist, source.artistUuid);
      if (artist) {
        source.artist = artist;
        summary.repairedLinks += 1;
      } else {
        if (tombstoneIrreparableRow(source, repairDate)) {
          summary.tombstonedRows += 1;
        }
        irreparableSourceUuids.add(source.uuid);
      }
    }

    const sourceTracksWithMissingLinks = Array.from(
      realm
        .objects(SourceTrack)
        .filtered('artist == nil OR year == nil OR show == nil OR source == nil')
    );

    for (const track of sourceTracksWithMissingLinks) {
      const artist = track.artist ?? realm.objectForPrimaryKey(Artist, track.artistUuid);
      const show = track.show ?? realm.objectForPrimaryKey(Show, track.showUuid);
      const source = track.source ?? realm.objectForPrimaryKey(Source, track.sourceUuid);
      const year = track.year ?? (show && realm.objectForPrimaryKey(Year, show.yearUuid));

      if (!artist || !show || !source || !year) {
        if (tombstoneIrreparableRow(track, repairDate)) {
          summary.tombstonedRows += 1;
        }
        irreparableTrackUuids.add(track.uuid);
        if (track.offlineInfo) {
          offlineInfoUuidsToDelete.add(track.offlineInfo.sourceTrackUuid);
        }
        removeTrackFromCurrentMembership(realm, track);
        continue;
      }

      if (!track.artist) {
        track.artist = artist;
        summary.repairedLinks += 1;
      }
      if (!track.show) {
        track.show = show;
        summary.repairedLinks += 1;
      }
      if (!track.source) {
        track.source = source;
        summary.repairedLinks += 1;
      }
      if (!track.year) {
        track.year = year;
        summary.repairedLinks += 1;
      }
    }

    const malformedHistory = realm
      .objects(PlaybackHistoryEntry)
      .filtered('sourceTrack == nil OR artist == nil OR show == nil OR source == nil');
    const historyUuidsToDelete = new Set(Array.from(malformedHistory, (entry) => entry.uuid));

    if (irreparableShowUuids.size > 0) {
      for (const entry of realm
        .objects(PlaybackHistoryEntry)
        .filtered('show.uuid IN $0', [...irreparableShowUuids])) {
        historyUuidsToDelete.add(entry.uuid);
      }
    }
    if (irreparableSourceUuids.size > 0) {
      for (const entry of realm
        .objects(PlaybackHistoryEntry)
        .filtered('source.uuid IN $0', [...irreparableSourceUuids])) {
        historyUuidsToDelete.add(entry.uuid);
      }
    }
    if (irreparableTrackUuids.size > 0) {
      for (const entry of realm
        .objects(PlaybackHistoryEntry)
        .filtered('sourceTrack.uuid IN $0', [...irreparableTrackUuids])) {
        historyUuidsToDelete.add(entry.uuid);
      }
    }

    if (historyUuidsToDelete.size > 0) {
      const historyToDelete = realm
        .objects(PlaybackHistoryEntry)
        .filtered('uuid IN $0', [...historyUuidsToDelete]);
      summary.deletedLeafRows += historyToDelete.length;
      realm.delete(historyToDelete);
    }

    for (const offlineInfo of realm
      .objects(SourceTrackOfflineInfo)
      .filtered('sourceTracks.@count == 0')) {
      offlineInfoUuidsToDelete.add(offlineInfo.sourceTrackUuid);
    }

    if (offlineInfoUuidsToDelete.size > 0) {
      const offlineInfoToDelete = realm
        .objects(SourceTrackOfflineInfo)
        .filtered('sourceTrackUuid IN $0', [...offlineInfoUuidsToDelete]);
      summary.deletedLeafRows += offlineInfoToDelete.length;
      realm.delete(offlineInfoToDelete);
    }

    if (irreparableTrackUuids.size > 0) {
      for (const playerState of realm.objects(PlayerState)) {
        const removedTrackUuids = new Set(
          [
            ...playerState.queueSourceTrackUuids,
            ...playerState.queueSourceTrackShuffledUuids,
          ].filter((uuid) => irreparableTrackUuids.has(uuid))
        );

        if (removedTrackUuids.size === 0) {
          continue;
        }

        playerState.queueSourceTrackUuids = playerState.queueSourceTrackUuids.filter(
          (uuid) => !irreparableTrackUuids.has(uuid)
        );
        playerState.queueSourceTrackShuffledUuids =
          playerState.queueSourceTrackShuffledUuids.filter(
            (uuid) => !irreparableTrackUuids.has(uuid)
          );
        playerState.activeSourceTrackIndex = undefined;
        playerState.activeSourceTrackShuffledIndex = undefined;
        summary.removedQueueEntries += removedTrackUuids.size;
      }
    }
  });

  logger.info('Catalog startup repair complete', summary);
  return summary;
}
