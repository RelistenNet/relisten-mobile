import { describe, expect, it, vi } from 'vitest';

vi.mock('@/relisten/util/logging', () => ({
  log: { extend: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) },
}));

let commandIds = 0;
vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes,
  randomUUID: () => `command-${++commandIds}`,
}));

vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

import { AccountsApiError } from '@/relisten/accounts/api/accounts_api_client';
import { handoffRequest } from './sonos_handoff';
import { nextSonosRepeatMode } from './sonos_playback';
import { roomRepeatOf, SonosRoomStore, sonosRoomName } from './sonos_room_store';
import { FakeUserService, HANDLE_UUID, lost } from './testing/fake_user_service';

function store(rememberedRoom?: string) {
  const server = new FakeUserService();
  const rooms = {
    load: vi.fn(async () => rememberedRoom),
    save: vi.fn(async () => {}),
  };
  const remote = new SonosRoomStore(
    { wait: () => Promise.resolve(), confirmIntervalMs: 0, confirmAttempts: 3 },
    rooms
  );
  let current = true;
  remote.bind(server as never, () => current, 'user-1');
  const switchAccount = () => {
    current = false;
    remote.bind({ request: vi.fn() } as never, () => true, 'user-2');
  };
  return { server, remote, rooms, switchAccount };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function adopted(rememberedRoom?: string) {
  const setup = store(rememberedRoom);
  setup.remote.adopt('h1', 'Office');
  await flush();
  return setup;
}

function shown(remote: SonosRoomStore) {
  const state = remote.getState();
  return state.kind === 'active' ? state : undefined;
}

describe('SonosRoomStore', () => {
  describe('reading the room', () => {
    it('shows the room once an adopted handle is read', async () => {
      const { remote } = store();

      remote.adopt('h1', 'Office');
      expect(remote.getState().kind).toBe('checking');
      await flush();

      expect(shown(remote)?.playback.occurrence?.occurrenceId).toBe('q1');
    });

    it('drops a late response for a handle that was replaced', async () => {
      const { server, remote } = store();
      const releaseFirst = server.holdNext('GET /v1/integrations/sonos/playback/h1');

      remote.adopt('h1', 'Office');
      server.room.handle = 'h2';
      remote.adopt('h2', 'Office');
      await flush();
      releaseFirst();
      await flush();

      expect(shown(remote)?.playback.handle).toBe('h2');
    });

    it('keeps the version an edit saved when a poll sent before it answers', async () => {
      const { server, remote } = await adopted();
      const releasePoll = server.holdNext('GET /v1/integrations/sonos/playback/h1');
      const poll = remote.refresh();
      await flush();

      await remote.saveQueue(server.room.queue.entries.slice(), 1);
      releasePoll();
      await poll;

      expect(shown(remote)?.playback.queueVersion).toBe(2);
      expect(await remote.command({ action: 'skip', occurrenceId: 'q2' })).toBe(true);
    });

    it('names no queue version on a jump when the room never reported one', async () => {
      const { server, remote } = store();
      server.reportsQueueVersion = false;
      remote.adopt('h1', 'Office');
      await flush();
      await remote.refresh();

      await remote.command({ action: 'skip', occurrenceId: 'q2' });

      expect(server.commands()[0]).not.toHaveProperty('expected_queue_version');
    });

    it('sends one read at a time, shared by everyone waiting on it', async () => {
      const { server, remote } = await adopted();

      await Promise.all([remote.refresh(), remote.refresh(), remote.refresh()]);

      expect(server.requestsTo('GET /v1/integrations/sonos/playback/h1')).toBe(2);
    });

    it('ends control, naming the room, when the room moves on', async () => {
      const { server, remote } = await adopted();
      server.room.status = 'evicted';

      await remote.refresh();

      expect(remote.getState()).toEqual({
        kind: 'none',
        ended: { roomName: 'Alec’s Office', reason: 'stopped' },
      });
    });

    it('ends control when the handle is gone', async () => {
      const { server, remote } = await adopted();
      server.room.handle = 'gone';

      await remote.refresh();

      expect(remote.getState()).toEqual({
        kind: 'none',
        ended: { roomName: 'Alec’s Office', reason: 'stopped' },
      });
    });

    it('asks for the Sonos link again when it lapsed', async () => {
      const { server, remote } = await adopted();
      server.room.status = 'revoked';

      await remote.refresh();

      expect(remote.getState()).toEqual({
        kind: 'none',
        ended: { roomName: 'Alec’s Office', reason: 'reconnect' },
      });
    });

    it('names the room whether or not it has been confirmed yet', async () => {
      const { server, remote } = store();
      remote.adopt('h1', 'Office');
      expect(sonosRoomName(remote.getState())).toBe('Office');

      await flush();
      expect(sonosRoomName(remote.getState())).toBe(server.room.groupName);
    });

    it('sends no command while the room is unconfirmed', async () => {
      const { server, remote } = await adopted();
      server.room.status = 'unconfirmed';
      await remote.refresh();

      expect(remote.getState().kind).toBe('checking');
      expect(await remote.command({ action: 'play' })).toBe(false);
      expect(server.commands()).toEqual([]);
    });
  });

  describe('commands', () => {
    it('plays, then reads until the room is playing', async () => {
      const { server, remote } = await adopted();

      expect(await remote.command({ action: 'play' })).toBe(true);

      expect(server.commands()).toEqual([
        { action: 'play', command_id: expect.any(String), expected_item_id: 'item-q1' },
      ]);
      expect(shown(remote)?.pending).toBeUndefined();
      expect(shown(remote)?.commandError).toBeUndefined();
    });

    it('sends a lost command again with the same command ID', async () => {
      const { server, remote } = await adopted();
      server.failNext('POST /v1/integrations/sonos/playback/h1/commands', lost());

      expect(await remote.command({ action: 'play' })).toBe(true);

      const [first, retry] = server.commands();
      expect(retry).toEqual(first);
    });

    it('reads the room when a command is lost twice, since it may have arrived', async () => {
      const { server, remote } = await adopted();
      server.failNext('POST /v1/integrations/sonos/playback/h1/commands', lost());
      server.failNext('POST /v1/integrations/sonos/playback/h1/commands', lost());
      // The second attempt reached Sonos even though its response was lost.
      server.room.playbackState = 'PLAYBACK_STATE_PLAYING';

      expect(await remote.command({ action: 'play' })).toBe(true);
      expect(shown(remote)?.commandError).toBeUndefined();
    });

    it('offers a retry when the room never shows the command', async () => {
      const { server, remote } = await adopted();
      server.appliesCommands = false;

      expect(await remote.command({ action: 'play' })).toBe(false);

      expect(shown(remote)?.commandError).toBe('Sonos didn’t confirm. Try again.');
    });

    it('explains a command Sonos refuses', async () => {
      const { server, remote } = await adopted();
      server.failNext(
        'POST /v1/integrations/sonos/playback/h1/commands',
        new AccountsApiError('', 409, 'sonos_command_unavailable', false)
      );

      expect(await remote.command({ action: 'seek', positionMillis: 999999 })).toBe(false);

      expect(shown(remote)?.commandError).toBe('That isn’t available for this track.');
    });

    it('jumps to an occurrence, naming the queue version it was chosen from', async () => {
      const { server, remote } = await adopted();

      expect(await remote.command({ action: 'skip', occurrenceId: 'q2' })).toBe(true);

      expect(server.commands()[0]).toMatchObject({
        action: 'skip',
        expected_item_id: 'item-q1',
        expected_queue_version: 1,
        target_occurrence_id: 'q2',
      });
      expect(shown(remote)?.playback.occurrence?.occurrenceId).toBe('q2');
    });

    it('seeks to an absolute position on the current occurrence', async () => {
      const { server, remote } = await adopted();

      expect(await remote.command({ action: 'seek', positionMillis: 42000 })).toBe(true);

      expect(server.commands()[0]).toMatchObject({
        action: 'seek',
        expected_item_id: 'item-q1',
        position_millis: 42000,
      });
    });

    it('runs one command at a time', async () => {
      const { server, remote } = await adopted();
      const release = server.holdNext('POST /v1/integrations/sonos/playback/h1/commands');

      const first = remote.command({ action: 'play' });
      await flush();
      expect(await remote.command({ action: 'pause' })).toBe(false);
      release();
      await first;

      expect(server.commands().map((command) => command.action)).toEqual(['play']);
    });

    it('stops a command started under an account that signed out', async () => {
      const { server, remote, switchAccount } = await adopted();
      const release = server.holdNext('POST /v1/integrations/sonos/playback/h1/commands');

      const command = remote.command({ action: 'play' });
      await flush();
      switchAccount();
      release();

      expect(await command).toBe(false);
      expect(remote.getState()).toEqual({ kind: 'none' });
      expect(server.requestsTo('GET /v1/integrations/sonos/playback/h1')).toBe(1);
    });

    it('drops a read that answers after the account changed', async () => {
      const { server, remote, switchAccount } = await adopted();
      const release = server.holdNext('GET /v1/integrations/sonos/playback/h1');

      const read = remote.refresh();
      await flush();
      switchAccount();
      release();
      await read;

      expect(remote.getState()).toEqual({ kind: 'none' });
    });
  });

  describe('queue edits', () => {
    const order = [
      { occurrenceId: 'q1', trackId: 'track_x' },
      { occurrenceId: 'q2', trackId: 'track_y' },
      { occurrenceId: 'q3', trackId: 'track_z' },
    ];

    it('names the version an edit saved when it next jumps', async () => {
      const { server, remote } = await adopted();

      expect(await remote.saveQueue(order, 1)).toEqual({ kind: 'saved', version: 2 });
      expect(await remote.command({ action: 'skip', occurrenceId: 'q3' })).toBe(true);

      expect(server.commands()[0]).toMatchObject({ expected_queue_version: 2 });
    });

    it('sends a lost edit again with the same command ID', async () => {
      const { server, remote } = await adopted();
      server.failNext('PUT /v1/integrations/sonos/playback/h1/queue', lost());

      expect(await remote.saveQueue(order, 1)).toEqual({ kind: 'saved', version: 2 });

      const puts = server.sent.filter((entry) => entry.method === 'PUT');
      expect(puts).toHaveLength(2);
      expect(puts[1].body).toEqual(puts[0].body);
    });

    it('tells an edit the room moved on from one it refused', async () => {
      const { server, remote } = await adopted();
      server.failNext(
        'PUT /v1/integrations/sonos/playback/h1/queue',
        new AccountsApiError('', 409, 'sonos_playback_changed', false)
      );

      expect(await remote.saveQueue(order, 1)).toEqual({ kind: 'trackMoved' });
      expect(await remote.saveQueue(order.slice(1), 1)).toEqual({
        kind: 'refused',
        message: 'Sonos keeps the tracks through the one playing.',
      });
    });

    it('refuses an edit chosen from an older version', async () => {
      const { remote } = await adopted();

      expect(await remote.saveQueue(order, 0)).toEqual({
        kind: 'refused',
        message: 'The queue changed on another device.',
      });
    });
  });

  describe('volume', () => {
    it('sets the group volume and reads it back', async () => {
      const { server, remote } = await adopted();

      await remote.refreshVolume();
      await remote.setVolume({ volume: 45.4 });

      expect(server.commands()[0]).toMatchObject({ action: 'volume', volume: 45 });
      expect(shown(remote)?.volume?.volume).toBe(45);
    });

    it('unmutes a muted room when its volume moves', async () => {
      const { server, remote } = await adopted();
      server.room.volume = { volume: 30, muted: true, fixed: false };
      await remote.refreshVolume();

      await remote.setVolume({ volume: 40 });

      expect(server.room.volume).toEqual({ volume: 40, muted: false, fixed: false });
      expect(shown(remote)?.volume).toEqual({ volume: 40, muted: false, fixed: false });
    });

    it('shows a group’s last volume when a new handle plays on it', async () => {
      const { server, remote } = await adopted();
      server.room.volume = { volume: 30, muted: true, fixed: false };
      await remote.refreshVolume();

      server.room.handle = 'h2';
      remote.adopt('h2', 'Office');
      await flush();

      expect(shown(remote)?.playback.handle).toBe('h2');
      expect(shown(remote)?.volume).toEqual({ volume: 30, muted: true, fixed: false });
    });

    it('leaves a pause that is still confirming alone when a volume change fails', async () => {
      const { server, remote } = await adopted();
      server.room.playbackState = 'PLAYBACK_STATE_PLAYING';
      await remote.refresh();
      await remote.refreshVolume();
      const release = server.holdNext('POST /v1/integrations/sonos/playback/h1/commands');

      const pause = remote.command({ action: 'pause' });
      await flush();
      server.failNext(
        'POST /v1/integrations/sonos/playback/h1/commands',
        new AccountsApiError('', 409, 'sonos_volume_fixed', false)
      );
      await remote.setVolume({ volume: 10 });

      expect(shown(remote)?.pending).toBe('pause');
      release();
      expect(await pause).toBe(true);
    });
  });

  describe('repeat', () => {
    it('sets the room’s repeat mode and reads it back', async () => {
      const { server, remote } = await adopted();

      await remote.setRepeat('all');

      expect(server.commands()).toEqual([
        { action: 'repeat', command_id: expect.any(String), repeat_mode: 'all' },
      ]);
      expect(shown(remote)?.playback.repeatMode).toBe('all');
    });

    it('keeps showing a tapped mode when a poll sent before it answers', async () => {
      const { server, remote } = await adopted();
      const releasePoll = server.holdNext('GET /v1/integrations/sonos/playback/h1');
      const poll = remote.refresh();
      await flush();

      const set = remote.setRepeat('all');
      await flush();
      expect(shown(remote)?.playback.repeatMode).toBe('all');
      releasePoll();
      await poll;
      expect(shown(remote)?.playback.repeatMode).toBe('all');
      await set;
    });

    it('ignores another tap while a repeat change is on its way', async () => {
      const { server, remote } = await adopted();
      const release = server.holdNext('POST /v1/integrations/sonos/playback/h1/commands');

      const first = remote.setRepeat('all');
      await flush();
      await remote.setRepeat('one');
      release();
      await first;

      expect(server.commands().map((command) => command.repeat_mode)).toEqual(['all']);
    });

    it('reports no mode while the room is unconfirmed, so controls rest', () => {
      const { remote } = store();
      remote.adopt('h1', 'Office');

      expect(roomRepeatOf(remote.getState())).toEqual({
        repeatMode: null,
        canRepeat: false,
        canRepeatOne: false,
      });
    });

    it('explains a mode the room refuses and shows its real one', async () => {
      const { server, remote } = await adopted();
      server.room.canRepeatOne = false;

      await remote.setRepeat('one');

      expect(shown(remote)?.commandError).toBe('That isn’t available for this track.');
      expect(shown(remote)?.playback.repeatMode).toBe('off');
    });

    it.each([
      ['off', true, true, 'all'],
      ['all', true, true, 'one'],
      ['one', true, true, 'off'],
      ['off', false, true, 'one'],
      ['all', true, false, 'off'],
      ['off', false, false, undefined],
      [null, true, true, undefined],
    ] as const)('moves from %s (all %s, one %s) to %s', (mode, canRepeat, canRepeatOne, next) => {
      expect(nextSonosRepeatMode({ repeatMode: mode, canRepeat, canRepeatOne })).toBe(next);
    });
  });

  describe('handoffs', () => {
    const request = () =>
      handoffRequest({
        requestId: 'request-1',
        groupId: 'g1',
        tracks: [
          { identifier: 'q1', sourceTrack: { uuid: '11111111-1111-4111-8111-111111111111' } },
        ],
        currentIdentifier: 'q1',
        positionSeconds: 0,
      })!;

    it('refuses a second handoff while the first is settling', async () => {
      const { server, remote } = store();
      const release = server.holdNext('POST /v1/integrations/sonos/handoffs');

      const first = remote.handOff(request(), 'Office');
      await flush();
      const second = await remote.handOff({ ...request(), group_id: 'g2' }, 'Kitchen');
      release();
      await first;

      expect(second).toEqual({
        kind: 'refused',
        message: 'Your queue is still moving to Office.',
        reconnect: false,
      });
      expect(server.requestsTo('POST /v1/integrations/sonos/handoffs')).toBe(1);
    });

    it('takes over the room once it confirms, remembering the order it sent', async () => {
      const { remote } = store();

      const outcome = await remote.handOff(request(), 'Office');

      expect(outcome).toEqual({ kind: 'playing', handle: HANDLE_UUID });
      expect(remote.takeHandedOffOrder(HANDLE_UUID)).toEqual(['q1']);
      expect(remote.takeHandedOffOrder(HANDLE_UUID)).toBeUndefined();
    });

    it('doesn’t take over a room for an account that changed during the handoff', async () => {
      const { server, remote, switchAccount } = store();
      const release = server.holdNext('POST /v1/integrations/sonos/handoffs');

      const handoff = remote.handOff(request(), 'Office');
      await flush();
      switchAccount();
      release();
      await handoff;

      expect(remote.getState()).toEqual({ kind: 'none' });
    });
  });

  describe('the room this device chose', () => {
    it('restores it on launch, without sending commands', async () => {
      const { server, remote } = store('h1');

      await remote.discover(() => true);

      expect(shown(remote)?.playback.handle).toBe('h1');
      expect(server.commands()).toEqual([]);
    });

    it('leaves it alone while something else plays', async () => {
      const { server, remote } = store('h1');

      await remote.discover(() => false);

      expect(remote.getState()).toEqual({ kind: 'none' });
      expect(server.sent).toEqual([]);
    });

    it('doesn’t restore it if the phone started playing during the read', async () => {
      const { remote, rooms } = store('h1');
      let canRestore = true;
      const check = () => {
        const answer = canRestore;
        canRestore = false;
        return answer;
      };

      await remote.discover(check);

      expect(remote.getState()).toEqual({ kind: 'none' });
      expect(rooms.save).not.toHaveBeenCalled();
    });

    it('waits for a handoff in flight instead of restoring an older room', async () => {
      const { server, remote } = store('h1');
      const release = server.holdNext('POST /v1/integrations/sonos/handoffs');
      const handoff = remote.handOff(
        handoffRequest({
          requestId: 'request-1',
          groupId: 'g1',
          tracks: [
            { identifier: 'q1', sourceTrack: { uuid: '11111111-1111-4111-8111-111111111111' } },
          ],
          currentIdentifier: 'q1',
          positionSeconds: 0,
        })!,
        'Office'
      );
      await flush();

      await remote.discover(() => true);

      expect(server.requestsTo('GET /v1/integrations/sonos/playback/h1')).toBe(0);
      release();
      await handoff;
    });

    it('takes over no room when this device chose none', async () => {
      const { server, remote } = store(undefined);

      await remote.discover(() => true);

      expect(remote.getState()).toEqual({ kind: 'none' });
      expect(server.sent).toEqual([]);
    });

    it('forgets a remembered room whose handle is gone', async () => {
      const { remote, rooms } = store('expired');

      await remote.discover(() => true);

      expect(rooms.save).toHaveBeenCalledWith('user-1', undefined);
    });

    it('remembers an adopted room and forgets one that ended', async () => {
      const { server, remote, rooms } = await adopted();
      server.room.status = 'evicted';

      await remote.refresh();

      expect(rooms.save).toHaveBeenNthCalledWith(1, 'user-1', 'h1');
      expect(rooms.save).toHaveBeenLastCalledWith('user-1', undefined);
    });

    it('ends remote control on sign-out', async () => {
      const { remote } = await adopted();

      remote.bind(undefined, () => true, undefined);

      expect(remote.getState()).toEqual({ kind: 'none' });
    });
  });
});
