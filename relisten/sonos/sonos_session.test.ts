import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RelistenStreamable } from '@/modules/relisten-audio-player';

const mocks = vi.hoisted(() => ({
  native: {
    play: vi.fn<(stream: RelistenStreamable, startTimeMs?: number) => Promise<void>>(
      async () => {}
    ),
    pause: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    seekTo: vi.fn(async () => {}),
    seekToTime: vi.fn(async () => {}),
    setNextStream: vi.fn(),
    setShuffleMode: vi.fn(),
    setRepeatMode: vi.fn(),
    addPlaybackSnapshotListener: vi.fn(() => ({ remove: vi.fn() })),
  },
  showToast: vi.fn(),
}));
vi.mock('@/modules/relisten-audio-player', () => ({
  nativePlayer: mocks.native,
  RelistenPlaybackState: {
    Stopped: 'Stopped',
    Playing: 'Playing',
    Paused: 'Paused',
    Stalled: 'Stalled',
  },
}));
vi.mock('@/relisten/player/native_playback_state_hooks', () => ({ addPlayerListeners: vi.fn() }));
vi.mock('@/relisten/realm/schema', () => ({ realm: {} }));
vi.mock('@/relisten/realm/models/player_state', () => ({
  PlayerState: { upsert: vi.fn(), defaultObject: vi.fn(), clear: vi.fn() },
}));
vi.mock('@/relisten/realm/models/source_track', () => ({ SourceTrack: class {} }));
vi.mock('@/relisten/offline/download_manager', () => ({ DownloadManager: {} }));
vi.mock('@/relisten/events', () => ({
  sharedStatsigClient: () => ({ logEvent: vi.fn() }),
  trackPlaybackErrorEvent: vi.fn(),
}));
vi.mock('@/relisten/util/logging', () => ({
  log: { debug: vi.fn(), extend: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) },
}));
vi.mock('@/relisten/components/toast', () => ({ showToast: mocks.showToast }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active' } }));
vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes,
  randomUUID: () => `request-${Math.random()}`,
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import { RelistenPlayer } from '@/relisten/player/relisten_player';
import { PlayerQueueTrack, PlayerShuffleState } from '@/relisten/player/relisten_player_queue';
import {
  currentTrackIdentifier,
  PlaybackSource,
  playbackSource,
  state,
} from '@/relisten/player/shared_state';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
import { formatUuidTypedId } from '@/relisten/util/typed_uuid_id';
import type { SonosHandoffRequest } from './sonos_api';
import type { SonosHandoffOutcome } from './sonos_handoff';
import type { SonosPlayback, SonosQueueEntry, SonosTransport } from './sonos_playback';
import type { RoomQueueTracks } from './sonos_queue_tracks';
import type { SonosRoomState } from './sonos_room_store';
import { SonosSession } from './sonos_session';

function track(uuid: string, title: string) {
  const sourceTrack = {
    uuid,
    duration: 400,
    title,
    artist: { uuid: 'artist', slug: 'artist', name: 'Artist' },
    show: { uuid: 'show' },
    source: { uuid: 'source', displayDate: '1977-05-08' },
    streamingUrl: () => `https://example.com/${uuid}.mp3`,
    downloadedFileLocation: () => `/tmp/${uuid}.mp3`,
    supportsOfflineDownload: () => false,
  } as unknown as SourceTrack;
  return new PlayerQueueTrack(sourceTrack, title, 'Artist', 'Show', 'Album', 'art');
}

const entry = (queueTrack: PlayerQueueTrack): SonosQueueEntry => ({
  occurrenceId: queueTrack.identifier,
  trackId: formatUuidTypedId('track', queueTrack.sourceTrack.uuid),
});

/** Resolves when `release` is called; lets a test hold a room request while the phone acts. */
function gate() {
  let release: () => void = () => {};
  const opened = new Promise<void>((resolve) => (release = resolve));
  return { opened, release };
}

/**
 * The room as the session sees it through the store: its state, commands and
 * queue, under the server's rules for queue edits.
 */
class FakeRoom {
  state: SonosRoomState = { kind: 'none' };
  handle = 'h1';
  queue = { version: 1, entries: [] as SonosQueueEntry[] };
  /** Runs while a command is in flight, before the room applies it. */
  duringCommand: (() => void) | undefined;
  private readonly listeners = new Set<() => void>();
  private playbackState = 'PLAYBACK_STATE_PLAYING';
  private occurrenceId = '';
  private positionMillis = 0;
  private handedOff: { handle: string; occurrenceIds: string[] } | undefined;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getState = () => this.state;

  /** The room plays `occurrenceId` from its queue. */
  plays(occurrenceId: string, changes: { paused?: boolean; positionMillis?: number } = {}) {
    this.occurrenceId = occurrenceId;
    this.playbackState = changes.paused ? 'PLAYBACK_STATE_PAUSED' : 'PLAYBACK_STATE_PLAYING';
    this.positionMillis = changes.positionMillis ?? 0;
    this.publish();
  }

  publish() {
    this.state = { kind: 'active', playback: this.playback() };
    this.notify();
  }

  /** The store reports a command the room refused; it stays until the next command. */
  refusedCommand(message: string) {
    this.state = { kind: 'active', playback: this.playback(), commandError: message };
    this.notify();
  }

  /** The room can't confirm its current item just now. */
  unconfirmed() {
    this.state = { kind: 'checking', handle: this.handle, groupName: 'Office' };
    this.notify();
  }

  end(reason?: 'stopped' | 'reconnect') {
    this.state = reason
      ? { kind: 'none', ended: { roomName: 'Office', reason } }
      : { kind: 'none' };
    this.notify();
  }

  command = vi.fn(async (transport: SonosTransport) => {
    this.duringCommand?.();
    if (transport.action === 'skip') {
      this.occurrenceId = transport.occurrenceId;
      this.positionMillis = 0;
    } else if (transport.action === 'seek') {
      this.positionMillis = transport.positionMillis;
    } else {
      this.playbackState =
        transport.action === 'pause' ? 'PLAYBACK_STATE_PAUSED' : 'PLAYBACK_STATE_PLAYING';
    }
    this.publish();
    return true;
  });
  refresh = vi.fn(async () => {
    this.publish();
    return this.playback();
  });
  readQueue = vi.fn(async () => ({ handle: this.handle, queue: this.queue }));
  saveQueue = vi.fn(async (entries: readonly SonosQueueEntry[], expectedVersion: number) => {
    if (expectedVersion !== this.queue.version) {
      return { kind: 'refused' as const, message: 'The queue changed on another device.' };
    }
    const playing = this.queue.entries.findIndex((row) => row.occurrenceId === this.occurrenceId);
    const prefix = (rows: readonly SonosQueueEntry[]) =>
      rows
        .slice(0, playing + 1)
        .map((row) => row.occurrenceId)
        .join();
    if (prefix(entries) !== prefix(this.queue.entries)) {
      return {
        kind: 'refused' as const,
        message: 'Sonos keeps the tracks through the one playing.',
      };
    }
    this.queue = { version: this.queue.version + 1, entries: [...entries] };
    return { kind: 'saved' as const, version: this.queue.version };
  });
  /** A handoff the room takes: a new handle playing the handed-off order. */
  takeHandoff = (request: SonosHandoffRequest): SonosHandoffOutcome => {
    this.handle = `h${Number(this.handle.slice(1)) + 1}`;
    const occurrenceIds = request.occurrences.map((row) => row.occurrence_id);
    this.handedOff = { handle: this.handle, occurrenceIds };
    this.queue = {
      version: 1,
      entries: request.occurrences.map((row) => ({
        occurrenceId: row.occurrence_id,
        trackId: row.track_id,
      })),
    };
    this.plays(occurrenceIds[request.start_index]);
    return { kind: 'playing', handle: this.handle };
  };
  /** Leaves the outcome uncertain unless a test says otherwise. */
  handOff = vi.fn<
    (request: SonosHandoffRequest, groupName: string) => Promise<SonosHandoffOutcome>
  >(async () => ({ kind: 'uncertain', reconnect: false }));
  takeHandedOffOrder = (handle: string) => {
    const order = this.handedOff?.handle === handle ? this.handedOff.occurrenceIds : undefined;
    if (order) {
      this.handedOff = undefined;
    }
    return order;
  };
  release = vi.fn(() => this.end());
  handoffInFlight: { groupId: string; groupName: string } | undefined;
  getHandoffInFlight = () => this.handoffInFlight;
  /** Ends a handoff `settlingHandoff` holds open, as cancelled. */
  private abandon: (() => void) | undefined;
  abandonHandoff = vi.fn(() => {
    this.handoffInFlight = undefined;
    this.abandon?.();
  });
  /** The next handoff stays open until it is abandoned. */
  settlingHandoff() {
    this.handOff.mockImplementationOnce(
      (_request, groupName) =>
        new Promise<SonosHandoffOutcome>((resolve) => {
          this.handoffInFlight = { groupId: 'g1', groupName };
          this.abandon = () => resolve({ kind: 'cancelled' });
        })
    );
  }
  pauseRoomLeftBehind = vi.fn<(handle: string) => Promise<boolean>>(async () => true);
  contact = { lastUsedAt: Date.now() as number | undefined, lastReadFailed: false };
  getContact = () => this.contact;
  noteChosen = vi.fn();

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  private playback(): SonosPlayback {
    return {
      handle: this.handle,
      groupId: 'g1',
      groupName: 'Office',
      status: 'active',
      playbackState: this.playbackState,
      positionMillis: this.positionMillis,
      observedAt: Date.now(),
      queueVersion: this.queue.version,
      repeatMode: 'off',
      canRepeat: true,
      canRepeatOne: true,
      occurrence: {
        itemId: `item-${this.occurrenceId}`,
        occurrenceId: this.occurrenceId,
        durationMillis: 400000,
      },
    };
  }
}

const settle = async () => {
  for (let turn = 0; turn < 20; turn += 1) {
    await vi.advanceTimersByTimeAsync(0);
  }
};

const messages = () => mocks.showToast.mock.calls.map(([message]) => message);

describe('SonosSession', () => {
  let player: RelistenPlayer;
  let room: FakeRoom;
  let session: SonosSession;
  let stop: () => void;
  let tracks: PlayerQueueTrack[];
  /** Every recording these tests use, as the catalog would find them. */
  let catalog: PlayerQueueTrack[];
  const buildRoomQueue = vi.fn(
    async (entries: readonly SonosQueueEntry[]): Promise<RoomQueueTracks> => ({
      kind: 'built',
      tracks: entries.map((row) => catalog.find((known) => known.identifier === row.occurrenceId)!),
    })
  );

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    currentTrackIdentifier.setState(undefined);
    state.setState(RelistenPlaybackState.Stopped);
    playbackSource.setState(PlaybackSource.Native);

    player = new RelistenPlayer();
    tracks = [
      track('7f1d1d55-0000-4000-8000-000000000001', 'Minglewood Blues'),
      track('7f1d1d55-0000-4000-8000-000000000002', 'Loser'),
      track('7f1d1d55-0000-4000-8000-000000000003', 'El Paso'),
    ];
    catalog = [...tracks];
    player.queue.replaceQueue(tracks, undefined);
    room = new FakeRoom();
    room.queue = { version: 1, entries: tracks.map(entry) };
    session = new SonosSession(player, room as never);
    stop = session.start(buildRoomQueue);
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  /** A track another device added; the catalog knows it. */
  function addedElsewhere(title: string) {
    const added = track(`7f1d1d55-0000-4000-8000-0000000000${catalog.length + 10}`, title);
    catalog.push(added);
    return added;
  }

  describe('following the room', () => {
    it('routes the player to the room and follows its track', async () => {
      room.plays(tracks[1].identifier, { positionMillis: 42000 });
      await settle();

      expect(playbackSource.lastState()).toBe(PlaybackSource.Sonos);
      expect(player.queue.currentTrack).toBe(tracks[1]);
      expect(player.state).toBe(RelistenPlaybackState.Playing);
      expect(mocks.native.pause).toHaveBeenCalled();
    });

    it('doesn’t move the queue back to a track the room read before a command landed', async () => {
      room.plays(tracks[0].identifier);
      await settle();
      const shownDuringSkip: (string | undefined)[] = [];
      // A read taken while the skip is in flight still shows the old track.
      room.duringCommand = () => {
        room.publish();
        shownDuringSkip.push(currentTrackIdentifier.lastState());
      };

      player.next();
      await settle();

      expect(shownDuringSkip).not.toContain(tracks[0].identifier);
      expect(currentTrackIdentifier.lastState()).toBe(tracks[1].identifier);
      expect(player.queue.currentTrack).toBe(tracks[1]);
    });

    it('returns to the phone, stopped, when the room stops playing the queue', async () => {
      room.plays(tracks[1].identifier);
      await settle();

      room.end('stopped');
      await settle();

      expect(playbackSource.lastState()).toBe(PlaybackSource.Native);
      expect(player.state).toBe(RelistenPlaybackState.Stopped);
      expect(player.queue.currentTrack).toBe(tracks[1]);
      expect(messages()).toEqual(['Office is no longer playing your queue.']);
    });

    it('asks for the Sonos link again when control ended because it lapsed', async () => {
      room.plays(tracks[1].identifier);
      await settle();

      room.end('reconnect');
      await settle();

      expect(messages()).toEqual(['Connect Sonos again to control Office.']);
    });

    it('shows a command the room refused once', async () => {
      room.plays(tracks[0].identifier);
      await settle();

      room.refusedCommand('Another change took over.');
      room.refusedCommand('Another change took over.');
      await settle();

      expect(messages()).toEqual(['Another change took over.']);
    });
  });

  describe('commands from the phone', () => {
    it('sends Next as a jump to the following occurrence, without pausing first', async () => {
      room.plays(tracks[0].identifier);
      await settle();

      player.next();
      await settle();

      expect(room.command.mock.calls.map(([transport]) => transport)).toEqual([
        { action: 'skip', occurrenceId: tracks[1].identifier },
      ]);
      expect(player.queue.currentTrack).toBe(tracks[1]);
      expect(mocks.native.play).not.toHaveBeenCalled();
    });

    it('plays a paused room after jumping to a tapped row', async () => {
      room.plays(tracks[0].identifier, { paused: true });
      await settle();

      player.playTrackAtIndex(2, 30);
      await settle();

      expect(room.command.mock.calls.map(([transport]) => transport)).toEqual([
        { action: 'skip', occurrenceId: tracks[2].identifier },
        { action: 'seek', positionMillis: 30000 },
        { action: 'play' },
      ]);
    });

    it('waits for a queue edit to reach the room before jumping into it', async () => {
      room.plays(tracks[0].identifier);
      await settle();
      const hold = gate();
      const save = room.saveQueue.getMockImplementation()!;
      room.saveQueue.mockImplementationOnce(async (entries, version) => {
        await hold.opened;
        return save(entries, version);
      });
      const added = player.queue.queueNextTrack([addedElsewhere('Jack Straw')])[0];

      player.next();
      await settle();
      expect(room.command).not.toHaveBeenCalled();
      hold.release();
      await settle();

      expect(room.command).toHaveBeenCalledWith({ action: 'skip', occurrenceId: added.identifier });
    });

    it('jumps to a row tapped while the room’s queue is being read', async () => {
      room.plays(tracks[0].identifier);
      await settle();
      room.queue = { ...room.queue, version: 2 };
      const hold = gate();
      room.readQueue.mockImplementationOnce(async () => {
        await hold.opened;
        return { handle: room.handle, queue: room.queue };
      });
      room.publish();
      await settle();

      player.playTrackAtIndex(2);
      await settle();
      hold.release();
      await settle();

      expect(room.command).toHaveBeenCalledWith({
        action: 'skip',
        occurrenceId: tracks[2].identifier,
      });
    });

    it('skips the room past a playing row the user removes, keeping it as played', async () => {
      room.plays(tracks[0].identifier);
      await settle();

      expect(player.queue.removeTrackWithIdentifier(tracks[0].identifier)).toBe(true);
      await settle();

      expect(room.command).toHaveBeenCalledWith({
        action: 'skip',
        occurrenceId: tracks[1].identifier,
      });
      expect(player.queue.orderedTracks).toEqual(tracks);
      expect(player.queue.currentTrack).toBe(tracks[1]);
      expect(messages()).toEqual(['Sonos keeps tracks once they’ve played.']);
    });

    it('keeps a paused room paused when skipping past a removed row', async () => {
      room.plays(tracks[0].identifier, { paused: true });
      await settle();

      player.queue.removeTrackWithIdentifier(tracks[0].identifier);
      await settle();

      expect(room.command.mock.calls.map(([transport]) => transport)).toEqual([
        { action: 'skip', occurrenceId: tracks[1].identifier },
      ]);
    });

    it('sends nothing when the removed row isn’t the room’s track yet', async () => {
      room.plays(tracks[0].identifier);
      await settle();
      currentTrackIdentifier.setState(tracks[1].identifier);

      expect(player.queue.removeTrackWithIdentifier(tracks[1].identifier)).toBe(true);
      await settle();

      expect(room.command).not.toHaveBeenCalled();
      expect(room.handOff).not.toHaveBeenCalled();
      expect(messages()).toEqual(['The queue is still catching up with Office.']);
    });

    it('leaves a new show alone while another handoff is still settling', async () => {
      room.plays(tracks[0].identifier);
      await settle();
      room.handoffInFlight = { groupId: 'g2', groupName: 'Kitchen' };
      const show = [addedElsewhere('Jack Straw')];

      player.queue.replaceQueue(show, 0);
      await settle();

      expect(room.handOff).not.toHaveBeenCalled();
      expect(room.readQueue).toHaveBeenCalledTimes(1);
      expect(player.queue.orderedTracks).toEqual(show);
      expect(messages()).toEqual(['Your queue is still moving to Kitchen.']);
    });

    it('pauses the room when the removed playing row is the last', async () => {
      room.plays(tracks[2].identifier);
      await settle();

      player.queue.removeTrackWithIdentifier(tracks[2].identifier);
      await settle();

      expect(room.command).toHaveBeenCalledWith({ action: 'pause' });
      expect(player.queue.orderedTracks).toEqual(tracks);
    });

    it('sends nothing for the last row of a room that is already paused', async () => {
      room.plays(tracks[2].identifier, { paused: true });
      await settle();

      player.queue.removeTrackWithIdentifier(tracks[2].identifier);
      await settle();

      expect(room.command).not.toHaveBeenCalled();
      expect(messages()).toEqual(['Sonos keeps tracks once they’ve played.']);
    });
  });

  describe('keeping the queues the same', () => {
    it('saves a queue edit to the room, keeping each occurrence ID', async () => {
      room.plays(tracks[0].identifier);
      await settle();

      player.queue.removeTrackWithIdentifier(tracks[2].identifier);
      await settle();

      expect(room.queue.entries).toEqual([entry(tracks[0]), entry(tracks[1])]);
    });

    it('sends an edit made during a save in one more save', async () => {
      room.plays(tracks[0].identifier);
      await settle();
      const hold = gate();
      const save = room.saveQueue.getMockImplementation()!;
      room.saveQueue.mockImplementationOnce(async (entries, version) => {
        await hold.opened;
        return save(entries, version);
      });

      player.queue.removeTrackWithIdentifier(tracks[2].identifier);
      await settle();
      player.queue.removeTrackWithIdentifier(tracks[1].identifier);
      hold.release();
      await settle();

      expect(room.queue.entries).toEqual([entry(tracks[0])]);
    });

    it('takes the room’s order after another device edits it', async () => {
      room.plays(tracks[0].identifier);
      await settle();

      room.queue = { version: 2, entries: [entry(tracks[0]), entry(tracks[2])] };
      room.publish();
      await settle();

      expect(player.queue.orderedTracks).toEqual([tracks[0], tracks[2]]);
      expect(room.saveQueue).not.toHaveBeenCalled();
    });

    it('takes the room’s order, and says so, when the room refuses a phone edit', async () => {
      room.plays(tracks[0].identifier);
      await settle();
      // Another device's edit the phone hasn't read yet.
      room.queue = { version: 2, entries: [entry(tracks[0]), entry(tracks[1])] };

      player.queue.removeTrackWithIdentifier(tracks[1].identifier);
      await settle();

      expect(messages()).toContain('The queue changed on another device.');
      expect(player.queue.orderedTracks).toEqual([tracks[0], tracks[1]]);
    });

    it('saves an edit made while a handoff was settling instead of dropping it', async () => {
      room.plays(tracks[0].identifier);
      await settle();
      const show = [addedElsewhere('Jack Straw'), addedElsewhere('Dire Wolf')];
      const hold = gate();
      room.handOff.mockImplementationOnce(async (request) => {
        await hold.opened;
        return room.takeHandoff(request);
      });

      player.queue.replaceQueue(show, 0);
      await settle();
      const added = player.queue.addTrackToEndOfQueue([addedElsewhere('El Paso')])[0];
      hold.release();
      await settle();
      room.publish();
      await settle();

      expect(room.queue.entries.map((row) => row.occurrenceId)).toEqual([
        show[0].identifier,
        show[1].identifier,
        added.identifier,
      ]);
      expect(player.queue.orderedTracks.map((queued) => queued.identifier)).toContain(
        added.identifier
      );
      expect(messages()).not.toContain(
        'Your queue change was replaced by one from another device.'
      );
    });

    it('puts back a played track Sonos keeps, after a handoff, without retrying', async () => {
      room.plays(tracks[0].identifier);
      await settle();
      const show = [addedElsewhere('Jack Straw'), addedElsewhere('Dire Wolf')];
      room.handOff.mockImplementationOnce(async (request) => room.takeHandoff(request));
      player.queue.replaceQueue(show, 1);
      await settle();
      room.publish();
      await settle();

      player.queue.removeTrackWithIdentifier(show[0].identifier);
      await settle();
      room.publish();
      await settle();

      expect(room.saveQueue).toHaveBeenCalledTimes(1);
      expect(player.queue.orderedTracks).toEqual(show);
      expect(messages()).toContain('Sonos keeps the tracks through the one playing.');
    });

    it('says so when another device’s edit replaces one made while the room was read', async () => {
      room.plays(tracks[0].identifier);
      await settle();
      room.queue = { version: 2, entries: [entry(tracks[0]), entry(tracks[2])] };
      const hold = gate();
      room.readQueue.mockImplementationOnce(async () => {
        await hold.opened;
        return { handle: room.handle, queue: room.queue };
      });

      room.publish();
      await settle();
      player.queue.removeTrackWithIdentifier(tracks[2].identifier);
      hold.release();
      await settle();

      expect(player.queue.orderedTracks).toEqual([tracks[0], tracks[2]]);
      expect(messages()).toContain('Your queue change was replaced by one from another device.');
    });

    it('takes a queue read while the room was unconfirmed once it confirms, on its track', async () => {
      room.plays(tracks[1].identifier);
      await settle();
      room.queue = { version: 2, entries: [entry(tracks[0]), entry(tracks[1])] };
      room.readQueue.mockImplementationOnce(async () => {
        room.unconfirmed();
        return { handle: room.handle, queue: room.queue };
      });

      room.publish();
      await settle();
      expect(player.queue.orderedTracks).toEqual(tracks);

      room.publish();
      await settle();
      expect(player.queue.orderedTracks).toEqual([tracks[0], tracks[1]]);
      expect(player.queue.currentTrack).toBe(tracks[1]);
    });

    it('doesn’t put the old room’s queue back while a new show is being handed off', async () => {
      room.plays(tracks[0].identifier);
      await settle();
      room.queue = { version: 2, entries: [entry(tracks[0]), entry(tracks[1])] };
      const read = gate();
      room.readQueue.mockImplementationOnce(async () => {
        await read.opened;
        return { handle: room.handle, queue: room.queue };
      });
      room.publish();
      await settle();

      const show = [addedElsewhere('Jack Straw'), addedElsewhere('Dire Wolf')];
      room.handOff.mockImplementationOnce(async () => {
        room.handoffInFlight = { groupId: 'g1', groupName: 'Office' };
        read.release();
        await settle();
        room.handoffInFlight = undefined;
        return { kind: 'uncertain', reconnect: false };
      });
      player.queue.replaceQueue(show, 0);
      await settle();

      expect(buildRoomQueue).not.toHaveBeenCalled();
      expect(player.queue.orderedTracks).toEqual(show);
    });

    it('sends no edit based on an order the room has moved past', async () => {
      room.plays(tracks[0].identifier);
      await settle();
      // Another device added a track this phone can't look up yet.
      room.queue = { version: 2, entries: [...tracks.map(entry), entry(addedElsewhere('Gone'))] };
      buildRoomQueue.mockResolvedValueOnce({ kind: 'unreachable' });
      room.publish();
      await settle();

      player.queue.removeTrackWithIdentifier(tracks[1].identifier);
      await settle();

      expect(room.saveQueue).not.toHaveBeenCalled();
    });

    it('doesn’t jump to a tapped row the room’s order no longer has', async () => {
      room.plays(tracks[0].identifier);
      await settle();
      const read = gate();
      room.readQueue.mockImplementationOnce(async () => {
        await read.opened;
        return { handle: room.handle, queue: room.queue };
      });
      // Another device removed the last row.
      room.queue = { version: 2, entries: [entry(tracks[0]), entry(tracks[1])] };
      room.publish();
      await settle();

      player.playTrackAtIndex(2);
      await settle();
      read.release();
      await settle();

      expect(room.command).not.toHaveBeenCalled();
      expect(player.queue.orderedTracks).toEqual([tracks[0], tracks[1]]);
    });

    it('knows a lost save that arrived as its own, keeping a newer edit', async () => {
      room.plays(tracks[0].identifier);
      await settle();
      const save = room.saveQueue.getMockImplementation()!;
      room.saveQueue.mockImplementationOnce(async (entries, version) => {
        await save(entries, version);
        return { kind: 'failed' } as never;
      });
      player.queue.removeTrackWithIdentifier(tracks[2].identifier);
      await settle();

      player.queue.removeTrackWithIdentifier(tracks[1].identifier);
      await settle();
      room.publish();
      await settle();

      expect(room.queue.entries).toEqual([entry(tracks[0])]);
      expect(messages()).not.toContain(
        'Your queue change was replaced by one from another device.'
      );
    });

    it('hands a newly chosen queue to the room instead of skipping', async () => {
      room.plays(tracks[0].identifier);
      await settle();

      const show = [addedElsewhere('Jack Straw'), addedElsewhere('Dire Wolf')];
      player.queue.replaceQueue(show, 0);
      await settle();

      expect(room.command).not.toHaveBeenCalled();
      expect(room.saveQueue).not.toHaveBeenCalled();
      expect(room.handOff).toHaveBeenCalledWith(
        expect.objectContaining({ group_id: 'g1', start_index: 0, occurrences: show.map(wire) }),
        'Office'
      );
    });

    it('puts the room’s queue back on the phone when the room refuses a new show', async () => {
      room.plays(tracks[0].identifier);
      await settle();
      room.handOff.mockResolvedValueOnce({
        kind: 'refused',
        message: 'Some tracks in your queue can’t play on Sonos.',
        reconnect: false,
      });

      player.queue.replaceQueue([addedElsewhere('Jack Straw')], 0);
      await settle();

      expect(player.queue.orderedTracks).toEqual(tracks);
      expect(player.queue.currentTrack).toBe(tracks[0]);
      expect(messages()).toContain('Some tracks in your queue can’t play on Sonos.');
    });

    it('sends an edit again after the room moves to another track', async () => {
      room.plays(tracks[0].identifier);
      await settle();
      room.saveQueue.mockResolvedValueOnce({ kind: 'trackMoved' } as never);

      player.queue.removeTrackWithIdentifier(tracks[2].identifier);
      await settle();

      expect(room.refresh).toHaveBeenCalled();
      expect(room.queue.entries).toEqual([entry(tracks[0]), entry(tracks[1])]);
    });

    it('saves an edit that failed when the room is next read, telling the user once', async () => {
      room.plays(tracks[0].identifier);
      await settle();
      room.saveQueue.mockResolvedValueOnce({ kind: 'failed' } as never);
      room.saveQueue.mockResolvedValueOnce({ kind: 'failed' } as never);

      player.queue.removeTrackWithIdentifier(tracks[2].identifier);
      await settle();
      room.publish();
      await settle();
      room.publish();
      await settle();

      expect(room.queue.entries).toEqual([entry(tracks[0]), entry(tracks[1])]);
      expect(messages()).toEqual(['Couldn’t update the Sonos queue yet.']);
    });
  });

  describe('shuffle', () => {
    it('keeps what has played in place and shuffles the rest with the songs before it again', async () => {
      room.plays(tracks[1].identifier);
      await settle();
      // Added once the phone follows the room, so both hold three upcoming tracks.
      player.queue.addTrackToEndOfQueue([
        addedElsewhere('Jack Straw'),
        addedElsewhere('Dire Wolf'),
      ]);
      await settle();
      const upcoming = player.queue.orderedTracks.slice(2).map((t) => t.identifier);
      expect(upcoming).toHaveLength(3);

      player.queue.setShuffleState(PlayerShuffleState.SHUFFLE_ON);
      await settle();

      const saved = room.queue.entries;
      // The room can't move what it has played, so tracks 0 and 1 stay first.
      expect(saved.slice(0, 2)).toEqual([entry(tracks[0]), entry(tracks[1])]);
      // After them: the three upcoming tracks and a new occurrence of track 0.
      const shuffled = saved.slice(2);
      expect(shuffled).toHaveLength(4);
      expect(shuffled.filter((row) => upcoming.includes(row.occurrenceId))).toHaveLength(3);
      const replay = shuffled.find((row) => !upcoming.includes(row.occurrenceId))!;
      expect(replay.trackId).toBe(entry(tracks[0]).trackId);
      expect(replay.occurrenceId).not.toBe(tracks[0].identifier);
      expect(messages()).toEqual([]);
    });

    it('shuffles a whole playlist when shuffle is turned on at its last track', async () => {
      room.plays(tracks[2].identifier);
      await settle();

      player.queue.setShuffleState(PlayerShuffleState.SHUFFLE_ON);
      await settle();

      const after = room.queue.entries.slice(3).map((row) => row.trackId);
      expect([...after].sort()).toEqual(
        [entry(tracks[0]).trackId, entry(tracks[1]).trackId].sort()
      );
    });

    it('removes the replayed songs not yet played when shuffle is turned off', async () => {
      room.plays(tracks[2].identifier);
      await settle();
      player.queue.setShuffleState(PlayerShuffleState.SHUFFLE_ON);
      await settle();

      player.queue.setShuffleState(PlayerShuffleState.SHUFFLE_OFF);
      await settle();

      expect(room.queue.entries).toEqual(tracks.map(entry));
      expect(player.queue.orderedTracks).toEqual(tracks);
    });

    it('doesn’t queue a song twice when shuffle is turned on, off and on again', async () => {
      room.plays(tracks[2].identifier);
      await settle();
      for (const state of [
        PlayerShuffleState.SHUFFLE_ON,
        PlayerShuffleState.SHUFFLE_OFF,
        PlayerShuffleState.SHUFFLE_ON,
      ]) {
        player.queue.setShuffleState(state);
        await settle();
      }

      const after = room.queue.entries.slice(3).map((row) => row.trackId);
      expect(after).toHaveLength(2);
      expect(new Set(after).size).toBe(2);
    });

    it('keeps the track the room just moved to in place when shuffling', async () => {
      room.plays(tracks[0].identifier);
      await settle();
      const save = room.saveQueue.getMockImplementation()!;
      room.saveQueue.mockImplementationOnce(async () => {
        // The room moved on before the shuffled order reached it. Like the
        // real store, the fake answers only after a request goes out.
        await Promise.resolve();
        room.plays(tracks[1].identifier);
        return { kind: 'trackMoved' } as never;
      });
      room.saveQueue.mockImplementation(save);

      player.queue.setShuffleState(PlayerShuffleState.SHUFFLE_ON);
      await settle();

      expect(room.queue.entries.slice(0, 2)).toEqual([entry(tracks[0]), entry(tracks[1])]);
      expect(player.queue.orderedTracks.slice(0, 2)).toEqual([tracks[0], tracks[1]]);
      expect(messages()).toEqual([]);
    });

    it('keeps a playlist group together when shuffle is turned off', async () => {
      const [x, a1, a2] = tracks;
      for (const grouped of [a1, a2]) {
        grouped.playlistContext = { segmentInstanceId: 'segment-a' } as never;
      }
      // Shuffled on the phone with A1 selected: [A1, A2, X], A1's group kept together.
      player.queue.replaceQueue([x, a1, a2], 1);
      currentTrackIdentifier.setState(a1.identifier);
      player.queue.setShuffleState(PlayerShuffleState.SHUFFLE_ON);
      await settle();
      room.queue = { version: 1, entries: player.queue.orderedTracks.map(entry) };
      room.plays(a1.identifier);
      await settle();
      expect(player.queue.orderedTracks).toEqual([a1, a2, x]);

      player.queue.setShuffleState(PlayerShuffleState.SHUFFLE_OFF);
      await settle();

      expect(player.queue.orderedTracks).toEqual([a1, a2, x]);
    });

    it('puts the upcoming tracks back in order when shuffle is turned off', async () => {
      room.plays(tracks[0].identifier);
      await settle();
      player.queue.addTrackToEndOfQueue([
        addedElsewhere('Jack Straw'),
        addedElsewhere('Dire Wolf'),
      ]);
      await settle();
      const original = [...player.queue.orderedTracks];
      player.queue.setShuffleState(PlayerShuffleState.SHUFFLE_ON);
      await settle();
      room.plays(player.queue.orderedTracks[1].identifier);
      await settle();
      const played = player.queue.orderedTracks.slice(0, 2);

      player.queue.setShuffleState(PlayerShuffleState.SHUFFLE_OFF);
      await settle();

      // Three tracks are left upcoming, so their original order is checkable.
      const rest = original.filter((t) => !played.includes(t));
      expect(rest).toHaveLength(3);
      expect(player.queue.orderedTracks).toEqual([...played, ...rest]);
      expect(room.queue.entries).toEqual([...played, ...rest].map(entry));
      expect(messages()).toEqual([]);
    });
  });

  describe('recordings the phone can’t find', () => {
    it('removes upcoming tracks the catalog says are gone, from both queues', async () => {
      room.plays(tracks[0].identifier);
      await settle();
      const gone = addedElsewhere('Gone');
      room.queue = { version: 2, entries: [...tracks.map(entry), entry(gone)] };
      buildRoomQueue.mockResolvedValueOnce({
        kind: 'unavailable',
        occurrenceIds: [gone.identifier],
      });

      room.publish();
      await settle();

      expect(room.queue.entries).toEqual(tracks.map(entry));
      expect(player.queue.orderedTracks).toEqual(tracks);
      expect(messages()).toEqual(['Removed a track that’s no longer available.']);
    });

    it('leaves the room’s order alone when a gone track has already played', async () => {
      room.plays(tracks[1].identifier);
      await settle();
      room.readQueue.mockClear();
      const gone = addedElsewhere('Gone');
      room.queue = { version: 2, entries: [entry(gone), ...tracks.map(entry)] };
      buildRoomQueue.mockResolvedValueOnce({
        kind: 'unavailable',
        occurrenceIds: [gone.identifier],
      });

      room.publish();
      await settle();
      room.publish();
      await settle();

      expect(room.readQueue).toHaveBeenCalledTimes(1);
      expect(room.saveQueue).not.toHaveBeenCalled();
      expect(messages()).toEqual([
        'The room’s queue has a track that’s no longer available, so it can’t be shown.',
      ]);
    });

    it('waits before asking the catalog again when a lookup failed', async () => {
      room.plays(tracks[0].identifier);
      await settle();
      room.readQueue.mockClear();
      room.queue = { version: 2, entries: [entry(tracks[0]), entry(addedElsewhere('Jack Straw'))] };
      buildRoomQueue.mockResolvedValueOnce({ kind: 'unreachable' });

      room.publish();
      await settle();
      room.publish();
      await settle();
      expect(room.readQueue).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(30_000);
      room.publish();
      await settle();
      expect(room.readQueue).toHaveBeenCalledTimes(2);
      expect(player.queue.orderedTracks).toHaveLength(2);
    });
  });

  describe('moving playback back to the phone', () => {
    it('plays on the phone at the room’s track and position', async () => {
      room.plays(tracks[1].identifier, { positionMillis: 42000 });
      await settle();

      await session.transferToPhone();
      await settle();

      expect(room.command).toHaveBeenCalledWith({ action: 'pause' });
      expect(room.release).toHaveBeenCalled();
      expect(room.pauseRoomLeftBehind).not.toHaveBeenCalled();
      expect(playbackSource.lastState()).toBe(PlaybackSource.Native);
      expect(mocks.native.play).toHaveBeenCalledTimes(1);
      expect(mocks.native.play.mock.calls[0][0].identifier).toBe(tracks[1].identifier);
      expect(mocks.native.play.mock.calls[0][1]).toBe(42000);
      expect(room.saveQueue).not.toHaveBeenCalled();
    });

    it('brings back the room’s latest order', async () => {
      room.plays(tracks[1].identifier, { paused: true, positionMillis: 42000 });
      await settle();
      // Another device removed the last track; this phone hasn't polled since.
      room.queue = { version: 2, entries: [entry(tracks[0]), entry(tracks[1])] };

      await session.transferToPhone();
      await settle();

      expect(playbackSource.lastState()).toBe(PlaybackSource.Native);
      expect(player.queue.orderedTracks).toEqual([tracks[0], tracks[1]]);
      expect(currentTrackIdentifier.lastState()).toBe(tracks[1].identifier);
      expect(mocks.native.play).not.toHaveBeenCalled();
    });

    it('moves to the phone at the track it shows when the room’s queue can’t be read', async () => {
      room.plays(tracks[1].identifier, { paused: true });
      await settle();
      room.readQueue.mockResolvedValueOnce(undefined as never);

      await session.transferToPhone();
      await settle();

      expect(room.release).toHaveBeenCalled();
      expect(playbackSource.lastState()).toBe(PlaybackSource.Native);
      expect(currentTrackIdentifier.lastState()).toBe(tracks[1].identifier);
      // The room was paused, so there is nothing to pause behind it.
      expect(room.pauseRoomLeftBehind).not.toHaveBeenCalled();
      expect(messages()).toEqual([]);
    });

    it('plays on the phone when the room can’t be reached, pausing it in the background', async () => {
      room.plays(tracks[1].identifier, { positionMillis: 42000 });
      await settle();
      // Out of reach: the pause never answers.
      room.command.mockImplementationOnce(() => new Promise(() => {}));
      player.queue.replaceQueue(tracks, 1);

      const moving = session.transferToPhone();
      await vi.advanceTimersByTimeAsync(3000);
      await moving;
      await settle();

      expect(playbackSource.lastState()).toBe(PlaybackSource.Native);
      expect(mocks.native.play).toHaveBeenCalledTimes(1);
      expect(mocks.native.play.mock.calls[0][0].identifier).toBe(tracks[1].identifier);
      expect(room.pauseRoomLeftBehind).toHaveBeenCalledWith('h1');
    });

    it('says so when the room it left behind couldn’t be paused', async () => {
      room.plays(tracks[1].identifier);
      await settle();
      room.command.mockResolvedValueOnce(false);
      room.pauseRoomLeftBehind.mockResolvedValueOnce(false);

      await session.transferToPhone();
      await settle();

      expect(playbackSource.lastState()).toBe(PlaybackSource.Native);
      expect(mocks.native.play).toHaveBeenCalledTimes(1);
      expect(messages()).toEqual(['Couldn’t pause Office. It may still be playing.']);
    });

    it('plays a new show on the phone, abandoning its handoff to the room', async () => {
      room.plays(tracks[0].identifier, { paused: true });
      await settle();
      room.settlingHandoff();
      const show = [addedElsewhere('Jack Straw'), addedElsewhere('Dire Wolf')];

      player.queue.replaceQueue(show, 0);
      player.playTrackAtIndex(0);
      await settle();
      expect(room.handOff).toHaveBeenCalled();
      const reads = room.readQueue.mock.calls.length;

      await session.transferToPhone();
      await settle();

      expect(room.abandonHandoff).toHaveBeenCalled();
      expect(playbackSource.lastState()).toBe(PlaybackSource.Native);
      expect(player.queue.orderedTracks).toEqual(show);
      expect(mocks.native.play).toHaveBeenCalledTimes(1);
      expect(mocks.native.play.mock.calls[0][0].identifier).toBe(show[0].identifier);
      // The old room's queue is never read back over the new show.
      expect(room.readQueue).toHaveBeenCalledTimes(reads);
      expect(messages()).toEqual([]);
    });

    it('says only that the room ended when it ends during the move', async () => {
      room.plays(tracks[1].identifier);
      await settle();
      room.command.mockImplementationOnce(async () => {
        room.end('stopped');
        return false;
      });

      await session.transferToPhone();
      await settle();

      expect(playbackSource.lastState()).toBe(PlaybackSource.Native);
      expect(messages()).toEqual(['Office is no longer playing your queue.']);
    });
  });
});

function wire(queueTrack: PlayerQueueTrack) {
  return {
    occurrence_id: queueTrack.identifier,
    track_id: formatUuidTypedId('track', queueTrack.sourceTrack.uuid),
  };
}
