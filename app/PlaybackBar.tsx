import { MotiView } from 'moti';
import { useSegments } from 'expo-router';
import { Text, View } from 'react-native';

export default function PlayerBar() {
  const segments = useSegments();

  return (
    <MotiView
      from={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: segments.length * 32 }}
      transition={{ type: 'spring' }}
      className="flex items-center justify-center bg-green-300"
    >
      <Text>Look, this is always visible (if we want it to be)! It's dynamic!</Text>
      <Text>
        active "URL": {segments.join('/')}; bar height: {segments.length * 32}px
      </Text>
    </MotiView>
  );
}
