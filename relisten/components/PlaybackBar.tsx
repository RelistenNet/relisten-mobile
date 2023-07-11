import { useSegments } from 'expo-router';
import { MotiView } from 'moti';
import { useReducer } from 'react';
import { Text, TouchableOpacity } from 'react-native';

export default function PlaybackBar() {
  const [isDetail, toggleDetail] = useReducer((state) => !state, false);
  const segments = useSegments();

  return (
    <TouchableOpacity onPress={toggleDetail} activeOpacity={1}>
      <MotiView
        from={{ opacity: 0, height: 0 }}
        animate={{
          opacity: 1,
          height: isDetail ? 400 : segments.length * 32,
        }}
        transition={{ type: 'spring' }}
        className="flex items-center justify-center bg-green-300"
      >
        <Text>Look, this is always visible (if we want it to be)! It's dynamic!</Text>
        <Text>
          active "URL": {segments.join('/')}; bar height: {segments.length * 32}px
        </Text>
      </MotiView>
    </TouchableOpacity>
  );
}
