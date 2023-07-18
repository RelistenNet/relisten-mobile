import { RelistenPlaybackState, RelistenStreamable, player } from '@/modules/relisten-audio-player';
import { createMachine, assign, interpret } from 'xstate';

type PlaybackTrack = RelistenStreamable & { title: string };

interface PlaybackContext {
  queue: PlaybackTrack[];
  activeTrackIndex: number;
  initializedPlayer: boolean;
  playbackState: `${RelistenPlaybackState}`;
}

type PlaybackEvents =
  | { type: 'BYPASS' }
  | { type: 'PAUSE' }
  | { type: 'SKIP_TO' }
  | { type: 'RESUME' }
  | { type: 'SKIP_FORWARD' }
  | { type: 'SKIP_BACK' }
  | { type: 'NEXT_TRACK'; nextIndex: number }
  | { type: 'PLAYBACK_CHANGED'; playbackState: `${RelistenPlaybackState}` }
  | { type: 'UPDATE_QUEUE'; trackIndex: number; queue: PlaybackTrack[] }
  | { type: 'PLAYPAUSE' };

export const machine = createMachine(
  {
    id: 'Relisten Playback',
    context: {
      queue: [],
      activeTrackIndex: -1,
      initializedPlayer: false,
      playbackState: 'Stopped',
    },
    schema: {
      context: {} as PlaybackContext,
      events: {} as PlaybackEvents,
      // actions: {} as PlaybackActions,
    },
    description: 'Relisten Playback',
    initial: 'idle',
    states: {
      idle: {
        invoke: {
          id: 'initializeMachine',
          src: () => (callback) => {
            console.log('!!!!!!!!!!! initializeMachine', player.currentState, 1);
            if (player.currentState !== 'Stopped') {
              callback('BYPASS');
            }
          },
        },
        on: {
          UPDATE_QUEUE: {
            target: 'initialized',
            actions: [
              'updateQueue',
              'setActiveTrack',
              'playActiveTrack',
              'setInitialized',
              'setNextStream',
            ],
          },
          BYPASS: {
            target: 'initialized',
          },
        },
      },
      initialized: {
        invoke: {
          id: 'listenForTrack',
          src: (context) => (callback) => {
            const trackChangedListener = player.addTrackChangedListener((trackChanged) => {
              console.log({ trackChanged });
              const activeIndex = context.activeTrackIndex;
              const queueTail = context.queue.slice(activeIndex + 1);
              const index = queueTail.findIndex(
                (track) => track.identifier === trackChanged?.currentIdentifier
              );

              console.log('next track', { activeIndex, queueTail, index, n: index + activeIndex });

              callback({ type: 'NEXT_TRACK', nextIndex: index + activeIndex + 1 });
            });

            const playbackListener = player.addPlaybackStateListener(({ newPlaybackState }) => {
              console.log({ newPlaybackState });

              callback({ type: 'PLAYBACK_CHANGED', playbackState: newPlaybackState });
            });

            callback({ type: 'PLAYBACK_CHANGED', playbackState: player.currentState });

            return () => {
              trackChangedListener.remove();
              playbackListener.remove();
            };
          },
        },
        on: {
          UPDATE_QUEUE: {
            internal: true,
            actions: ['updateQueue'],
          },
          RESUME: {
            internal: true,
            actions: ['resumePlayer'],
          },
          SKIP_TO: {
            internal: true,
            actions: ['setActiveIndex'],
          },
          PAUSE: {
            internal: true,
            actions: ['pausePlayer'],
          },
          PLAYPAUSE: {
            internal: true,
            actions: ['playPause'],
          },
          PLAYBACK_CHANGED: {
            internal: true,
            actions: ['playbackChanged'],
          },
          NEXT_TRACK: {
            internal: true,
            actions: ['skipForward', 'setNextStream'],
          },
          SKIP_FORWARD: {
            internal: true,
            actions: [
              // 'pausePlayer',
              // 'stop',
              // 'stopPlayer',
              'skipForward',
              'playActiveTrack',
              // 'pausePlayer',
              'setNextStream',
            ],
          },
          SKIP_BACK: {
            internal: true,
            actions: [
              // 'pausePlayer',
              // 'stop',
              // 'stopPlayer',
              'skipBack',
              'playActiveTrack',
              // 'pausePlayer',
              'setNextStream',
            ],
          },
        },
      },
    },

    predictableActionArguments: true,
    preserveActionOrder: true,
    tsTypes: {} as import('./PlaybackMachine.typegen').Typegen0,
  },
  {
    actions: {
      updateQueue: assign({
        queue: (context, event) => event.queue,
        activeTrackIndex: (context, event) => event.trackIndex ?? 0,
      }),

      playActiveTrack: (context) => {
        const activeTrack = context.queue[context.activeTrackIndex];

        player.play(activeTrack);
      },
      setActiveTrack: assign((context, event) => ({
        activeTrackIndex: event.trackIndex,
      })),
      resumePlayer: (context) => {
        if (context.initializedPlayer) {
          player.resume();
        }
      },
      stopPlayer: () => {
        player.stop();
      },
      pausePlayer: () => {
        player.pause();
      },
      playPause: () => {
        if (player.currentState === 'Playing') player.pause();
        if (player.currentState === 'Paused') player.resume();
      },
      playbackChanged: assign((context, event) => ({
        playbackState: event.playbackState,
      })),
      skipBack: assign((context) => ({
        activeTrackIndex: Math.max(context.activeTrackIndex - 1, 0),
      })),
      skipForward: assign((context) => ({
        activeTrackIndex: Math.min(context.activeTrackIndex + 1, context.queue.length - 1),
      })),
      setInitialized: assign({
        initializedPlayer: true,
      }),
      setActiveIndex: assign((context, event: any) => ({ activeTrackIndex: event.nextIndex })),
      setNextStream: (context) => {
        const nextTrack = context.queue[context.activeTrackIndex + 1];

        if (nextTrack) {
          player.setNextStream(nextTrack);
        }
      },
    },
    guards: {
      hasMoreTracks: (context) => {
        if (context.activeTrackIndex + 1 < context.queue.length) return true;

        return false;
      },
    },
  }
);

const PlaybackMachine = interpret(machine, {
  deferEvents: false,
})
  .onTransition((state, foo) => console.log(foo, state.value, state.context))
  .start();

export default PlaybackMachine;
