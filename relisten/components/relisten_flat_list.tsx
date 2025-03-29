import { useRelistenPlayerBottomBarContext } from '@/relisten/player/ui/player_bottom_bar';
import { FlatList, ListRenderItem, RefreshControl } from 'react-native';
import { FlatListProps } from 'react-native/Libraries/Lists/FlatList';
import { ItemSeparator } from './item_separator';
import { useRefreshContext } from './refresh_context';

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
  const { onRefresh, refreshing } = useRefreshContext(pullToRefresh || false);
  const { playerBottomBarHeight } = useRelistenPlayerBottomBarContext();

  // if (refreshing) {
  //   return (
  //     <View className="w-full p-4">
  //       <ListContentLoader
  //         backgroundColor={RelistenBlue[800]}
  //         foregroundColor={RelistenBlue[700]}
  //       />
  //     </View>
  //   );
  // }

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.uuid}
      ItemSeparatorComponent={ItemSeparator}
      renderItem={renderItem}
      refreshControl={
        pullToRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={() => onRefresh(true)} />
        ) : undefined
      }
      // contentContainerStyle={{ marginBottom: playerBottomBarHeight }}
      {...props}
    ></FlatList>
  );
};
