import React, { PropsWithChildren } from 'react';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const AllLibraryScreen: React.FC<PropsWithChildren<{}>> = () => {
  return (
    <SafeAreaView style={{ width: '100%', flex: 1 }}>
      <Text>All favorites</Text>
    </SafeAreaView>
  );
};
