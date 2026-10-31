import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes,
}));

vi.mock('@/relisten/util/logging', () => ({
  log: {
    extend: () => ({ info: vi.fn(), warn: vi.fn() }),
  },
}));

import type { AccountProfileSnapshot } from './api/account_profile';
import { UsernameService } from './username_service';

const profile: AccountProfileSnapshot = {
  userId: 'user_01hx3x56tafay8vvr14d2pf2db',
  nativeSessionId: 'session_01hx3x56tbfay8vvr14d2pf2db',
  username: 'old_listener',
  usernameVersion: 2,
  usernameReviewNeeded: false,
  usernameReviewedAt: null,
  usernameChangeAvailableAt: null,
  lastSyncedAt: new Date('2026-10-31T00:00:00.000Z'),
};

describe('UsernameService', () => {
  it('retries the saved typed command identity on the C2 wire contract', async () => {
    const capture = {
      scopeId: profile.userId,
      userId: profile.userId,
      nativeSessionId: profile.nativeSessionId,
      generation: 1,
      isAuthenticated: true,
    };
    const command = {
      scopeId: capture.scopeId,
      commandId: 'command_01hx3x56tcfay8vvr14d2pf2db',
      expectedUsernameVersion: profile.usernameVersion,
      username: 'new_listener',
    };
    const scopeStore = {
      capture: vi.fn(() => capture),
      isCurrent: vi.fn(() => true),
      activeProfile: vi.fn(() => profile),
      updateProfile: vi.fn(),
    };
    const commandStore = {
      pending: vi.fn(() => command),
      create: vi.fn(),
      clear: vi.fn(),
    };
    const accountsApi = { updateUsername: vi.fn().mockResolvedValue(profile) };
    const service = new UsernameService(
      scopeStore as never,
      commandStore as never,
      accountsApi as never
    );

    await service.update(command.username, profile);

    expect(accountsApi.updateUsername).toHaveBeenCalledWith({
      contract_version: 1,
      command_id: command.commandId,
      expected_username_version: 2,
      username: 'new_listener',
    });
    expect(commandStore.create).not.toHaveBeenCalled();
    expect(commandStore.clear).toHaveBeenCalledWith(command);
  });
});
