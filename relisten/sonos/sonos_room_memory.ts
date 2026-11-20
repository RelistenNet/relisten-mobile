import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Where this device remembers the room it chose, per account, across
 * launches: the playback handle of the room's queue. Only this device's own
 * choice is remembered, so a relaunch never takes over another device's room.
 */
export interface SonosRoomMemory {
  load(account: string): Promise<string | undefined>;
  save(account: string, handle: string | undefined): Promise<void>;
}

const roomKey = (account: string) => `relisten.sonos.room.${account}`;

export const asyncStorageRoomMemory: SonosRoomMemory = {
  load: async (account) => (await AsyncStorage.getItem(roomKey(account))) ?? undefined,
  save: (account, handle) =>
    handle === undefined
      ? AsyncStorage.removeItem(roomKey(account))
      : AsyncStorage.setItem(roomKey(account), handle),
};

/** Forgets a deleted account's room. */
export function forgetSonosRoom(account: string): Promise<void> {
  return asyncStorageRoomMemory.save(account, undefined);
}
