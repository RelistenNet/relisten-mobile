import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import { RelistenText } from '@/relisten/components/relisten_text';
import {
  RelistenCastButton,
  useRelistenCastStatus,
  useShouldRenderCastButton,
} from '@/relisten/casting/cast_ui';
import { audioAdjustmentNative } from '@/relisten/player/audio_adjustments/audio_adjustment_native';
import { useAudioAdjustmentConfiguration } from '@/relisten/player/audio_adjustments/audio_adjustment_repo';
import {
  useRelistenPlayer,
  useRelistenPlayerPlaybackState,
} from '@/relisten/player/relisten_player_hooks';
import {
  useRelistenPlayerCurrentTrack,
  useRelistenPlayerQueue,
  useRelistenPlayerRepeatState,
  useRelistenPlayerShuffleState,
} from '@/relisten/player/relisten_player_queue_hooks';
import { PlayerRepeatState, PlayerShuffleState } from '@/relisten/player/relisten_player_queue';
import { PlayerAudioVisualizer } from '@/relisten/player/ui/player_audio_visualizer';
import { PlayerActionsMenu } from '@/relisten/player/ui/player_actions_menu';
import {
  playerDisplayDate,
  playerDisplayTitle,
  playerPosterDate,
} from '@/relisten/player/ui/player_display_helpers';
import { ScrubberRow } from '@/relisten/player/ui/player_scrubber';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { tw } from '@/relisten/util/tw';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { type Ref } from 'react';
import { Platform, Share, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import AirPlayButton from 'react-native-airplay-button';
import * as Progress from 'react-native-progress';

function ShowIdentity({ visualizerActive }: { visualizerActive: boolean }) {
  const currentTrack = useRelistenPlayerCurrentTrack()?.sourceTrack;
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
              <View className="h-px flex-1 bg-relisten-blue-700/60" />
              <RelistenText
                adjustsFontSizeToFit
                allowFontScaling={false}
                className="min-w-0 shrink text-center font-semibold uppercase text-relisten-blue-200/70"
                minimumFontScale={0.72}
                numberOfLines={2}
                selectable={false}
                style={{
                  fontSize: 13 * posterScale,
                  letterSpacing: 3 * posterScale,
                  lineHeight: 18 * posterScale,
                }}
              >
                {venue.name}
              </RelistenText>
              <View className="h-px flex-1 bg-relisten-blue-700/60" />
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
        <View className="mb-2 mt-5 w-full px-3">
          <PlayerAudioVisualizer active={visualizerActive} />
        </View>
      </View>
    </View>
  );
}

function CurrentTrackInfo({
  castStatus,
  headingRef,
  onBeforeNavigate,
}: {
  castStatus: ReturnType<typeof useRelistenCastStatus>;
  headingRef?: Ref<View>;
  onBeforeNavigate: () => void;
}) {
  const currentPlayerTrack = useRelistenPlayerCurrentTrack();
  const { isCasting, deviceName } = castStatus;
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
      accessibilityLabel="Share current track"
      accessibilityRole="button"
      className="min-h-11 min-w-11 items-center justify-center rounded-full border border-white/25 bg-white/5"
      onPress={onShare}
    >
      <MaterialIcons color="white" name={Platform.OS === 'ios' ? 'ios-share' : 'share'} size={21} />
    </TouchableOpacity>
  );

  const actionButtons = (
    <View className="flex-row items-center gap-2">
      {shareButton}
      <PlayerActionsMenu onBeforeNavigate={onBeforeNavigate}>
        <View
          accessible
          accessibilityLabel="Player actions"
          accessibilityRole="button"
          className="min-h-11 min-w-11 items-center justify-center rounded-full border border-white/25 bg-white/5"
          collapsable={false}
        >
          <Ionicons color="white" name="ellipsis-horizontal" size={22} />
        </View>
      </PlayerActionsMenu>
    </View>
  );

  const trackDetails = (
    <View
      ref={headingRef}
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="header"
      className={isAccessibilityLayout ? 'min-w-0' : 'min-w-0 flex-1'}
    >
      <RelistenText
        className="text-2xl font-bold leading-tight"
        numberOfLines={fontScale < 1.4 ? 2 : undefined}
        selectable={false}
      >
        {displayTitle}
      </RelistenText>
      <RelistenText
        className="mt-1 text-lg"
        numberOfLines={fontScale < 1.4 ? 1 : undefined}
        selectable={false}
      >
        {artist.name} · {playerDisplayDate(show.displayDate)}
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
      {isCasting && (
        <RelistenText
          className="mt-1 text-sm text-relisten-blue-200"
          numberOfLines={1}
          selectable={false}
        >
          Casting{deviceName ? ` to ${deviceName}` : ''}
        </RelistenText>
      )}
    </View>
  );

  return (
    <View className="px-6">
      {isAccessibilityLayout ? (
        <View className="gap-2">
          {trackDetails}
          <View className="items-end">{actionButtons}</View>
        </View>
      ) : (
        <View className="flex-row items-center justify-between gap-3">
          {trackDetails}
          {actionButtons}
        </View>
      )}
    </View>
  );
}

function PlayerControls() {
  const player = useRelistenPlayer();
  const playbackState = useRelistenPlayerPlaybackState();

  let playbackStateIcon = <MaterialIcons color="white" name="play-arrow" size={46} />;
  let playbackLabel = 'Play';

  if (playbackState === RelistenPlaybackState.Playing) {
    playbackStateIcon = <MaterialIcons color="white" name="pause" size={46} />;
    playbackLabel = 'Pause';
  } else if (playbackState === RelistenPlaybackState.Stalled) {
    playbackStateIcon = <Progress.CircleSnail color="white" indeterminate size={34} />;
    playbackLabel = 'Buffering';
  }

  return (
    <View className="flex-row items-center justify-between px-12">
      <TouchableOpacity
        accessibilityLabel="Previous track"
        accessibilityRole="button"
        className="min-h-11 min-w-11 items-center justify-center"
        onPress={() => player.back()}
      >
        <MaterialCommunityIcons color="white" name="skip-backward" size={34} />
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityLabel={playbackLabel}
        accessibilityRole="button"
        className="h-16 w-16 items-center justify-center rounded-full border border-white/30 bg-white/5"
        onPress={() => player.togglePauseResume()}
      >
        {playbackStateIcon}
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityLabel="Next track"
        accessibilityRole="button"
        accessibilityState={{ disabled: player.queue.isCurrentTrackLast }}
        className={tw(
          'min-h-11 min-w-11 items-center justify-center',
          player.queue.isCurrentTrackLast && 'opacity-40'
        )}
        disabled={player.queue.isCurrentTrackLast}
        onPress={() => player.next()}
      >
        <MaterialCommunityIcons color="white" name="skip-forward" size={34} />
      </TouchableOpacity>
    </View>
  );
}

function PlayerSecondaryControls() {
  const queue = useRelistenPlayerQueue();
  const [shuffleState] = useRelistenPlayerShuffleState();
  const [repeatState] = useRelistenPlayerRepeatState();
  const audioEqualizerConfiguration = useAudioAdjustmentConfiguration();
  const shouldRenderCastButton = useShouldRenderCastButton();

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
  };

  const toggleRepeat = () => {
    const nextRepeatState =
      repeatState === PlayerRepeatState.REPEAT_OFF
        ? PlayerRepeatState.REPEAT_QUEUE
        : repeatState === PlayerRepeatState.REPEAT_QUEUE
          ? PlayerRepeatState.REPEAT_TRACK
          : PlayerRepeatState.REPEAT_OFF;

    queue.setRepeatState(nextRepeatState);
  };

  return (
    <View className="flex-row items-center justify-between px-4">
      <TouchableOpacity
        accessibilityLabel={isShuffleOn ? 'Turn shuffle off' : 'Turn shuffle on'}
        accessibilityRole="button"
        accessibilityState={{ selected: isShuffleOn }}
        className="h-11 w-11 items-center justify-center"
        onPress={toggleShuffle}
      >
        <View className="h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/5">
          <MaterialCommunityIcons
            color={isShuffleOn ? RelistenBlue['300'] : inactiveColor}
            name="shuffle"
            size={20}
          />
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityLabel="Change repeat mode"
        accessibilityRole="button"
        accessibilityState={{ selected: isRepeatOn }}
        className="h-11 w-11 items-center justify-center"
        onPress={toggleRepeat}
      >
        <View className="h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/5">
          <MaterialCommunityIcons
            color={isRepeatOn ? RelistenBlue['300'] : inactiveColor}
            name={isRepeatTrack ? 'repeat-once' : 'repeat'}
            size={20}
          />
        </View>
      </TouchableOpacity>
      {supportsAudioEqualizer && (
        <TouchableOpacity
          accessibilityLabel="Open Audio Equalizer"
          accessibilityRole="button"
          accessibilityState={{ selected: isAudioEqualizerOn }}
          className="h-11 w-11 items-center justify-center"
          onPress={() => router.push('/relisten/audio-adjustments')}
        >
          <View className="h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/5">
            <MaterialCommunityIcons
              color={isAudioEqualizerOn ? RelistenBlue['300'] : inactiveColor}
              name="equalizer"
              size={20}
            />
          </View>
        </TouchableOpacity>
      )}
      {shouldRenderCastButton && (
        <View className="h-11 w-11 items-center justify-center">
          <View className="h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/5">
            <RelistenCastButton className="h-5 w-5" tintColor={inactiveColor} />
          </View>
        </View>
      )}
      {Platform.OS === 'ios' && (
        <View className="h-11 w-11 items-center justify-center">
          <View className="h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/5">
            <AirPlayButton
              activeTintColor="white"
              className="h-5 w-5"
              prioritizesVideoDevices={false}
              tintColor={inactiveColor}
            />
          </View>
        </View>
      )}
    </View>
  );
}

type PlayerNowPlayingProps = {
  headingRef?: Ref<View>;
  onBeforeNavigate: () => void;
  visualizerActive?: boolean;
};

export function PlayerNowPlaying({
  headingRef,
  onBeforeNavigate,
  visualizerActive = true,
}: PlayerNowPlayingProps) {
  const currentTrack = useRelistenPlayerCurrentTrack();
  const castStatus = useRelistenCastStatus();
  const { fontScale } = useWindowDimensions();
  const showDecorativeIdentity = fontScale < 1.4;

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
    <View className={tw('pb-6', showDecorativeIdentity ? 'pt-4' : 'pt-6')}>
      {showDecorativeIdentity && (
        <ShowIdentity visualizerActive={visualizerActive && !castStatus.isCasting} />
      )}
      <View className={showDecorativeIdentity ? 'mt-4' : undefined}>
        <CurrentTrackInfo
          castStatus={castStatus}
          headingRef={headingRef}
          onBeforeNavigate={onBeforeNavigate}
        />
      </View>
      <View className="mt-5 px-6">
        <ScrubberRow subduedCache />
      </View>
      <View className="mt-1">
        <PlayerControls />
      </View>
      <View className="mt-6 pb-4 pt-2">
        <PlayerSecondaryControls />
      </View>
    </View>
  );
}
