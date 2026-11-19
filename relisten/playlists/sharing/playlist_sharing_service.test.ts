/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Realm from 'realm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AccountsApiError,
  type AuthorizedAccountsApiClient,
} from '@/relisten/accounts/api/accounts_api_client';
import type { AccountScopeSnapshot, AccountScopeSource } from '@/relisten/accounts/account_context';
import { FAVORITE_REALM_MODELS } from '@/relisten/realm/models/library';
import {
  Playlist,
  PLAYLIST_REALM_MODELS,
  PlaylistCopyCommand,
} from '@/relisten/realm/models/playlists/playlist';
import { formatUuidTypedId } from '@/relisten/util/typed_uuid_id';
import { PlaylistSharingService } from './playlist_sharing_service';
import type { PublicPlaylistSnapshot } from './sharing_wire';

vi.mock('@/relisten/util/logging', () => ({
  log: { extend: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));
vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));

const typedId = (prefix: string, suffix: number) =>
  formatUuidTypedId(prefix, `01890a5d-ac96-774b-bcce-b302099a80${suffix}`);
const listener = typedId('user', 51);
const owner = typedId('user', 61);
const playlistId = typedId('playlist', 52);
const copyId = typedId('playlist', 58);
const publicCode = '0123456789abcdef0123456789abcdef';

const publicSnapshot: PublicPlaylistSnapshot = {
  contract_version: 1,
  history_generation: 'generation-a',
  playlist_id: playlistId,
  public_code: publicCode,
  revision: 3,
  owner: { id: owner, username: 'deadhead' },
  metadata: { name: 'Cornell + friends', description: null },
  segments: [
    {
      segment_id: typedId('playlist_segment', 53),
      rank: 'a0',
      description: 'Start here',
      entries: [],
    },
  ],
};

type Respond = (path: string, init?: RequestInit) => unknown;

describe('playlist sharing service', () => {
  let directory: string;
  let realm: Realm;
  let scope: AccountScopeSnapshot;
  let respond: Respond;
  let service: PlaylistSharingService;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'relisten-sharing-'));
    realm = await Realm.open({
      path: join(directory, 'sharing.realm'),
      schemaVersion: 1,
      schema: [...PLAYLIST_REALM_MODELS, ...FAVORITE_REALM_MODELS],
    });

    scope = {
      scopeId: listener,
      userId: listener,
      generation: 1,
      nativeSessionId: 'session',
      isAuthenticated: true,
    };
    const scopes: AccountScopeSource = {
      subscribe: () => () => {},
      getSnapshot: () => scope,
      capture: () => scope,
      isCurrent: (capture) => capture === scope,
    };
    const request = async (path: string, init?: RequestInit) => respond(path, init);
    const api = { request, requestAnonymously: request } as unknown as AuthorizedAccountsApiClient;
    service = new PlaylistSharingService(realm, api, scopes, () => {});
  });

  afterEach(() => {
    realm.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const failure = (action: Promise<unknown>) =>
    action.then(
      () => 'resolved',
      (error) => error.failure
    );
  const commandIdOf = (init?: RequestInit) => JSON.parse(init!.body as string).command_id as string;

  it('resends the same copy command after a network error, and makes one copy', async () => {
    const sent: string[] = [];
    respond = (_path, init) => {
      sent.push(commandIdOf(init));
      if (sent.length === 1) {
        throw new AccountsApiError('offline', null, null, true);
      }
      return { contract_version: 1, history_generation: 'g', playlist_id: copyId, revision: 1 };
    };

    expect(await failure(service.copy(publicCode, 'Cornell'))).toBe('retry');
    expect(await service.copy(publicCode, 'Cornell')).toBe(copyId);

    expect(sent[1]).toBe(sent[0]);
    expect(realm.objectForPrimaryKey(Playlist, copyId)!.libraryUserId).toBe(listener);
    expect(realm.objects(PlaylistCopyCommand)).toHaveLength(0);
  });

  it('forgets a copy the server refused for good', async () => {
    respond = () => {
      throw new AccountsApiError('gone', 404, 'playlist_not_found', false);
    };

    expect(await failure(service.copy(publicCode, 'Cornell'))).toBe('unavailable');

    expect(realm.objects(PlaylistCopyCommand)).toHaveLength(0);
  });

  it('writes nothing when the response arrives after an account switch', async () => {
    respond = () => {
      scope = { ...scope, generation: 2, userId: owner, scopeId: owner };
    };

    await service.follow(publicSnapshot);

    expect(realm.objects(Playlist)).toHaveLength(0);
  });

  it('refuses a public snapshot whose guide text is not a string', async () => {
    respond = () => publicSnapshot;
    expect(await service.publicSnapshot(publicCode)).toEqual(publicSnapshot);

    respond = () => ({
      ...publicSnapshot,
      segments: [{ ...publicSnapshot.segments[0], description: { markdown: 'Start here' } }],
    });
    expect(await failure(service.publicSnapshot(publicCode))).toBe('retry');
  });
});
