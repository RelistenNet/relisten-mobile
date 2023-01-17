import React, { PropsWithChildren } from 'react';
import { Text, View } from 'react-native-ui-lib';

export const AllFavoritesScreen: React.FC<PropsWithChildren<{}>> = () => {
  return (
    <View useSafeArea flex style={{ width: '100%' }}>
      <Text>All favorites</Text>
    </View>
  );
};
