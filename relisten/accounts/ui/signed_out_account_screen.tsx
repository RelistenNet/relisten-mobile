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
      className="flex-1 bg-relisten-blue-950"
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <Flex column>
        <View className="mb-6">
          <RelistenText className="text-3xl font-bold">Sync your favorites</RelistenText>
          <RelistenText className="mt-2 text-gray-300">
            Sign in to keep favorites available on your signed-in devices.
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
          Relisten does not create or store a separate password.
        </RelistenText>
      </Flex>
    </ScrollView>
  );
}
