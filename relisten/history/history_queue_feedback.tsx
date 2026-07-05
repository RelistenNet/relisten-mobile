import { RelistenText } from '@/relisten/components/relisten_text';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { hideMessage, showMessage } from 'react-native-flash-message';
import { Pressable } from 'react-native';

export type HistoryQueueUndoResult = 'removed' | 'already-playing' | 'missing';

function showUndoResult(result: Exclude<HistoryQueueUndoResult, 'removed'>) {
  showMessage({
    duration: 2_000,
    message: result === 'already-playing' ? 'Already playing' : 'No longer in queue',
    type: 'info',
  });
}

export function showHistoryQueueConfirmation({
  message,
  onUndo,
}: {
  message: string;
  onUndo: () => HistoryQueueUndoResult;
}) {
  showMessage({
    backgroundColor: RelistenBlue[700],
    color: 'white',
    duration: 4_000,
    floating: true,
    hideOnPress: false,
    message,
    renderAfterContent: () => (
      <Pressable
        accessibilityHint="Removes the track that was just added."
        accessibilityLabel="Undo queue change"
        accessibilityRole="button"
        className="absolute right-0 top-[-13px] min-h-11 min-w-16 items-center justify-center px-3"
        onPress={() => {
          hideMessage();
          const result = onUndo();
          if (result !== 'removed') {
            showUndoResult(result);
          }
        }}
        style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
      >
        <RelistenText className="font-bold" selectable={false}>
          Undo
        </RelistenText>
      </Pressable>
    ),
    style: {
      borderColor: 'rgba(147, 224, 242, 0.3)',
      borderWidth: 1,
      boxShadow: '0 6px 18px rgba(0, 0, 0, 0.36)',
    },
    titleStyle: { paddingRight: 76 },
    type: 'info',
  });
}
