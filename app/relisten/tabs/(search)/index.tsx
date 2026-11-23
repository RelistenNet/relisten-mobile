import { RelistenText } from '@/relisten/components/relisten_text';
import { View } from 'react-native';

// Placeholder until the Search screen lands (plan Task 4).
export default function SearchTabRoot() {
  return (
    <View className="flex-1 items-center justify-center bg-relisten-blue-900 p-6">
      <RelistenText className="text-gray-400">Search is coming soon.</RelistenText>
    </View>
  );
}
