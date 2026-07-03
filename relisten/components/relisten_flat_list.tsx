import { FlatList, ListRenderItem, RefreshControl } from 'react-native';
import { FlatListProps } from 'react-native/Libraries/Lists/FlatList';
import { ItemSeparator } from './item_separator';
import { useRefreshContext } from './refresh_context';
import { usePlayerBottomScrollViewProps } from '@/relisten/player/ui/player_bar_layout';

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
  const playerBottomScrollViewProps = usePlayerBottomScrollViewProps({
    contentInsetAdjustmentBehavior: props.contentInsetAdjustmentBehavior,
    contentContainerStyle: props.contentContainerStyle,
    scrollIndicatorInsets: props.scrollIndicatorInsets,
  });
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
      {...props}
      data={data}
      keyExtractor={(item) => item.uuid}
      ItemSeparatorComponent={ItemSeparator}
      renderItem={renderItem}
      refreshControl={
        pullToRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={() => onRefresh(true)} />
        ) : undefined
      }
      contentInsetAdjustmentBehavior={playerBottomScrollViewProps.contentInsetAdjustmentBehavior}
      contentContainerStyle={playerBottomScrollViewProps.contentContainerStyle}
      scrollIndicatorInsets={playerBottomScrollViewProps.scrollIndicatorInsets}
    ></FlatList>
  );
};
