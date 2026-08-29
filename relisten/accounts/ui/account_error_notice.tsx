import { RelistenText } from '@/relisten/components/relisten_text';
import { View } from 'react-native';

export function accountErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return 'Relisten could not finish that account action. Try again.';
}

export function AccountErrorNotice({ message }: { message: string }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      className="rounded-md border border-red-500/40 bg-red-950/40 p-3"
    >
      <RelistenText className="text-sm text-red-200">{message}</RelistenText>
    </View>
  );
}
