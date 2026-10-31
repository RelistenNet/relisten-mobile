import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useAccountCallbackHandler } from '@/relisten/accounts/account_context';
import { RelistenText } from '@/relisten/components/relisten_text';
import { ActivityIndicator, View } from 'react-native';

export function AuthCallbackRoute() {
  const callbackUrl = Linking.useLinkingURL();
  const handleAuthCallback = useAccountCallbackHandler();
  const router = useRouter();

  useEffect(() => {
    let active = true;

    const finish = async () => {
      const url = callbackUrl ?? (await Linking.getInitialURL());

      if (url) {
        await handleAuthCallback(url).catch(() => undefined);
      }

      if (active) {
        router.replace('/relisten/account');
      }
    };

    finish();
    return () => {
      active = false;
    };
  }, [callbackUrl, handleAuthCallback, router]);

  return (
    <View className="flex-1 items-center justify-center gap-3 bg-relisten-blue-950 p-6">
      <ActivityIndicator color="white" size="large" />
      <RelistenText className="text-gray-300">Finishing sign in...</RelistenText>
    </View>
  );
}
