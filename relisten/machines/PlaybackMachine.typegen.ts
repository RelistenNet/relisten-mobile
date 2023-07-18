
  // This file was automatically generated. Edits will be overwritten

  export interface Typegen0 {
        '@@xstate/typegen': true;
        internalEvents: {
          "xstate.init": { type: "xstate.init" };
        };
        invokeSrcNameMap: {

        };
        missingImplementations: {
          actions: never;
          delays: never;
          guards: never;
          services: never;
        };
        eventsCausingActions: {
          "pausePlayer": "PAUSE";
"playActiveTrack": "SKIP_BACK" | "SKIP_FORWARD" | "UPDATE_QUEUE";
"playPause": "PLAYPAUSE";
"playbackChanged": "PLAYBACK_CHANGED";
"resumePlayer": "RESUME";
"setActiveIndex": "SKIP_TO";
"setActiveTrack": "UPDATE_QUEUE";
"setInitialized": "UPDATE_QUEUE";
"setNextStream": "SKIP_BACK" | "SKIP_FORWARD" | "UPDATE_QUEUE";
"skipBack": "SKIP_BACK";
"skipForward": "SKIP_FORWARD";
"updateQueue": "UPDATE_QUEUE";
        };
        eventsCausingDelays: {

        };
        eventsCausingGuards: {

        };
        eventsCausingServices: {
          "initializeMachine": "xstate.init";
"listenForTrack": "BYPASS" | "UPDATE_QUEUE";
        };
        matchesStates: "idle" | "initialized";
        tags: never;
      }
