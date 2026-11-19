import { confirmDestructiveAction } from '@/relisten/components/menus/confirm_destructive_action';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import Realm from 'realm';

export function confirmClearListeningHistory(realm: Realm) {
  confirmDestructiveAction({
    confirmLabel: 'Clear History',
    message:
      'This clears listening history on this device. Plays already saved to your Relisten account stay there.',
    onConfirm: () => {
      const history = realm.objects(PlaybackHistoryEntry);
      realm.write(() => {
        realm.delete(history);
      });
    },
    title: 'Clear Listening History?',
  });
}
