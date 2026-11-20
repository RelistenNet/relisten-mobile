import { showToast } from '@/relisten/components/toast';

export type HistoryQueueUndoResult = 'removed' | 'already-playing' | 'missing';

/** Confirms a track queued from listening history, with Undo. */
export function showHistoryQueueConfirmation({
  message,
  onUndo,
}: {
  message: string;
  onUndo: () => HistoryQueueUndoResult;
}) {
  showToast(message, [
    {
      label: 'Undo',
      onPress: () => {
        const result = onUndo();
        if (result !== 'removed') {
          showToast(result === 'already-playing' ? 'Already playing' : 'No longer in queue');
        }
      },
    },
  ]);
}
