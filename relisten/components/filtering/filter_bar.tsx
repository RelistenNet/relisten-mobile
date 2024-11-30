import { PropsWithChildren } from 'react';
import { ScrollView } from 'react-native';

export const FilterBar = ({ children }: PropsWithChildren) => {
  return (
    <ScrollView horizontal className="flex w-full gap-3 px-4 pb-3">
      {children}
    </ScrollView>
  );
};
