import { CarPlay, ListTemplate, NowPlayingTemplate } from '@g4rb4g3/react-native-carplay';
import { ListSection } from '@g4rb4g3/react-native-carplay/src/interfaces/ListSection';
import { RelistenCarPlayContext } from '@/relisten/carplay/relisten_car_play_context';
import {
  PlayerQueueTrack,
  PlayerRepeatState,
  PlayerShuffleState,
} from '@/relisten/player/relisten_player_queue';
import {
  progress as playbackProgress,
  state as playbackState,
} from '@/relisten/player/shared_state';
import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import plur from 'plur';
import { carplay_logger } from '@/relisten/carplay/carplay_logger';

const ACTION_SHUFFLE = 'action-shuffle';
const ACTION_REPEAT = 'action-repeat';
const ACTION_CLEAR = 'action-clear';
const ACTION_NOW_PLAYING = 'action-open-now-playing';

interface QueueTemplateOptions {
  title?: string;
  tabTitle?: string;
  backButtonHidden?: boolean;
  includeNowPlayingRow?: boolean;
}

export function createQueueListTemplate(
  ctx: RelistenCarPlayContext,
  options?: QueueTemplateOptions
): ListTemplate {
  const queue = ctx.player.queue;
  const teardowns: Array<() => void> = [];

  const cleanup = () => {
    carplay_logger.info('Queue template cleanup');
    for (const teardown of teardowns) {
      try {
        teardown();
      } catch (e) {
        carplay_logger.error('Error tearing down queue template', e);
      }
    }
  };

  const template = new ListTemplate({
    title: options?.title ?? 'Now Playing',
    tabTitle: options?.tabTitle ?? 'Queue',
    tabSystemImageName: 'music.pages.fill',
    backButtonHidden: options?.backButtonHidden,
    onBackButtonPressed: cleanup,
    async onItemSelect({ id }: { templateId: string; index: number; id: string }) {
      if (id === ACTION_SHUFFLE) {
        carplay_logger.info('Queue action shuffle toggle');
        const newShuffleState =
          queue.shuffleState === PlayerShuffleState.SHUFFLE_ON
            ? PlayerShuffleState.SHUFFLE_OFF
            : PlayerShuffleState.SHUFFLE_ON;
        queue.setShuffleState(newShuffleState);
        updateSections();
        return;
      }

      if (id === ACTION_REPEAT) {
        carplay_logger.info('Queue action repeat toggle');
        const nextRepeat = nextRepeatState(queue.repeatState);
        queue.setRepeatState(nextRepeat);
        updateSections();
        return;
      }

      if (id === ACTION_CLEAR) {
        carplay_logger.info('Queue action clear');
        queue.replaceQueue([], undefined);
        updateSections();
        return;
      }

      if (id === ACTION_NOW_PLAYING) {
        carplay_logger.info('Queue action open now playing');
        ctx.showNowPlaying?.();
        return;
      }

      const trackIndex = queue.orderedTracks.findIndex((t) => t.identifier === id);

      if (trackIndex >= 0) {
        carplay_logger.info('Queue select track', { trackIndex, id });
        ctx.player.playTrackAtIndex(trackIndex);
      }
    },
    sections: [],
    emptyViewTitleVariants: ['Loading queue...'],
  });

  const updateSections = () => {
    carplay_logger.info('Queue template update sections', {
      orderedTracks: queue.orderedTracks.length,
      shuffle: queue.shuffleState,
      repeat: queue.repeatState,
    });
    template.updateSections(buildSections(ctx, options));
  };

  teardowns.push(queue.onOrderedTracksChanged.addListener(updateSections));
  teardowns.push(queue.onCurrentTrackChanged.addListener(updateSections));
  teardowns.push(queue.onShuffleStateChanged.addListener(updateSections));
  teardowns.push(queue.onRepeatStateChanged.addListener(updateSections));
  // teardowns.push(playbackProgress.addListener(updateSections));
  teardowns.push(playbackState.addListener(updateSections));
  ctx.addTeardown(cleanup);

  updateSections();

  return template;
}

export function createNowPlayingTemplate(
  ctx: RelistenCarPlayContext,
  buildQueueTemplate: () => ListTemplate
): NowPlayingTemplate {
  return new NowPlayingTemplate({
    id: 'relisten-now-playing',
    tabTitle: 'Now Playing',
    albumArtistButtonEnabled: false,
    upNextButtonEnabled: true,
    upNextButtonTitle: 'Up Next',
    onUpNextButtonPressed() {
      const queueTemplate = buildQueueTemplate();
      CarPlay.pushTemplate(queueTemplate, true);
    },
    onButtonPressed({ id }) {
      if (id === ACTION_SHUFFLE) {
        const queue = ctx.player.queue;
        const newShuffleState =
          queue.shuffleState === PlayerShuffleState.SHUFFLE_ON
            ? PlayerShuffleState.SHUFFLE_OFF
            : PlayerShuffleState.SHUFFLE_ON;
        queue.setShuffleState(newShuffleState);
      } else if (id === ACTION_REPEAT) {
        const queue = ctx.player.queue;
        queue.setRepeatState(nextRepeatState(queue.repeatState));
      }
    },
    onDidAppear() {
      ctx.nowPlayingVisible = true;
      carplay_logger.info('Now Playing appeared');
    },
    onDidDisappear() {
      ctx.nowPlayingVisible = false;
      carplay_logger.info('Now Playing disappeared');
    },
    buttons: [
      { id: ACTION_SHUFFLE, type: 'shuffle' },
      { id: ACTION_REPEAT, type: 'repeat' },
    ],
  });
}

function buildSections(ctx: RelistenCarPlayContext, options?: QueueTemplateOptions): ListSection[] {
  const queue = ctx.player.queue;
  const orderedTracks = queue.orderedTracks;
  const current = queue.currentTrack;
  const progress = playbackProgress.lastState();
  const playbackStatus = playbackState.lastState() ?? ctx.player.state;

  const actionItems = [];

  if (options?.includeNowPlayingRow !== false) {
    actionItems.push({ id: ACTION_NOW_PLAYING, text: 'Open Now Playing' });
  }

  actionItems.push({
    id: ACTION_SHUFFLE,
    text: `Shuffle: ${queue.shuffleState === PlayerShuffleState.SHUFFLE_ON ? 'On' : 'Off'}`,
  });

  actionItems.push({
    id: ACTION_REPEAT,
    text: `Repeat: ${repeatLabel(queue.repeatState)}`,
  });

  if (orderedTracks.length > 0) {
    actionItems.push({ id: ACTION_CLEAR, text: 'Clear Queue' });
  }

  const trackItems = orderedTracks.map((track: PlayerQueueTrack) => {
    const isCurrent = current?.identifier === track.identifier;
    const isPlaying = isCurrent && playbackStatus === RelistenPlaybackState.Playing;

    return {
      id: track.identifier,
      text: track.title,
      detailText: track.artist || track.albumTitle,
      isPlaying,
      playbackProgress: isCurrent && progress ? progress.percent : undefined,
      showsDisclosureIndicator: false,
      selected: isCurrent,
    };
  });

  const sections: ListSection[] = [];

  sections.push({ header: 'Controls', items: actionItems });

  if (trackItems.length > 0) {
    sections.push({
      header: `Up Next (${trackItems.length} ${plur('track', trackItems.length)})`,
      items: trackItems,
    });
  } else {
    sections.push({ header: 'Up Next', items: [{ id: 'empty-queue', text: 'Queue is empty' }] });
  }

  return sections;
}

function nextRepeatState(current: PlayerRepeatState) {
  switch (current) {
    case PlayerRepeatState.REPEAT_OFF:
      return PlayerRepeatState.REPEAT_QUEUE;
    case PlayerRepeatState.REPEAT_QUEUE:
      return PlayerRepeatState.REPEAT_TRACK;
    case PlayerRepeatState.REPEAT_TRACK:
    default:
      return PlayerRepeatState.REPEAT_OFF;
  }
}

function repeatLabel(repeatState: PlayerRepeatState) {
  switch (repeatState) {
    case PlayerRepeatState.REPEAT_QUEUE:
      return 'Queue';
    case PlayerRepeatState.REPEAT_TRACK:
      return 'Track';
    case PlayerRepeatState.REPEAT_OFF:
    default:
      return 'Off';
  }
}
