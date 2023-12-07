import { PropsWithChildren } from 'react';
import { ScrollView, View } from 'react-native';

export const FilterBar = ({ children }: PropsWithChildren) => {
  return (
    <ScrollView horizontal className="w-full pb-3">
      <View className="flex w-full flex-row justify-start gap-3 px-4">{children}</View>
    </ScrollView>
  );
};
