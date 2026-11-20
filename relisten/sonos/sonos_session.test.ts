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
  showMessage: vi.fn(),
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
vi.mock('react-native-flash-message', () => ({ showMessage: mocks.showMessage }));
vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes,
  randomUUID: () => 'request-id',
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import { RelistenPlayer } from '@/relisten/player/relisten_player';
import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import {
  currentTrackIdentifier,
  PlaybackSource,
  playbackSource,
  state,
} from '@/relisten/player/shared_state';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
import { formatUuidTypedId } from '@/relisten/util/typed_uuid_id';
import type { SonosPlayback, SonosQueueEntry, SonosTransport } from './sonos_playback';
import type { SonosRemoteState } from './sonos_remote';
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

/** The room as the session sees it through the store: state, commands and the queue. */
class FakeRoom {
  state: SonosRemoteState = { kind: 'none' };
  queue = { version: 1, entries: [] as SonosQueueEntry[] };
  private readonly listeners = new Set<() => void>();
  private playbackState = 'PLAYBACK_STATE_PLAYING';
  private occurrenceId = '';
  private positionMillis = 0;

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
    this.listeners.forEach((listener) => listener());
  }

  end(endedRoom?: string) {
    this.state = endedRoom ? { kind: 'none', endedRoom } : { kind: 'none' };
    this.listeners.forEach((listener) => listener());
  }

  command = vi.fn(async (transport: SonosTransport) => {
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
  fetchQueue = vi.fn(async () => ({ handle: 'h1', queue: this.queue }));
  saveQueue = vi.fn(async (entries: readonly SonosQueueEntry[], expectedVersion: number) => {
    expect(expectedVersion).toBe(this.queue.version);
    this.queue = { version: this.queue.version + 1, entries: [...entries] };
    return { kind: 'saved' as const, version: this.queue.version };
  });
  handOff = vi.fn(async () => ({ kind: 'uncertain' as const }));
  release = vi.fn(() => this.end());

  private playback(): SonosPlayback {
    const index = this.queue.entries.findIndex((row) => row.occurrenceId === this.occurrenceId);
    return {
      handle: 'h1',
      groupId: 'g1',
      groupName: 'Office',
      status: 'active',
      playbackState: this.playbackState,
      positionMillis: this.positionMillis,
      observedAt: Date.now(),
      queueLength: this.queue.entries.length,
      queueVersion: this.queue.version,
      occurrence: {
        itemId: `item-${this.occurrenceId}`,
        occurrenceId: this.occurrenceId,
        queueIndex: index,
        trackId: this.queue.entries[index]?.trackId ?? '',
        name: 'Track',
        durationMillis: 400000,
        artist: null,
        album: null,
        imageUrl: null,
      },
    };
  }
}

const settle = async () => {
  for (let turn = 0; turn < 20; turn += 1) {
    await vi.advanceTimersByTimeAsync(0);
  }
};

describe('SonosSession', () => {
  let player: RelistenPlayer;
  let room: FakeRoom;
  let stop: () => void;
  let tracks: PlayerQueueTrack[];
  // The catalog, as far as these tests go: the three tracks the room was handed.
  const queueTracksForRoom = vi.fn(async (entries: readonly SonosQueueEntry[]) =>
    entries.map((row) => tracks.find((known) => known.identifier === row.occurrenceId)!)
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
    player.queue.replaceQueue(tracks, undefined);
    room = new FakeRoom();
    room.queue = { version: 1, entries: tracks.map(entry) };
    stop = new SonosSession(player, room as never).start(queueTracksForRoom);
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it('routes the player to the room and follows its track', async () => {
    room.plays(tracks[1].identifier, { positionMillis: 42000 });
    await settle();

    expect(playbackSource.lastState()).toBe(PlaybackSource.Sonos);
    expect(player.queue.currentTrack).toBe(tracks[1]);
    expect(player.state).toBe(RelistenPlaybackState.Playing);
    expect(mocks.native.pause).toHaveBeenCalled();
  });

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

  it('saves a queue edit to the room, keeping each occurrence ID', async () => {
    room.plays(tracks[0].identifier);
    await settle();

    player.queue.removeTrackWithIdentifier(tracks[2].identifier);
    await settle();

    expect(room.saveQueue).toHaveBeenCalledTimes(1);
    expect(room.saveQueue.mock.calls[0][0]).toEqual([entry(tracks[0]), entry(tracks[1])]);
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

  it('hands a newly chosen queue to the room instead of skipping', async () => {
    room.plays(tracks[0].identifier);
    await settle();

    const show = [
      track('7f1d1d55-0000-4000-8000-000000000004', 'Jack Straw'),
      track('7f1d1d55-0000-4000-8000-000000000005', 'Dire Wolf'),
    ];
    player.queue.replaceQueue(show, 0);
    await settle();

    expect(room.command).not.toHaveBeenCalled();
    expect(room.saveQueue).not.toHaveBeenCalled();
    expect(room.handOff).toHaveBeenCalledWith(
      expect.objectContaining({
        group_id: 'g1',
        start_index: 0,
        occurrences: show.map((queueTrack) => ({
          occurrence_id: queueTrack.identifier,
          track_id: formatUuidTypedId('track', queueTrack.sourceTrack.uuid),
        })),
      }),
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
    } as never);

    player.queue.replaceQueue([track('7f1d1d55-0000-4000-8000-000000000004', 'Jack Straw')], 0);
    await settle();

    expect(player.queue.orderedTracks).toEqual(tracks);
    expect(player.queue.currentTrack).toBe(tracks[0]);
    expect(mocks.showMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Some tracks in your queue can’t play on Sonos.' })
    );
  });

  it('sends an edit again after the room moves to another track', async () => {
    room.plays(tracks[0].identifier);
    await settle();
    room.saveQueue.mockResolvedValueOnce({ kind: 'trackMoved' } as never);

    player.queue.removeTrackWithIdentifier(tracks[2].identifier);
    await settle();

    expect(room.refresh).toHaveBeenCalled();
    expect(room.saveQueue).toHaveBeenCalledTimes(2);
    expect(room.queue.entries).toEqual([entry(tracks[0]), entry(tracks[1])]);
  });

  it('saves an edit that failed when the room is next read', async () => {
    room.plays(tracks[0].identifier);
    await settle();
    room.saveQueue.mockResolvedValueOnce({ kind: 'failed' } as never);

    player.queue.removeTrackWithIdentifier(tracks[2].identifier);
    await settle();
    room.publish();
    await settle();

    expect(room.saveQueue).toHaveBeenCalledTimes(2);
    expect(room.queue.entries).toEqual([entry(tracks[0]), entry(tracks[1])]);
    expect(player.queue.orderedTracks).toEqual([tracks[0], tracks[1]]);
  });

  it('reads the room’s queue again after a recording couldn’t be found', async () => {
    room.plays(tracks[0].identifier);
    await settle();
    room.queue = { version: 2, entries: [entry(tracks[0]), entry(tracks[2])] };
    queueTracksForRoom.mockResolvedValueOnce(undefined as never);

    room.publish();
    await settle();
    expect(player.queue.orderedTracks).toEqual(tracks);

    room.publish();
    await settle();
    expect(player.queue.orderedTracks).toEqual([tracks[0], tracks[2]]);
  });

  it('moves playback back to the phone at the room’s track and position', async () => {
    const session = new SonosSession(player, room as never);
    stop();
    stop = session.start(queueTracksForRoom);
    room.plays(tracks[1].identifier, { positionMillis: 42000 });
    await settle();

    await session.transferToPhone();
    await settle();

    expect(room.command).toHaveBeenCalledWith({ action: 'pause' });
    expect(room.release).toHaveBeenCalled();
    expect(playbackSource.lastState()).toBe(PlaybackSource.Native);
    expect(mocks.native.play).toHaveBeenCalledTimes(1);
    expect(mocks.native.play.mock.calls[0][0].identifier).toBe(tracks[1].identifier);
    expect(mocks.native.play.mock.calls[0][1]).toBe(42000);
  });

  it('brings back the room’s latest order when moving playback to the phone', async () => {
    const session = new SonosSession(player, room as never);
    stop();
    stop = session.start(queueTracksForRoom);
    room.plays(tracks[1].identifier, { paused: true, positionMillis: 42000 });
    await settle();
    // Another device removed the last track; this phone hasn't polled since.
    room.queue = { version: 2, entries: [entry(tracks[0]), entry(tracks[1])] };

    await session.transferToPhone();
    await settle();

    expect(playbackSource.lastState()).toBe(PlaybackSource.Native);
    expect(player.queue.orderedTracks).toEqual([tracks[0], tracks[1]]);
    expect(currentTrackIdentifier.lastState()).toBe(tracks[1].identifier);
  });

  it('keeps playback on the room when its queue can’t be read for the move', async () => {
    const session = new SonosSession(player, room as never);
    stop();
    stop = session.start(queueTracksForRoom);
    room.plays(tracks[1].identifier, { paused: true });
    await settle();
    room.fetchQueue.mockResolvedValueOnce(undefined as never);

    await session.transferToPhone();
    await settle();

    expect(room.release).not.toHaveBeenCalled();
    expect(playbackSource.lastState()).toBe(PlaybackSource.Sonos);
    expect(mocks.showMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Couldn’t move playback from Office.' })
    );
  });

  it('returns to the phone, stopped, when the room stops playing the queue', async () => {
    room.plays(tracks[1].identifier);
    await settle();

    room.end('Office');
    await settle();

    expect(playbackSource.lastState()).toBe(PlaybackSource.Native);
    expect(player.state).toBe(RelistenPlaybackState.Stopped);
    expect(player.queue.currentTrack).toBe(tracks[1]);
    expect(mocks.showMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Office is no longer playing your queue.' })
    );
  });
});
