import { FlatList, ListRenderItem, RefreshControl } from 'react-native';
import { FlatListProps } from 'react-native/Libraries/Lists/FlatList';
import { ItemSeparator } from './item_separator';
import { useRefreshContext } from './refresh_context';
import { usePlayerBottomScrollInset } from '@/relisten/player/ui/player_bottom_bar';

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
  const bottomInset = usePlayerBottomScrollInset();
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
      contentContainerStyle={
        bottomInset > 0
          ? [props.contentContainerStyle, { paddingBottom: bottomInset }]
          : props.contentContainerStyle
      }
      scrollIndicatorInsets={
        bottomInset > 0
          ? {
              ...props.scrollIndicatorInsets,
              bottom: Math.max(props.scrollIndicatorInsets?.bottom ?? 0, bottomInset),
            }
          : props.scrollIndicatorInsets
      }
    ></FlatList>
  );
};
