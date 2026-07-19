import type { FavoriteSyncFailure } from '@/relisten/library/favorite_hooks';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import { Alert, View } from 'react-native';

type FavoriteSyncFailureNoticeProps = {
  failure: FavoriteSyncFailure;
  onDiscardRejected: () => void;
  onRetry: () => void;
};

export function FavoriteSyncFailureNotice({
  failure,
  onDiscardRejected,
  onRetry,
}: FavoriteSyncFailureNoticeProps) {
  const rejected = failure.kind === 'rejected';
  const noun = failure.count === 1 ? 'change' : 'changes';

  const confirmDiscard = () => {
    Alert.alert(
      `Discard ${failure.count} favorite ${noun}?`,
      `Relisten will restore ${failure.count === 1 ? 'this favorite' : 'these favorites'} to the last state saved with your account.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: failure.count === 1 ? 'Discard change' : 'Discard changes',
          style: 'destructive',
          onPress: onDiscardRejected,
        },
      ]
    );
  };

  return (
    <View
      accessibilityLiveRegion="polite"
      className={
        rejected
          ? 'gap-3 rounded-lg border border-red-500/40 bg-red-950/40 p-4'
          : 'gap-3 rounded-lg border border-amber-500/40 bg-amber-950/30 p-4'
      }
    >
      <View className="gap-1">
        <RelistenText className="font-semibold">
          {rejected
            ? `${failure.count} favorite ${noun} could not be saved`
            : "Favorites couldn't finish syncing"}
        </RelistenText>
        <RelistenText className="text-sm text-gray-300">{failure.message}</RelistenText>
        {failure.errorCode && (
          <RelistenText className="text-xs text-gray-500">
            Reference: {failure.errorCode}
          </RelistenText>
        )}
      </View>

      <RelistenButton intent="outline" onPress={rejected ? confirmDiscard : onRetry} size="sm">
        {rejected ? (failure.count === 1 ? 'Discard change' : 'Discard changes') : 'Try again'}
      </RelistenButton>
    </View>
  );
}
