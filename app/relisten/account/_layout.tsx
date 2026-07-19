import { RelistenBlue } from '@/relisten/relisten_blue';
import { Stack } from 'expo-router/stack';
import { useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';

function CloseAccountButton() {
  const router = useRouter();

  const closeAccount = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    // A cold account deep link has no caller to return to. My Library is the most
    // useful stable destination because it also exposes sync state and account access.
    router.replace('/relisten/tabs/(myLibrary)');
  };

  return (
    <Pressable accessibilityRole="button" hitSlop={12} onPress={closeAccount}>
      <Text className="text-base font-semibold text-white">Done</Text>
    </Pressable>
  );
}

export default function AccountLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: RelistenBlue['950'] },
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: RelistenBlue['900'] },
        headerTintColor: 'white',
      }}
    >
      <Stack.Screen
        name="index"
        options={{ headerRight: () => <CloseAccountButton />, title: 'Account' }}
      />
      <Stack.Screen name="username" options={{ title: 'Username' }} />
    </Stack>
  );
}
