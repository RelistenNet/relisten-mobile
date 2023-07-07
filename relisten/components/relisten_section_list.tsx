import { RefreshControl, SectionList, SectionListData, SectionListRenderItem } from 'react-native';
import { SectionHeader } from './section_header';
import { ItemSeparator } from './item_separator';
import { useRefreshContext } from './refresh_context';
import { SectionListProps } from 'react-native/Libraries/Lists/SectionList';

export const RelistenSectionList = <T extends { uuid: string }>({
  sections,
  renderItem,
  ...props
}: {
  sections: ReadonlyArray<SectionListData<T, { title: string; data: T[] }>>;
  renderItem: SectionListRenderItem<T, { title: string; data: T[] }>;
} & SectionListProps<T, { title: string; data: T[] }>) => {
  const { onRefresh, refreshing } = useRefreshContext();

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.uuid}
      renderSectionHeader={({ section: { title } }) => {
        return <SectionHeader title={title} />;
      }}
      ItemSeparatorComponent={ItemSeparator}
      renderItem={renderItem}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      {...props}
    ></SectionList>
  );
};
