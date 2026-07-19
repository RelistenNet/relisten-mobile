import { RelistenBlue } from '@/relisten/relisten_blue';
import { Stack } from 'expo-router/stack';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable } from 'react-native';

function AccountBackButton() {
  const router = useRouter();

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    // A cold account deep link has no caller to return to. My Library is the most
    // useful stable destination because it also exposes sync state and account access.
    router.replace('/relisten/tabs/(myLibrary)');
  };

  return (
    <Pressable
      accessibilityLabel="Back"
      accessibilityRole="button"
      className="pl-1 pr-3"
      hitSlop={12}
      onPress={goBack}
    >
      <MaterialIcons color="white" name="arrow-back-ios-new" size={22} />
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
        options={{ headerLeft: () => <AccountBackButton />, title: 'Account' }}
      />
      <Stack.Screen name="username" options={{ title: 'Username' }} />
    </Stack>
  );
}
