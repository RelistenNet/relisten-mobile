import { AccountErrorNotice } from '@/relisten/accounts/ui/account_error_notice';
import type { AccountProvider } from '@/relisten/accounts/auth/account_auth_types';
import { ProviderButton } from '@/relisten/accounts/ui/provider_button';
import Flex from '@/relisten/components/flex';
import { RelistenText } from '@/relisten/components/relisten_text';
import { ScrollView, View } from 'react-native';

type SignedOutAccountScreenProps = {
  busy: boolean;
  errorMessage?: string;
  onSignIn: (provider: AccountProvider) => Promise<void>;
  openingProvider: AccountProvider | null;
};

export function SignedOutAccountScreen({
  busy,
  errorMessage,
  onSignIn,
  openingProvider,
}: SignedOutAccountScreenProps) {
  return (
    <ScrollView
      className="flex-1 bg-relisten-blue-900"
      contentContainerStyle={{ padding: 24, paddingTop: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <Flex column>
        <View className="mb-6">
          <RelistenText className="text-3xl font-bold">Sign in to Relisten</RelistenText>
          <RelistenText className="mt-2 text-gray-300">
            Save your favorites and playlists to your account and use them on your other devices.
            Everything keeps working on this phone without an account.
          </RelistenText>
        </View>

        {errorMessage && (
          <View className="mb-5">
            <AccountErrorNotice message={errorMessage} />
          </View>
        )}

        <View className="mb-3">
          <ProviderButton
            disabled={busy}
            opening={openingProvider === 'apple'}
            onPress={() => onSignIn('apple')}
            provider="apple"
          />
        </View>
        <View className="mb-6">
          <ProviderButton
            disabled={busy}
            opening={openingProvider === 'google'}
            onPress={() => onSignIn('google')}
            provider="google"
          />
        </View>

        <RelistenText className="text-center text-sm text-gray-400">
          No new password needed.
        </RelistenText>
      </Flex>
    </ScrollView>
  );
}
