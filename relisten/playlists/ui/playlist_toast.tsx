import { Pressable, View } from 'react-native';
import { hideMessage, showMessage } from 'react-native-flash-message';
import { RelistenText } from '@/relisten/components/relisten_text';
import { RelistenBlue } from '@/relisten/relisten_blue';

export interface PlaylistToastAction {
  label: string;
  onPress: () => void;
}

/**
 * The confirmation shown after every playlist edit, with actions such as Undo.
 * It follows the app's existing undo toast (`history_queue_feedback.tsx`): a
 * floating message at the top, clear of the mini player and tab bar. It stays
 * up long enough for someone who reads every word.
 */
export function showPlaylistToast(message: string, actions: PlaylistToastAction[] = []) {
  showMessage({
    backgroundColor: RelistenBlue[700],
    color: 'white',
    duration: 8_000,
    floating: true,
    hideOnPress: false,
    message,
    renderAfterContent: () =>
      actions.length > 0 ? (
        <View className="mt-2 flex-row justify-end">
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              className="min-h-[44px] min-w-[64px] items-center justify-center px-3"
              onPress={() => {
                hideMessage();
                action.onPress();
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
            >
              <RelistenText className="font-bold" selectable={false}>
                {action.label}
              </RelistenText>
            </Pressable>
          ))}
        </View>
      ) : null,
    style: {
      borderColor: 'rgba(147, 224, 242, 0.3)',
      borderWidth: 1,
      boxShadow: '0 6px 18px rgba(0, 0, 0, 0.36)',
    },
    type: 'info',
  });
}
