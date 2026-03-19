import { PropsWithChildren } from 'react';
import { View } from 'react-native';

export const ScrollScreen = ({ children }: PropsWithChildren) => {
  return <View style={{ flex: 1 }}>{children}</View>;
};
