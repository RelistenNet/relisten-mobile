import { ListSection } from '@g4rb4g3/react-native-carplay';
import plur from 'plur';
import { Artist } from '@/relisten/realm/models/artist';
import { Source } from '@/relisten/realm/models/source';
import { SourceSet } from '@/relisten/realm/models/source_set';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { OfflineModeSetting } from '@/relisten/realm/models/user_settings';
import { CarPlayScope } from '@/relisten/carplay/scope';
import {
  CarPlayCatalogAccess,
  catalogAccessForScope,
  catalogObjectsForAccess,
} from '@/relisten/carplay/catalog_scope';

type TrackSectionsResult = {
  orderedTrackUuids: string[];
  sections: ListSection[];
};

export function buildTrackSections({
  source,
  artist,
  scope,
  offlineMode,
  currentTrackUuid,
  catalogAccess = catalogAccessForScope(scope),
}: {
  source: Source;
  artist: Artist;
  scope: CarPlayScope;
  offlineMode: OfflineModeSetting;
  currentTrackUuid?: string;
  catalogAccess?: CarPlayCatalogAccess;
}): TrackSectionsResult {
  const sortedSets = catalogObjectsForAccess(
    source.sourceSets || [],
    catalogAccess,
    'carplay.track-sections.source-set'
  ).sort((a, b) => a.index - b.index);
  const orderedTracks: SourceTrack[] = [];
  const orderedTrackUuids: string[] = [];

  if (artist.features().sets) {
    const sections: ListSection[] = [];
    const totalSets = sortedSets.length;

    for (let index = 0; index < sortedSets.length; index++) {
      const set = sortedSets[index];
      const setTracks = sortedTracksForSet(set, catalogAccess);
      orderedTracks.push(...setTracks);
      orderedTrackUuids.push(...setTracks.map((track) => track.uuid));

      const items = setTracks
        .filter((track) => includeTrackForScope(scope, offlineMode, track))
        .map((track) => ({
          id: track.uuid,
          text: track.title,
          detailText: track.humanizedDuration || undefined,
          isPlaying: currentTrackUuid === track.uuid,
          showsDisclosureIndicator: false,
        }));

      if (items.length === 0) {
        continue;
      }

      sections.push({
        header: formatSetHeader(set, index, totalSets),
        items,
      });
    }

    return {
      orderedTrackUuids,
      sections:
        sections.length > 0
          ? sections
          : [
              {
                header: 'No tracks available',
                items: [{ text: 'No playable tracks found.' }],
              },
            ],
    };
  }

  for (const set of sortedSets) {
    const setTracks = sortedTracksForSet(set, catalogAccess);
    orderedTracks.push(...setTracks);
    orderedTrackUuids.push(...setTracks.map((track) => track.uuid));
  }

  const items = orderedTracks
    .filter((track) => includeTrackForScope(scope, offlineMode, track))
    .map((track) => ({
      id: track.uuid,
      text: track.title,
      detailText: track.humanizedDuration || undefined,
      isPlaying: currentTrackUuid === track.uuid,
      showsDisclosureIndicator: false,
    }));

  return {
    orderedTrackUuids,
    sections: [
      {
        header: `${items.length} ${plur('track', items.length)}`,
        items,
      },
    ],
  };
}

export function includeTrackForScope(
  scope: CarPlayScope,
  offlineMode: OfflineModeSetting,
  track: SourceTrack
) {
  if (scope === 'offline') {
    return track.offlineInfo?.isPlayableOffline();
  }

  if (offlineMode === OfflineModeSetting.AlwaysOffline) {
    return track.offlineInfo?.isPlayableOffline();
  }

  return true;
}

export function isTrackPlayableInScope(
  scope: CarPlayScope,
  offlineMode: OfflineModeSetting,
  track: SourceTrack
) {
  return includeTrackForScope(scope, offlineMode, track) && !!track.streamingUrl();
}

function sortedTracksForSet(set: SourceSet, catalogAccess: CarPlayCatalogAccess) {
  return catalogObjectsForAccess(
    set.sourceTracks || [],
    catalogAccess,
    'carplay.track-sections.source-track'
  ).sort((a, b) => a.trackPosition - b.trackPosition);
}

function formatSetHeader(set: SourceSet, index: number, totalSets: number) {
  if (set.name?.trim()) {
    return set.name;
  }

  if (set.isEncore) {
    return 'Encore';
  }

  if (totalSets > 1) {
    return `Set ${index + 1}`;
  }

  return 'Tracks';
}
