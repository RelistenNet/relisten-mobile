import { Realm } from '@realm/react';
import { RelistenApiClient } from '@/relisten/api/client';
import { carplay_logger } from '@/relisten/carplay/carplay_logger';
import { RelistenPlayer } from '@/relisten/player/relisten_player';
import { UserSettings } from '@/relisten/realm/models/user_settings';
import { LibraryIndex } from '@/relisten/realm/library_index';
import { UserSettingsStore } from '@/relisten/realm/user_settings_store';

export class RelistenCarPlayContext {
  public showNowPlaying?: () => void;
  public nowPlayingVisible = false;

  constructor(
    public readonly realm: Realm,
    public readonly apiClient: RelistenApiClient,
    public readonly player: RelistenPlayer,
    public readonly libraryIndex: LibraryIndex,
    private readonly userSettingsStore: UserSettingsStore
  ) {}

  get userSettings(): UserSettings {
    return this.userSettingsStore.current();
  }

  private teardowns: Array<() => void> = [];

  addTeardown(teardown: () => void) {
    this.teardowns.push(teardown);
  }

  tearDown() {
    for (const teardown of this.teardowns) {
      try {
        teardown();
      } catch (e) {
        carplay_logger.error('Error tearing down carplay context', e);
      }
    }

    this.teardowns = [];
  }
}
