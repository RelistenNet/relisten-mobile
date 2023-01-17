import React, { PropsWithChildren } from 'react';
import { Text, View } from 'react-native-ui-lib';

export const ShowSourcesScreen: React.FC<PropsWithChildren<{}>> = () => {
  return (
    <View useSafeArea flex style={{ width: '100%' }}>
      <Text>All Offline</Text>
    </View>
  );
};
