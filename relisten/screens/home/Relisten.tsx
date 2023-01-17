import React, { PropsWithChildren } from 'react';
import { Text, View } from 'react-native-ui-lib';

export const RelistenScreen: React.FC<PropsWithChildren<{}>> = () => {
  return (
    <View useSafeArea flex style={{ width: '100%' }}>
      <Text>Home Screen</Text>
    </View>
  );
};
