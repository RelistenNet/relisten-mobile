import React, { PropsWithChildren } from 'react';
import { View as RNView } from 'react-native';
import { Text, View } from 'react-native-ui-lib';

export const RelistenScreen: React.FC<PropsWithChildren<{}>> = () => {
  return (
    <View useSafeArea flex style={{ width: '100%' }} className="bg-orange-600">
      <RNView className="bg-green-600 h-40 flex items-center justify-center">
        <Text className="text-red-300 text-5xl font-semibold">Home Screen 2</Text>
      </RNView>
    </View>
  );
};
