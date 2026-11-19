import { confirmDestructiveAction } from '@/relisten/components/menus/confirm_destructive_action';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import Realm from 'realm';

export function confirmClearListeningHistory(realm: Realm) {
  confirmDestructiveAction({
    confirmLabel: 'Clear History',
    // Plays already saved to an account stay there until the account is deleted.
    message:
      'This clears listening history on this device. Plays saved to your Relisten account stay there until you delete your account.',
    onConfirm: () => {
      const history = realm.objects(PlaybackHistoryEntry);
      realm.write(() => {
        realm.delete(history);
      });
    },
    title: 'Clear Listening History?',
  });
}
