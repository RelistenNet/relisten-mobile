import { usePlayerBottomScrollViewProps } from '@/relisten/player/ui/player_bar_layout';
import { FlatList, FlatListProps, ListRenderItem, RefreshControl } from 'react-native';
import { ItemSeparator } from './item_separator';
import { useRefreshContext } from './refresh_context';

function catalogItemKey(item: { uuid: string } | { id: string }) {
  return 'uuid' in item ? item.uuid : item.id;
}

export const RelistenFlatList = <T extends { uuid: string } | { id: string }>({
  data,
  renderItem,
  pullToRefresh = false,
  keyExtractor,
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

  return (
    <FlatList
      {...props}
      data={data}
      keyExtractor={keyExtractor ?? catalogItemKey}
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
