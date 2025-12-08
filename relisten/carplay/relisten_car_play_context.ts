import { Realm } from '@realm/react';
import { RelistenApiClient } from '@/relisten/api/client';
import { carplay_logger } from '@/relisten/carplay/carplay_logger';
import { RelistenPlayer } from '@/relisten/player/relisten_player';
import { UserSettings } from '@/relisten/realm/models/user_settings';

export class RelistenCarPlayContext {
  public readonly userSettings: UserSettings;
  public showNowPlaying?: () => void;
  public nowPlayingVisible = false;

  constructor(
    public readonly realm: Realm,
    public readonly apiClient: RelistenApiClient,
    public readonly player: RelistenPlayer
  ) {
    this.userSettings = UserSettings.defaultObject(realm);
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
