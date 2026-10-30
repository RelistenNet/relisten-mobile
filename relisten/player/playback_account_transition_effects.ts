import Realm from 'realm';
import { AccountTransitionEffects } from '@/relisten/accounts/account_transition_effects';
import { PlayerState } from '@/relisten/realm/models/player_state';
import { RelistenPlayer } from './relisten_player';
import { log } from '@/relisten/util/logging';

const logger = log.extend('account-playback-transition');

export class PlaybackAccountTransitionEffects implements AccountTransitionEffects {
  constructor(
    private readonly player: RelistenPlayer,
    private readonly realm: Realm
  ) {}

  async beforeLeavingAuthenticatedScope(): Promise<void> {
    try {
      // The active playback driver may be native or Cast. Stopping through the player
      // preserves that ownership decision and prevents a remote queue from continuing.
      await this.player.stop();
    } catch {
      logger.warn('Playback did not stop cleanly during the account transition');
    }

    try {
      this.player.queue.replaceQueue([], undefined);
    } finally {
      // replaceQueue persists its empty state on a debounce. Clear immediately as well so
      // a process exit during sign-out cannot restore the previous account's queue, even
      // if an observer throws while the in-memory queue change is being dispatched.
      PlayerState.clear(this.realm);
    }
  }
}
