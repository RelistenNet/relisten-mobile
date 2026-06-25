import { Alert } from 'react-native';

type ConfirmDestructiveActionOptions = {
  confirmLabel: string;
  message: string;
  onConfirm: () => void | Promise<void>;
  title: string;
};

export function confirmDestructiveAction({
  confirmLabel,
  message,
  onConfirm,
  title,
}: ConfirmDestructiveActionOptions) {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: confirmLabel,
      style: 'destructive',
      onPress: () => {
        void onConfirm();
      },
    },
  ]);
}
