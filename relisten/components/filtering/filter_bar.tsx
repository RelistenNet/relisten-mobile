import { FunctionComponent, PropsWithChildren } from 'react';
import { ScrollView, View } from 'react-native';

export const FilterBar: FunctionComponent<PropsWithChildren> = ({ children }) => {
  return (
    <ScrollView horizontal className="w-full pb-3">
      <View className="flex w-full flex-row justify-start px-4" style={{ gap: 8 }}>
        {children}
      </View>
    </ScrollView>
  );
};
