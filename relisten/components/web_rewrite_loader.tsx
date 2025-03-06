import { usePathname, useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';
import { RelistenButton } from '@/relisten/components/relisten_button';

export function WebRewriteLoader() {
  const pathname = usePathname().replace(/^\/web/, '');
  const router = useRouter();

  return (
    <View className="flex-1 items-center justify-center bg-relisten-blue-900">
      <RelistenText className="pb-1 text-gray-300">Loading</RelistenText>
      <RelistenText className="pb-4 text-white">relisten.net{pathname}</RelistenText>
      <ActivityIndicator size="large" color="white" />
      <RelistenButton className="mt-4" onPress={() => router.push({ pathname: '/relisten/tabs' })}>
        Go to all artists
      </RelistenButton>
    </View>
  );
}
