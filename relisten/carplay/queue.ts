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
    template.updateSections(buildSections(ctx));
  };

  teardowns.push(queue.onOrderedTracksChanged.addListener(updateSections));
  teardowns.push(queue.onCurrentTrackChanged.addListener(updateSections));
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
      if (id === 'shuffle') {
        const nextShuffleState =
          ctx.player.queue.shuffleState === PlayerShuffleState.SHUFFLE_ON
            ? PlayerShuffleState.SHUFFLE_OFF
            : PlayerShuffleState.SHUFFLE_ON;
        ctx.player.queue.setShuffleState(nextShuffleState);
        return;
      }

      if (id === 'repeat') {
        const currentRepeat = ctx.player.queue.repeatState;
        const nextRepeatState =
          currentRepeat === PlayerRepeatState.REPEAT_OFF
            ? PlayerRepeatState.REPEAT_QUEUE
            : currentRepeat === PlayerRepeatState.REPEAT_QUEUE
              ? PlayerRepeatState.REPEAT_TRACK
              : PlayerRepeatState.REPEAT_OFF;
        ctx.player.queue.setRepeatState(nextRepeatState);
      }
    },
    buttons: [
      {
        id: 'shuffle',
        type: 'shuffle',
      },
      {
        id: 'repeat',
        type: 'repeat',
      },
    ],
    onDidAppear() {
      ctx.nowPlayingVisible = true;
      carplay_logger.info('Now Playing appeared');
    },
    onDidDisappear() {
      ctx.nowPlayingVisible = false;
      carplay_logger.info('Now Playing disappeared');
    },
  });
}

function buildSections(ctx: RelistenCarPlayContext): ListSection[] {
  const queue = ctx.player.queue;
  const orderedTracks = queue.orderedTracks;
  const current = queue.currentTrack;
  const progress = playbackProgress.lastState();
  const playbackStatus = playbackState.lastState() ?? ctx.player.state;

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
