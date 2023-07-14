import { Link } from 'expo-router';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Page() {
  return (
    <SafeAreaView>
      <Text className="text-white">Bottom</Text>
      <Link href="/bottom/second" className="text-4xl text-red-500">
        Open
      </Link>
    </SafeAreaView>
  );
}
