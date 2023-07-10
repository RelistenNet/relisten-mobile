import { FlatList, RefreshControl } from 'react-native';
import { useRefreshContext } from './refresh_context';
import { ItemSeparator } from './item_separator';
import { ListRenderItem } from 'react-native/Libraries/Lists/VirtualizedList';
import { FlatListProps } from 'react-native/Libraries/Lists/FlatList';

export const RelistenFlatList = <T extends { uuid: string }>({
  data,
  renderItem,
  pullToRefresh = false,
  ...props
}: {
  data: ReadonlyArray<T>;
  renderItem: ListRenderItem<T>;
  pullToRefresh?: boolean;
} & FlatListProps<T>) => {
  const { onRefresh, refreshing } = useRefreshContext();

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.uuid}
      ItemSeparatorComponent={ItemSeparator}
      renderItem={renderItem}
      refreshControl={
        pullToRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
      {...props}
    ></FlatList>
  );
};
