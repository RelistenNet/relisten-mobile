import { confirmDestructiveAction } from '@/relisten/components/menus/confirm_destructive_action';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import Realm from 'realm';

export function confirmClearListeningHistory(realm: Realm) {
  confirmDestructiveAction({
    confirmLabel: 'Clear History',
    message: 'This will permanently delete your listening history.',
    onConfirm: () => {
      const history = realm.objects(PlaybackHistoryEntry);
      realm.write(() => {
        realm.delete(history);
      });
    },
    title: 'Clear Listening History?',
  });
}
