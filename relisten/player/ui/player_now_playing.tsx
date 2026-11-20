import { RelistenText } from '@/relisten/components/relisten_text';
import { useRelistenCastStatus } from '@/relisten/casting/cast_ui';
import { audioAdjustmentNative } from '@/relisten/player/audio_adjustments/audio_adjustment_native';
import { useAudioAdjustmentConfiguration } from '@/relisten/player/audio_adjustments/audio_adjustment_repo';
import {
  useRelistenPlayerQueue,
  useRelistenPlayerRepeatState,
  useRelistenPlayerShuffleState,
} from '@/relisten/player/relisten_player_queue_hooks';
import {
  type PlayerQueueTrack,
  PlayerRepeatState,
  PlayerShuffleState,
} from '@/relisten/player/relisten_player_queue';
import { usePlaybackView } from '@/relisten/player/playback_view';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
import { useSonosRemote } from '@/relisten/sonos/sonos_remote';
import { SonosVolumeControl } from '@/relisten/sonos/ui/sonos_now_playing';
import { PlayerAudioVisualizer } from '@/relisten/player/ui/player_audio_visualizer';
import { PlayerActionsMenu } from '@/relisten/player/ui/player_actions_menu';
import {
  playerDisplayDate,
  playerDisplayTitle,
  playerPosterDate,
  playerTrackAccessibilityLabel,
} from '@/relisten/player/ui/player_display_helpers';
import { PlayerOutputRoute } from './player_output_route';
import { ScrubberRow } from '@/relisten/player/ui/player_scrubber';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { tw } from '@/relisten/util/tw';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { type ReactNode, type Ref } from 'react';
import {
  Platform,
  Share,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ViewInstance,
} from 'react-native';
import { PlayOnButton } from '@/relisten/player/ui/play_on_button';
import * as Progress from 'react-native-progress';

function ShowIdentity({
  currentTrack,
  visualizerActive,
}: {
  currentTrack: SourceTrack | undefined;
  visualizerActive: boolean;
}) {
  const { width } = useWindowDimensions();

  if (!currentTrack) {
    return null;
  }

  const show = currentTrack.show;
  const venue = show.venue;
  const { day, month, year } = playerPosterDate(show.displayDate);
  const posterScale = Math.min(Math.max(width / 402, 0.82), 1.12);

  return (
    <View
      accessible
      accessibilityLabel={`${currentTrack.artist.name}, ${show.displayDate}${venue ? `, ${venue.name}, ${venue.location}` : ''}`}
      className="w-full items-center"
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="w-full items-center"
      >
        <View className="w-full flex-row items-center gap-4 px-7">
          <View className="h-px flex-1 bg-relisten-blue-700/60" />
          <RelistenText
            adjustsFontSizeToFit
            allowFontScaling={false}
            className="min-w-0 shrink font-semibold uppercase text-relisten-blue-200/75"
            minimumFontScale={0.6}
            numberOfLines={1}
            selectable={false}
            style={{ fontSize: 13 * posterScale, letterSpacing: 5 * posterScale }}
          >
            {currentTrack.artist.name}
          </RelistenText>
          <View className="h-px flex-1 bg-relisten-blue-700/60" />
        </View>

        <View className="flex-row items-center justify-center gap-5">
          <RelistenText
            allowFontScaling={false}
            className="font-semibold text-relisten-blue-200/75"
            selectable={false}
            style={{ fontSize: 22 * posterScale, letterSpacing: 3 * posterScale }}
          >
            {month}
          </RelistenText>
          <View className="h-12 w-px bg-relisten-blue-600/70" />
          <RelistenText
            allowFontScaling={false}
            className="font-light leading-none text-relisten-blue-100/80"
            selectable={false}
            style={{ fontSize: 72 * posterScale }}
          >
            {day}
          </RelistenText>
          <View className="h-12 w-px bg-relisten-blue-600/70" />
          <RelistenText
            allowFontScaling={false}
            className="font-semibold text-relisten-blue-200/75"
            selectable={false}
            style={{ fontSize: 22 * posterScale, letterSpacing: 2 * posterScale }}
          >
            {year}
          </RelistenText>
        </View>

        {venue && (
          <View className="mt-0.5 w-full items-center">
            <View className="w-full flex-row items-center gap-4 px-7">
              <View className="h-px min-w-[16px] flex-1 bg-relisten-blue-700/60" />
              <RelistenText
                allowFontScaling={false}
                className="shrink text-center font-light uppercase text-relisten-blue-200"
                numberOfLines={2}
                selectable={false}
                style={{
                  fontSize: 14 * posterScale,
                  letterSpacing: 3 * posterScale,
                  lineHeight: 22 * posterScale,
                  maxWidth: '78%',
                }}
              >
                {venue.name}
              </RelistenText>
              <View className="h-px min-w-[16px] flex-1 bg-relisten-blue-700/60" />
            </View>
            <RelistenText
              adjustsFontSizeToFit
              allowFontScaling={false}
              className="mt-1 w-full px-7 text-center uppercase text-relisten-blue-300/65"
              minimumFontScale={0.6}
              numberOfLines={1}
              selectable={false}
              style={{
                fontSize: 12 * posterScale,
                letterSpacing: 3 * posterScale,
              }}
            >
              {venue.location}
            </RelistenText>
          </View>
        )}
        {Platform.OS === 'ios' && (
          <View className="mb-1 mt-4 w-full px-5">
            <PlayerAudioVisualizer active={visualizerActive} />
          </View>
        )}
      </View>
    </View>
  );
}

function CurrentTrackInfo({
  currentPlayerTrack,
  headingRef,
  onBeforeNavigate,
}: {
  currentPlayerTrack: PlayerQueueTrack | undefined;
  headingRef?: Ref<ViewInstance>;
  onBeforeNavigate: (navigate: () => void) => void;
}) {
  const { fontScale } = useWindowDimensions();
  const isAccessibilityLayout = fontScale >= 1.4;

  const track = currentPlayerTrack?.sourceTrack;
  const artist = track?.artist;
  const show = track?.show;
  const source = track?.source;

  if (!track || !artist || !show || !source) {
    return null;
  }

  const displayTitle = playerDisplayTitle(track.title);
  const accessibilityLabel = [
    'Now Playing',
    displayTitle,
    artist.name,
    playerDisplayDate(show.displayDate),
    show.venue?.name,
    show.venue?.location,
  ]
    .filter(Boolean)
    .join(', ');

  const onShare = () => {
    const [year, month, day] = show.displayDate.split('-');
    const url = `https://relisten.net/${artist.slug}/${year}/${month}/${day}/${track.slug}?source=${source.uuid}`;
    void Share.share({
      message: `Check out ${track.title} (${track.humanizedDuration}) by ${artist.name} (${show.displayDate}) on @relistenapp${Platform.OS === 'ios' ? '' : `: ${url}`}`,
      url,
    });
  };

  const shareButton = (
    <TouchableOpacity
      accessibilityLabel={`Share ${playerTrackAccessibilityLabel(track)}`}
      accessibilityRole="button"
      className="h-11 w-11 items-center justify-center"
      onPress={onShare}
    >
      <MaterialIcons color="white" name={Platform.OS === 'ios' ? 'ios-share' : 'share'} size={21} />
    </TouchableOpacity>
  );

  const actionButtons = (
    <View className="flex-row items-center gap-2">
      {shareButton}
      <View className="h-11 w-11">
        <PlayerActionsMenu onBeforeNavigate={onBeforeNavigate}>
          {/* The iOS menu host offsets its child 8pt left. */}
          <View
            accessible
            accessibilityLabel={`Actions for ${playerTrackAccessibilityLabel(track)}`}
            accessibilityRole="button"
            className="h-11 w-11 translate-x-2 items-center justify-center"
            collapsable={false}
          >
            <Ionicons color="white" name="ellipsis-horizontal" size={22} />
          </View>
        </PlayerActionsMenu>
      </View>
    </View>
  );

  const trackDetails = (
    <View>
      <View>
        <View
          ref={headingRef}
          accessible
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="header"
          className={
            isAccessibilityLayout ? 'min-w-0' : 'min-h-[44px] min-w-0 justify-center pr-28'
          }
        >
          <RelistenText
            className="text-2xl font-bold leading-tight"
            numberOfLines={fontScale < 1.4 ? 2 : undefined}
            selectable={false}
          >
            {displayTitle}
          </RelistenText>
        </View>
        <View className={isAccessibilityLayout ? 'mt-2' : 'absolute right-0 top-0'}>
          {actionButtons}
        </View>
      </View>
      <RelistenText
        className="mt-1 text-lg"
        numberOfLines={fontScale < 1.4 ? 1 : undefined}
        selectable={false}
      >
        {artist.name}
        {isAccessibilityLayout ? ` · ${playerDisplayDate(show.displayDate)}` : ''}
      </RelistenText>
      {show.venue ? (
        <RelistenText
          className="mt-0.5 text-base text-gray-400"
          numberOfLines={fontScale < 1.4 ? 1 : undefined}
          selectable={false}
        >
          {show.venue.name} · {show.venue.location}
        </RelistenText>
      ) : null}
    </View>
  );

  return <View className="px-5">{trackDetails}</View>;
}

/** Shared transport for the expanded player and its compact scrolling header. */
export function PlayerControls({ compact = false }: { compact?: boolean }) {
  // The phone's transport, or a Sonos room's while one plays this queue.
  const view = usePlaybackView();
  const track = view.track?.sourceTrack;

  let playbackStateIcon = (
    <MaterialIcons color="white" name="play-arrow" size={compact ? 28 : 46} />
  );
  let playbackLabel = 'Play';

  if (view.state === 'playing') {
    playbackStateIcon = <MaterialIcons color="white" name="pause" size={compact ? 28 : 46} />;
    playbackLabel = 'Pause';
  } else if (view.state === 'buffering') {
    playbackStateIcon = (
      <Progress.CircleSnail color="white" indeterminate size={compact ? 24 : 34} />
    );
    playbackLabel = 'Buffering';
  }

  return (
    <View
      className={
        compact ? 'flex-row items-center gap-2' : 'flex-row items-center justify-between px-12'
      }
    >
      <TouchableOpacity
        accessibilityLabel="Previous track"
        accessibilityRole="button"
        accessibilityState={{ disabled: !view.canPrevious }}
        className={tw(
          'min-h-[44px] min-w-[44px] items-center justify-center',
          !view.canPrevious && 'opacity-40'
        )}
        disabled={!view.canPrevious}
        onPress={() => {
          view.previous();
          void Haptics.selectionAsync();
        }}
      >
        <MaterialCommunityIcons color="white" name="skip-backward" size={compact ? 24 : 34} />
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityLabel={
          track ? `${playbackLabel} ${playerTrackAccessibilityLabel(track)}` : playbackLabel
        }
        accessibilityRole="button"
        className={tw(
          'items-center justify-center rounded-full border border-white/30 bg-white/5',
          compact ? 'h-11 w-11' : 'h-16 w-16'
        )}
        disabled={view.busy}
        onPress={() => view.togglePlayPause()}
      >
        {playbackStateIcon}
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityLabel="Next track"
        accessibilityRole="button"
        accessibilityState={{ disabled: !view.canNext }}
        className={tw(
          'min-h-[44px] min-w-[44px] items-center justify-center',
          !view.canNext && 'opacity-40'
        )}
        disabled={!view.canNext}
        onPress={() => {
          view.next();
          void Haptics.selectionAsync();
        }}
      >
        <MaterialCommunityIcons color="white" name="skip-forward" size={compact ? 24 : 34} />
      </TouchableOpacity>
    </View>
  );
}

function PlayerSecondaryControls({ historyButton }: { historyButton?: ReactNode }) {
  const queue = useRelistenPlayerQueue();
  // A Sonos room plays the order it was handed, so shuffle and repeat wait until the phone plays again.
  const sonosActive = useSonosRemote().kind !== 'none';
  const [shuffleState] = useRelistenPlayerShuffleState();
  const [repeatState] = useRelistenPlayerRepeatState();
  const audioEqualizerConfiguration = useAudioAdjustmentConfiguration();

  const isShuffleOn = shuffleState === PlayerShuffleState.SHUFFLE_ON;
  const isRepeatTrack = repeatState === PlayerRepeatState.REPEAT_TRACK;
  const isRepeatQueue = repeatState === PlayerRepeatState.REPEAT_QUEUE;
  const isRepeatOn = isRepeatTrack || isRepeatQueue;
  const isAudioEqualizerOn = audioEqualizerConfiguration?.enabled ?? false;
  const supportsAudioEqualizer = audioAdjustmentNative.capabilities().supported;
  const inactiveColor = 'rgba(255, 255, 255, 0.62)';

  const toggleShuffle = () => {
    queue.setShuffleState(
      isShuffleOn ? PlayerShuffleState.SHUFFLE_OFF : PlayerShuffleState.SHUFFLE_ON
    );
    void Haptics.selectionAsync();
  };

  const toggleRepeat = () => {
    const nextRepeatState =
      repeatState === PlayerRepeatState.REPEAT_OFF
        ? PlayerRepeatState.REPEAT_QUEUE
        : repeatState === PlayerRepeatState.REPEAT_QUEUE
          ? PlayerRepeatState.REPEAT_TRACK
          : PlayerRepeatState.REPEAT_OFF;

    queue.setRepeatState(nextRepeatState);
    void Haptics.selectionAsync();
  };

  return (
    <View className="flex-row items-center justify-between px-4">
      <TouchableOpacity
        accessibilityLabel={isShuffleOn ? 'Turn shuffle off' : 'Turn shuffle on'}
        accessibilityRole="button"
        accessibilityState={{ selected: isShuffleOn, disabled: sonosActive }}
        className={tw('h-11 w-11 items-center justify-center', sonosActive && 'opacity-40')}
        disabled={sonosActive}
        onPress={toggleShuffle}
      >
        <MaterialCommunityIcons
          color={isShuffleOn ? RelistenBlue['300'] : inactiveColor}
          name="shuffle"
          size={20}
        />
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityLabel="Repeat"
        accessibilityValue={{
          text: isRepeatTrack ? 'One track' : isRepeatQueue ? 'All tracks' : 'Off',
        }}
        accessibilityHint="Cycles through all tracks, one track, and off."
        accessibilityRole="button"
        accessibilityState={{ selected: isRepeatOn, disabled: sonosActive }}
        className={tw('h-11 w-11 items-center justify-center', sonosActive && 'opacity-40')}
        disabled={sonosActive}
        onPress={toggleRepeat}
      >
        <MaterialCommunityIcons
          color={isRepeatOn ? RelistenBlue['300'] : inactiveColor}
          name={isRepeatTrack ? 'repeat-once' : 'repeat'}
          size={20}
        />
      </TouchableOpacity>
      {supportsAudioEqualizer && (
        <TouchableOpacity
          accessibilityLabel="Open Audio Equalizer"
          accessibilityRole="button"
          accessibilityState={{ selected: isAudioEqualizerOn }}
          className="h-11 w-11 items-center justify-center"
          onPress={() => router.push('/relisten/audio-adjustments')}
        >
          <MaterialCommunityIcons
            color={isAudioEqualizerOn ? RelistenBlue['300'] : inactiveColor}
            name="equalizer"
            size={20}
          />
        </TouchableOpacity>
      )}
      {historyButton}
      <PlayOnButton activeColor={RelistenBlue['300']} inactiveColor={inactiveColor} />
    </View>
  );
}

/** The scrubber and transport, plus the group's volume while a Sonos room plays. */
function NowPlayingTransport({
  onScrubbingChange,
  remote,
}: {
  onScrubbingChange?: (scrubbing: boolean) => void;
  remote: boolean;
}) {
  return (
    <>
      <View className="mt-4 px-5">
        <ScrubberRow subduedCache onScrubbingChange={onScrubbingChange} />
      </View>
      <View className="mt-1">
        <PlayerControls />
      </View>
      {remote && (
        <View className="mt-2 px-5">
          <SonosVolumeControl />
        </View>
      )}
    </>
  );
}

type PlayerNowPlayingProps = {
  headingRef?: Ref<ViewInstance>;
  onOpenHistory?: () => void;
  onBeforeNavigate: (navigate: () => void) => void;
  visualizerActive?: boolean;
  onScrubbingChange?: (scrubbing: boolean) => void;
};

export function PlayerNowPlaying({
  headingRef,
  onOpenHistory,
  onBeforeNavigate,
  visualizerActive = true,
  onScrubbingChange,
}: PlayerNowPlayingProps) {
  // The phone's track, or the one a Sonos room is playing from this queue.
  const view = usePlaybackView();
  const currentTrack = view.track;
  const castStatus = useRelistenCastStatus();
  const { fontScale } = useWindowDimensions();
  const showDecorativeIdentity = fontScale < 1.4;
  const remote = view.roomName !== undefined;

  if (!currentTrack && view.fallback) {
    // The room plays something the phone's queue no longer holds: show what Sonos reports.
    return (
      <View className="pb-4 pt-7">
        <View className="px-5">
          <RelistenText className="text-2xl font-bold leading-tight" numberOfLines={2}>
            {view.fallback.title}
          </RelistenText>
          {view.fallback.artist && (
            <RelistenText className="mt-1 text-lg" numberOfLines={1}>
              {view.fallback.artist}
            </RelistenText>
          )}
        </View>
        <NowPlayingTransport onScrubbingChange={onScrubbingChange} remote />
      </View>
    );
  }

  if (!currentTrack) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <RelistenText className="text-center text-xl font-semibold">
          Nothing is playing
        </RelistenText>
      </View>
    );
  }

  return (
    <View className={tw('pb-4', showDecorativeIdentity ? 'pt-4' : 'pt-7')}>
      {showDecorativeIdentity && (
        <ShowIdentity
          currentTrack={currentTrack.sourceTrack}
          // The phone's audio drives the visualizer, so it rests while another device plays.
          visualizerActive={visualizerActive && !castStatus.isCasting && !remote}
        />
      )}
      <View className={showDecorativeIdentity ? 'mt-3' : undefined}>
        <CurrentTrackInfo
          currentPlayerTrack={currentTrack}
          headingRef={headingRef}
          onBeforeNavigate={onBeforeNavigate}
        />
      </View>
      <NowPlayingTransport onScrubbingChange={onScrubbingChange} remote={remote} />
      <View className="mt-3 pb-1 pt-1">
        <PlayerSecondaryControls
          historyButton={
            onOpenHistory ? (
              <TouchableOpacity
                accessibilityLabel="Listening history"
                accessibilityRole="button"
                className="h-11 w-11 items-center justify-center"
                onPress={onOpenHistory}
              >
                <MaterialIcons name="history" size={20} color="rgba(255,255,255,0.62)" />
              </TouchableOpacity>
            ) : undefined
          }
        />
        <PlayerOutputRoute cn="mt-1 px-6 text-center text-sm text-relisten-blue-200" />
      </View>
    </View>
  );
}
