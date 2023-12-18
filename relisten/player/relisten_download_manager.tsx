import {
  createDownloadResumable,
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
} from 'expo-file-system';
import { SourceTrack } from '../realm/models/source_track';
import { realm } from '../realm/schema';

/*import { assertEvent, assign, createActor, fromPromise, setup } from 'xstate';

export const downloadMachine = setup({
  actions: {
    addToQueue: assign({
      queue: ({ context, event }) => {
        assertEvent(event, 'addToQueue');

        return context.queue.concat(event.sourceTrack);
      },
    }),
    removeFromQueue: assign({
      queue: ({ context }) => {
        return context.queue.slice(1);
      },
    }),
  },

  guards: {
    hasItems: ({ context }) => {
      return context.queue.length > 0;
    },
    isEmpty: ({ context }) => {
      return context.queue.length === 0;
    },
  },
  actors: {
    downloadNextFile: fromPromise(async ({ input }: { input: { sourceTrack: SourceTrack } }) => {
      const nextTrack = input.sourceTrack;
      if (nextTrack) {
        await RelistenDownloadManager.download(nextTrack, console.log);
      }
    }),
  },
  types: {
    events: {} as { type: '' } | { type: 'addToQueue'; sourceTrack: SourceTrack },
    context: {} as { queue: SourceTrack[] },
  },
}).createMachine({
  id: 'downloadManager',
  initial: 'Idle',

  context: { queue: [] },
  states: {
    Idle: {
      always: {
        guard: 'hasItems',
        target: 'Downloading',
      },
    },
    Downloading: {
      invoke: {
        src: 'downloadNextFile',
        id: 'downloadNextFile',
        input: ({ context }) => ({ sourceTrack: context.queue[0] }),
        onDone: [
          {
            actions: 'removeFromQueue',
          },
          {
            target: 'Idle',
            guard: 'isEmpty',
          },
          {
            target: 'Downloading',
          },
        ],
      },
    },
  },

  on: {
    addToQueue: {
      actions: {
        type: 'addToQueue',
      },
    },
  },
});

const actor = createActor(downloadMachine, {});
actor.start();
*/
export class RelistenDownloadManager {
  static DEFAULT_INSTANCE = new RelistenDownloadManager();
  // static MACHINE = actor;
  queue: SourceTrack[] = [];

  addToQueue(sourceTrack: SourceTrack) {
    this.queue.push(sourceTrack);
  }

  async downloadImmediately(sourceTrack: SourceTrack, callback?: () => void) {
    let responded = 0;
    // this is intentional...
    // eslint-disable-next-line no-async-promise-executor
    if (sourceTrack.isDownloaded) {
      return;
    }

    await this.ensureDirExists();

    console.log('Initiate Download for track', sourceTrack.uuid);

    const downloadResumable = createDownloadResumable(
      sourceTrack.mp3Url,
      sourceTrack.filePath,
      {},
      (progress) => {
        console.log(progress);
        realm?.write(() => {
          sourceTrack.totalBytesExpectedToWrite = progress.totalBytesExpectedToWrite;
          sourceTrack.totalBytesWritten = progress.totalBytesWritten;
        });
        // this lets our parent know that we started downloading.
        if (callback && ++responded === 5) {
          // callback();
        }
      }
    );

    const savable = downloadResumable.savable();

    if (savable) {
      console.log(savable, typeof savable.url);
      // realm?.write(() => {
      //   sourceTrack.downloadPauseState = {
      //     url: String(savable.url),
      //     resumeData: savable.resumeData,
      //     fileUri: savable.fileUri,
      //   };
      // });

      downloadResumable.downloadAsync().then(() => {
        this.checkForNextTrack();
      });
    }
  }

  checkForNextTrack = () => {
    const nextTrack = this.queue.shift();

    if (nextTrack) {
      this.downloadImmediately(nextTrack);
    }
  };

  ensureDirExists = async () => {
    const dir = documentDirectory + '/audio';
    const dirInfo = await getInfoAsync(dir);
    console.log(dirInfo);
    if (!dirInfo.exists) {
      console.log("Directory doesn't exist, creating…");
      await makeDirectoryAsync(dir, { intermediates: true });
    }
  };
}
