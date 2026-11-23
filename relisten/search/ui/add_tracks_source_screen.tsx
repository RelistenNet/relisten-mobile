import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { type ComponentRef, useMemo } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import { decodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SectionHeader } from '@/relisten/components/section_header';
import { SourceTrackComponent } from '@/relisten/components/source/source_track_component';
import { useScrollFocusedRowIntoView } from '@/relisten/components/source/use_scroll_focused_row';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import { trackIdForSourceTrack } from '@/relisten/playlists/playlist_hooks';
import type { Show } from '@/relisten/realm/models/show';
import { useFullShowWithSelectedSource } from '@/relisten/realm/models/show_repo';
import { Song } from '@/relisten/realm/models/song';
import type { Source } from '@/relisten/realm/models/source';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
import { useRealm } from '@/relisten/realm/schema';
import type { RelistenTabGroupSegment } from '@/relisten/util/routes';
import { showVenueName } from '@/relisten/util/venue_route';
import { focusedTrackUuids } from '../add_tracks_focus';
import { useAddTracks } from './add_tracks_context';
import { AddTrackButton, OpenFullPageButton, SheetScrollAnchor } from './add_tracks_controls';

/**
 * One source's setlist inside Add Tracks, with **+** on every file. A search
 * result's song is highlighted on every file that plays it. Tapping a row
 * plays from there, replacing the queue, as the full source screen does.
 */
export function AddTracksSourceScreen() {
  const { showUuid, sourceUuid, focusTrackUuid, focusSongId } = useLocalSearchParams<{
    showUuid: string;
    sourceUuid: string;
    focusTrackUuid?: string;
    focusSongId?: string;
  }>();
  const router = useRouter();
  const { playlistId, tab, addTrack } = useAddTracks();
  const songId = useCanonicalSongId(focusSongId);
  const { scrollRef, contentRef, attachFocusedRow } = useScrollFocusedRowIntoView();
  // A named source opens exactly that recording, as a search result names it.
  const { results, show, sources, selectedSource } = useFullShowWithSelectedSource(
    showUuid,
    sourceUuid,
    { exactSource: sourceUuid !== 'initial' }
  );

  const tracks = useMemo(() => selectedSource?.allSourceTracks() ?? [], [selectedSource]);
  const focused = useMemo(
    () => focusedTrackUuids(tracks, { trackUuid: focusTrackUuid, songId }),
    [focusTrackUuid, songId, tracks]
  );

  const openOtherRecordings = () =>
    router.push({
      pathname: '/relisten/add-tracks/recordings',
      params: { playlistId, showUuid, ...(songId ? { focusSongId: songId } : {}) },
    });

  const fullPageHref =
    show && selectedSource ? sourceFullPageHref(tab, show, selectedSource, focusTrackUuid) : null;
  // Shared by the loading, unavailable and setlist states below.
  const header = (
    <Stack.Screen
      options={{
        title: show?.displayDate ?? '',
        headerRight: () => (fullPageHref ? <OpenFullPageButton href={fullPageHref} /> : null),
      }}
    />
  );

  if (!show || (!selectedSource && sources.length === 0)) {
    return (
      <View className="flex-1 items-center justify-center bg-relisten-blue-900">
        {header}
        {results.errors?.length ? (
          <RelistenText className="px-6 text-center text-gray-300">
            This show couldn’t load.
          </RelistenText>
        ) : (
          <ActivityIndicator color="white" />
        )}
      </View>
    );
  }

  if (!selectedSource) {
    return (
      <View className="flex-1 bg-relisten-blue-900">
        {header}
        <SheetScrollAnchor />
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ gap: 12, padding: 16 }}
        >
          <RelistenText className="text-lg font-semibold">
            This recording is no longer available.
          </RelistenText>
          <RelistenButton onPress={openOtherRecordings}>Other Recordings</RelistenButton>
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-relisten-blue-900">
      {header}
      <SheetScrollAnchor />
      <ScrollView
        ref={scrollRef}
        // Content starts under the sheet's header; the inset clears it.
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 96 }}
      >
        <View ref={contentRef}>
          <SourceSummary
            show={show}
            source={selectedSource}
            onOtherRecordings={openOtherRecordings}
          />
          <Setlist
            source={selectedSource}
            focused={focused}
            attachFirstFocused={attachFocusedRow}
            onAdd={(track) => void addTrack(trackIdForSourceTrack(track), track.title)}
          />
        </View>
      </ScrollView>
    </View>
  );
}

/** The full source screen for this exact recording, focused on the same file. */
function sourceFullPageHref(
  tab: RelistenTabGroupSegment,
  show: Show,
  source: Source,
  focusTrackUuid: string | undefined
): Href {
  return {
    pathname: `/relisten/tabs/${tab}/[artistUuid]/show/[showUuid]/source/[sourceUuid]/` as const,
    params: {
      artistUuid: show.artistUuid,
      showUuid: show.uuid,
      sourceUuid: source.uuid,
      exactSource: '1',
      ...(focusTrackUuid ? { focusTrackUuid } : {}),
    },
  };
}

/**
 * The song ID files are matched on. An imported song can't match a canonical
 * normalization part, so it focuses on the imported song's normalized song
 * when the catalog knows it.
 */
function useCanonicalSongId(songId: string | undefined): string | undefined {
  const realm = useRealm();
  if (!songId?.startsWith('imported_song_')) {
    return songId;
  }
  const uuid = decodeUuidCatalogId(songId, 'imported_song');
  return realm.objectForPrimaryKey(Song, uuid)?.normalizedSongId ?? undefined;
}

function SourceSummary({
  show,
  source,
  onOtherRecordings,
}: {
  show: { displayDate: string; sourceCount: number } & Parameters<typeof showVenueName>[0];
  source: Source;
  onOtherRecordings: () => void;
}) {
  return (
    <View className="gap-1 px-4 py-3">
      <RelistenText className="text-lg font-semibold">
        {[show.displayDate, showVenueName(show)].filter(Boolean).join(' · ')}
      </RelistenText>
      <RelistenText className="text-sm text-gray-400" selectable>
        {[source.isSoundboard ? 'SBD' : undefined, source.upstreamIdentifier]
          .filter(Boolean)
          .join(' · ')}
      </RelistenText>
      {show.sourceCount > 1 && (
        <TouchableOpacity
          accessibilityRole="button"
          className="mt-1 self-start"
          onPress={onOtherRecordings}
        >
          <RelistenText className="font-semibold text-relisten-blue-300">
            Other Recordings ({show.sourceCount}) ›
          </RelistenText>
        </TouchableOpacity>
      )}
    </View>
  );
}

function Setlist({
  source,
  focused,
  attachFirstFocused,
  onAdd,
}: {
  source: Source;
  focused: ReadonlySet<string>;
  attachFirstFocused: (row: ComponentRef<typeof View> | null) => void;
  onAdd: (track: SourceTrack) => void;
}) {
  const player = useRelistenPlayer();
  const sets = [...source.sourceSets].sort((a, b) => a.index - b.index);
  const allTracks = source.allSourceTracks();
  const firstFocusedUuid = allTracks.find((track) => focused.has(track.uuid))?.uuid;

  const playFrom = (track: SourceTrack | undefined) => {
    if (!track) {
      return;
    }
    const index = Math.max(
      0,
      allTracks.findIndex((candidate) => candidate.uuid === track.uuid)
    );
    player.queue.replaceQueue(
      allTracks.map((candidate) => PlayerQueueTrack.fromSourceTrack(candidate)),
      index,
      { resetShuffle: true }
    );
  };

  return (
    <View>
      {sets.map((set) => {
        const tracks = [...set.sourceTracks].sort((a, b) => a.trackPosition - b.trackPosition);
        return (
          <View key={set.uuid}>
            {sets.length > 1 && <SectionHeader title={set.name} />}
            {tracks.map((track, index) => (
              <SourceTrackComponent
                key={track.uuid}
                sourceTrack={track}
                isLastTrackInSet={index === tracks.length - 1}
                highlighted={focused.has(track.uuid)}
                rowRef={track.uuid === firstFocusedUuid ? attachFirstFocused : undefined}
                onPress={playFrom}
                actions={
                  <AddTrackButton
                    trackId={trackIdForSourceTrack(track)}
                    title={track.title}
                    onAdd={() => onAdd(track)}
                  />
                }
              />
            ))}
          </View>
        );
      })}
    </View>
  );
}
