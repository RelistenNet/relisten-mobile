import { RelistenStreamable, player } from '@/modules/relisten-audio-player';
import { createMachine, assign, interpret } from 'xstate';

interface PlaybackContext {
  queue: (RelistenStreamable & { title: string })[];
  activeTrackIndex: number;
  initializedPlayer: boolean;
}

type PlaybackEvents =
  | { type: 'PAUSE' }
  | { type: 'SKIP_TO' }
  | { type: 'RESUME' }
  | { type: 'NEXT_TRACK'; nextIndex: number }
  | { type: 'RESET_QUEUE' };

export const machine = createMachine(
  {
    id: 'Relisten Playback',
    context: {
      queue: [],
      activeTrackIndex: -1,
      initializedPlayer: false,
    },
    schema: {
      context: {} as PlaybackContext,
      events: {} as PlaybackEvents,
    },
    description: 'Relisten Playback',
    initial: 'idle',
    states: {
      idle: {
        on: {
          RESET_QUEUE: {
            target: 'paused',
            actions: [
              {
                type: 'stop',
              },
              {
                type: 'stopPlayer',
              },
              {
                type: 'resetQueue',
              },
            ],
          },
        },
      },
      paused: {
        on: {
          RESET_QUEUE: {
            target: 'paused',
            actions: [
              {
                type: 'stop',
              },
              {
                type: 'stopPlayer',
              },
              {
                type: 'resetQueue',
              },
            ],
          },
          RESUME: {
            target: 'playing',
            actions: {
              params: {},
              type: 'resumePlayer',
            },
          },
          SKIP_TO: {
            internal: true,
          },
          PAUSE: {
            internal: true,
            actions: {
              params: {},
              type: 'pausePlayer',
            },
          },
        },
      },
      playing: {
        invoke: {
          id: 'listenForTrack',
          src: (context) => (callback, onReceive) => {
            const playback = player.addTrackChangedListener((playbackState) => {
              const activeIndex = context.activeTrackIndex;
              const queueTail = context.queue.slice(activeIndex + 1);
              const index = queueTail.findIndex(
                (track) => track.identifier === playbackState?.currentIdentifier
              );

              console.log('next track', { activeIndex, queueTail, index, n: index + activeIndex });

              callback({ type: 'NEXT_TRACK', nextIndex: index + activeIndex + 1 });
            });

            return () => playback.remove();
          },
        },

        entry: [
          {
            params: {},
            type: 'initializePlayer',
          },
          {
            params: {},
            type: 'setInitialized',
          },
          {
            params: {},
            type: 'setNextStream',
          },
        ],
        on: {
          RESET_QUEUE: {
            target: 'paused',
            actions: [
              {
                type: 'stop',
              },
              {
                type: 'stopPlayer',
              },
              {
                type: 'resetQueue',
              },
            ],
          },
          PAUSE: {
            target: 'paused',
            actions: {
              params: {},
              type: 'pausePlayer',
            },
          },
          SKIP_TO: {
            internal: true,
          },
          NEXT_TRACK: [
            {
              target: 'playing',
              actions: {
                type: 'setActiveIndex',
              },
            },
          ],
          RESUME: {
            internal: true,
            actions: {
              params: {},
              type: 'resumePlayer',
            },
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
      resetQueue: assign({
        queue: (context, event: any) => event.queue,
        activeTrackIndex: 0,
      }),
      stop: assign({
        activeTrackIndex: -1,
        initializedPlayer: false,
      }),
      initializePlayer: (context) => {
        if (!context.initializedPlayer) {
          const activeTrack = context.queue[context.activeTrackIndex];

          player.play(activeTrack);
        }
      },
      resumePlayer: (context) => {
        if (context.initializedPlayer) {
          player.resume();
        }
      },
      stopPlayer: (context) => {
        if (context.initializedPlayer) {
          player.stop();
        }
      },
      pausePlayer: (context) => {
        if (context.initializedPlayer) {
          player.pause();
        }
      },
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
    services: {},
    guards: {
      hasMoreTracks: (context) => {
        if (context.activeTrackIndex + 1 < context.queue.length) return true;

        return false;
      },
    },
    delays: {},
  }
);

const PlaybackMachine = interpret(machine, {
  deferEvents: false,
})
  .onTransition((state, foo) => console.log(foo, state.value))
  .start();

export default PlaybackMachine;
