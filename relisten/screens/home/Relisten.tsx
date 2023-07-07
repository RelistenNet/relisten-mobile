import React, { PropsWithChildren } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const RelistenScreen: React.FC<PropsWithChildren<{}>> = () => {
  return (
    <SafeAreaView style={{ width: '100%', flex: 1 }} className="bg-orange-600">
      <View className="flex h-40 items-center justify-center bg-green-600">
        <Text className="font-semibold text-red-300 text-5xl">Home Screen 2</Text>
      </View>
    </SafeAreaView>
  );
};
