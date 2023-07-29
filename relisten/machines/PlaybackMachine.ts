import { RelistenPlaybackState, RelistenStreamable, player } from '@/modules/relisten-audio-player';
import { assign, createMachine, fromCallback, interpret } from 'xstate';

type PlaybackTrack = RelistenStreamable & {
  title: string;
  showUuid: string;
  artistUuid: string;
  sourceUuid: string;
};

interface PlaybackContext {
  queue: PlaybackTrack[];
  activeTrackIndex: number;
  initializedPlayer: boolean;
  playbackState: `${RelistenPlaybackState}`;
}

type PlaybackEvents =
  | { type: 'BYPASS' }
  | { type: 'PAUSE' }
  | { type: 'SKIP_TO'; nextIndex: number }
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
    types: {
      context: {} as PlaybackContext,
      events: {} as PlaybackEvents,
      // actions: {} as PlaybackActions,
      typegen: {} as import('./PlaybackMachine.typegen').Typegen0,
    },
    description: 'Relisten Playback',
    initial: 'idle',
    states: {
      idle: {
        invoke: {
          id: 'initializeMachine',
          src: fromCallback((callback) => {
            console.log('!!!!!!!!!!! initializeMachine', player.currentState, 1);
            if (player.currentState !== 'Stopped') {
              callback({ type: 'BYPASS' });
            }
          }),
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
          input: ({ context }) => {
            return {
              activeTrackIndex: context.activeTrackIndex,
              queue: context.queue,
            }; // etc.
          },
          src: fromCallback((callback, recieve, { input }) => {
            const trackChangedListener = player.addTrackChangedListener((trackChanged) => {
              const activeIndex = input.activeTrackIndex;
              const queueTail = input.queue.slice(activeIndex + 1);
              const index = queueTail.findIndex(
                (track) => track.identifier === trackChanged?.currentIdentifier
              );

              console.log('next track', {
                activeIndex,
                queueTail,
                index,
                n: index + activeIndex,
              });

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
          }),
        },
        on: {
          UPDATE_QUEUE: {
            reenter: true,
            actions: ['updateQueue'],
          },
          RESUME: {
            reenter: true,
            actions: ['resumePlayer'],
          },
          SKIP_TO: {
            reenter: true,
            actions: ['setActiveIndex'],
          },
          PAUSE: {
            reenter: true,
            actions: ['pausePlayer'],
          },
          PLAYPAUSE: {
            reenter: true,
            actions: ['playPause'],
          },
          PLAYBACK_CHANGED: {
            reenter: true,
            actions: ['playbackChanged'],
          },
          NEXT_TRACK: {
            reenter: true,
            actions: ['skipForward', 'setNextStream'],
          },
          SKIP_FORWARD: {
            reenter: true,
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
            reenter: true,
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
  },
  {
    actions: {
      updateQueue: assign({
        queue: ({ event }) => event.queue,
        activeTrackIndex: ({ event }) => event.trackIndex ?? 0,
      }),

      playActiveTrack: ({ context }) => {
        const activeTrack = context.queue[context.activeTrackIndex];

        player.play(activeTrack);
      },
      setActiveTrack: assign(({ event }) => ({
        activeTrackIndex: event.trackIndex,
      })),
      resumePlayer: ({ context }) => {
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
      playbackChanged: assign(({ event }) => ({
        playbackState: event.playbackState,
      })),
      skipBack: assign(({ context }) => ({
        activeTrackIndex: Math.max(context.activeTrackIndex - 1, 0),
      })),
      skipForward: assign(({ context }) => ({
        activeTrackIndex: Math.min(context.activeTrackIndex + 1, context.queue.length - 1),
      })),
      setInitialized: assign({
        initializedPlayer: true,
      }),
      setActiveIndex: assign(({ event }) => ({ activeTrackIndex: event.nextIndex })),
      setNextStream: ({ context }) => {
        const nextTrack = context.queue[context.activeTrackIndex + 1];

        if (nextTrack) {
          player.setNextStream(nextTrack);
        }
      },
    },
    guards: {
      hasMoreTracks: ({ context }) => {
        if (context.activeTrackIndex + 1 < context.queue.length) return true;

        return false;
      },
    },
  }
);

const state = player.DEBUG_STATE;
// console.log('INIT STATE', state);

const localMachine = interpret(machine, {
  deferEvents: false,
  state: state ? JSON.parse(state) : undefined,
}).start();

localMachine.subscribe(() => {
  const persistedState = localMachine.getPersistedState();

  if (persistedState) {
    player.DEBUG_STATE = JSON.stringify(persistedState);
    // console.log('DEBUG', player.DEBUG_STATE);
  }
});

export default localMachine;
