import { FlatList, ListRenderItem, RefreshControl, View } from 'react-native';
import { useRefreshContext } from './refresh_context';
import { ItemSeparator } from './item_separator';
import { FlatListProps } from 'react-native/Libraries/Lists/FlatList';
import { List as ListContentLoader } from 'react-content-loader/native';
import { RelistenBlue } from '../relisten_blue';
import { useRelistenPlayerBottomBarContext } from '@/relisten/player/ui/player_bottom_bar';

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
        pullToRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
      contentContainerStyle={{ marginBottom: playerBottomBarHeight }}
      {...props}
    ></FlatList>
  );
};
