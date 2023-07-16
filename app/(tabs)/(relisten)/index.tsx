import { play } from '@/modules/relisten-audio-player';
import { Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Page() {
  return (
    <SafeAreaView>
      <TouchableOpacity onPress={play}>
        <Text className="rounded bg-red-500 p-12 text-white">play test</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
