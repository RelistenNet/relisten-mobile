import { RelistenText } from '@/relisten/components/relisten_text';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { type PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import {
  useRelistenPlayerCurrentTrack,
  useRelistenPlayerQueueOrderedTracks,
} from '@/relisten/player/relisten_player_queue_hooks';
import { RelistenNavigationProvider } from '@/relisten/util/routes';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { type FlatList, View } from 'react-native';
import DraggableFlatList, { type RenderItem } from 'react-native-draggable-flatlist';
import { useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlayerBackground } from './player_background';
import { isInRun, queueLinks } from './player_display_helpers';
import { PlayerNowPlaying } from './player_now_playing';
import { usePlayerQueueAnchor } from './player_queue_anchor';
import { isQueueReorderCurrent } from './player_queue_reorder';
import { PlayerQueueTrayRow } from './player_queue_tray_row';

export const PLAYER_RAIL_WIDTH = 360;

/**
 * The player in a wide window: always beside the content, so it has no mini
 * bar, no drag to dismiss, and no queue drawer. The queue fills whatever
 * height the now-playing controls leave.
 */
export function PlayerRail() {
  const backdropProgress = useSharedValue(0);

  const openHistory = useCallback(() => {
    router.push('/relisten/player-history');
  }, []);

  return (
    <View
      className="border-l border-white/10 bg-relisten-blue-950"
      style={{ width: PLAYER_RAIL_WIDTH }}
    >
      <PlayerBackground backdropProgress={backdropProgress} />
      {/* Menus in the rail navigate the way the full player does, into the Artists tab. */}
      <RelistenNavigationProvider groupSegment="(artists)">
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
          <PlayerNowPlaying onOpenHistory={openHistory} width={PLAYER_RAIL_WIDTH} />
          <PlayerRailQueue />
        </SafeAreaView>
      </RelistenNavigationProvider>
    </View>
  );
}

function PlayerRailQueue() {
  const player = useRelistenPlayer();
  const tracks = useRelistenPlayerQueueOrderedTracks();
  const current = useRelistenPlayerCurrentTrack();
  const listRef = useRef<FlatList<PlayerQueueTrack>>(null);
  const anchor = usePlayerQueueAnchor(listRef);
  // A reorder applies only to the queue it started on; playback can replace
  // the queue mid-drag.
  const dragKeys = useRef<readonly string[] | null>(null);
  // Rows differ in height, so the list's offsets shift as they are measured.
  // Re-anchor on those shifts until the listener scrolls the queue themself.
  const listenerScrolled = useRef(false);

  const currentIndex = tracks.findIndex((track) => track.identifier === current?.identifier);
  const remaining = currentIndex >= 0 ? tracks.length - currentIndex - 1 : tracks.length;
  const queueKeys = tracks.map((track) => track.identifier);
  const links = queueLinks(tracks);
  const currentRun = currentIndex >= 0 ? links[currentIndex]?.run : undefined;
  const showArtist = useMemo(() => {
    const firstArtistUuid = tracks[0]?.sourceTrack.artistUuid;

    return tracks.some((track) => track.sourceTrack.artistUuid !== firstArtistUuid);
  }, [tracks]);

  // Keep the playing track at the top as playback advances. Earlier tracks
  // stay a scroll away.
  const anchorCurrentTrack = useCallback(() => {
    if (currentIndex >= 0 && !listenerScrolled.current) {
      anchor.start(currentIndex);
    }
  }, [anchor, currentIndex]);

  useEffect(() => {
    listenerScrolled.current = false;
    anchorCurrentTrack();
  }, [anchorCurrentTrack]);

  useEffect(() => () => anchor.cancel(), [anchor]);

  const renderItem = useCallback<RenderItem<PlayerQueueTrack>>(
    ({ item, getIndex, drag }) => {
      const index = getIndex() ?? tracks.indexOf(item);

      return (
        <PlayerQueueTrayRow
          track={item}
          index={index}
          current={item.identifier === current?.identifier}
          showArtist={showArtist}
          link={links[index]?.position}
          linkPlaying={isInRun(links[index], currentRun)}
          drag={drag}
        />
      );
    },
    [current?.identifier, currentRun, links, showArtist, tracks]
  );

  return (
    <View className="mx-2 mb-2 min-h-[120px] flex-1 overflow-hidden rounded-3xl border border-white/10 bg-relisten-blue-900/60">
      <View className="px-4 pb-1 pt-3">
        <RelistenText accessibilityRole="header" className="text-lg font-semibold">
          Queue
        </RelistenText>
        <RelistenText className="mt-0.5 text-sm text-gray-300">
          {remaining} {remaining === 1 ? 'track' : 'tracks'} remaining
        </RelistenText>
      </View>
      <DraggableFlatList
        ref={listRef as never}
        data={tracks}
        extraData={current?.identifier}
        keyExtractor={(track) => track.identifier}
        initialNumToRender={16}
        containerStyle={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 12 }}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        onContentSizeChange={anchorCurrentTrack}
        onLayout={anchorCurrentTrack}
        onScrollToIndexFailed={anchor.onFailure}
        onViewableItemsChanged={({ viewableItems }) =>
          anchor.onVisibleIndex(viewableItems[0]?.index)
        }
        onScrollBeginDrag={() => {
          listenerScrolled.current = true;
          anchor.cancel();
        }}
        onDragBegin={() => {
          listenerScrolled.current = true;
          anchor.cancel();
          dragKeys.current = queueKeys;
        }}
        onDragEnd={({ from, to }) => {
          const startedOnThisQueue = isQueueReorderCurrent(dragKeys.current, queueKeys);
          dragKeys.current = null;

          if (startedOnThisQueue) {
            player.queue.moveQueueTrack(from, to);
          }
        }}
        renderItem={renderItem}
      />
    </View>
  );
}
