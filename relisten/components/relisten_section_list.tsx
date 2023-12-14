/* eslint-disable react/prop-types */
import { useRelistenPlayerBottomBarContext } from '@/relisten/player/ui/player_bottom_bar';
import { FlashList, FlashListProps, ListRenderItem, ListRenderItemInfo } from '@shopify/flash-list';
import { List as ListContentLoader } from 'react-content-loader/native';
import { RefreshControl, View } from 'react-native';
import { RelistenObject } from '../api/models/relisten';
import { RelistenBlue } from '../relisten_blue';
import { ItemSeparator } from './item_separator';
import { useRefreshContext } from './refresh_context';
import { SectionHeader } from './section_header';
import { useMemo } from 'react';

export type RelistenSectionHeader = { sectionTitle: string };
export type RelistenSectionListData<T extends RelistenObject> = T | RelistenSectionHeader;

export type RelistenSectionListProps<T extends RelistenObject> = Omit<
  FlashListProps<T | RelistenSectionHeader>,
  'data' | 'renderItem'
> & {
  data: ReadonlyArray<T | RelistenSectionHeader>;
  renderItem: ListRenderItem<T>;
  renderSectionHeader?: (item: RelistenSectionHeader) => JSX.Element;
  pullToRefresh?: boolean;
};

export const RelistenSectionList = <T extends RelistenObject>({
  data,
  renderItem,
  pullToRefresh = false,
  renderSectionHeader,
  ...props
}: RelistenSectionListProps<T>) => {
  const { onRefresh, refreshing } = useRefreshContext();
  const { playerBottomBarHeight } = useRelistenPlayerBottomBarContext();

  if (refreshing) {
    return (
      <View className="w-full p-4">
        <ListContentLoader
          backgroundColor={RelistenBlue[800]}
          foregroundColor={RelistenBlue[700]}
        />
      </View>
    );
  }
  const stickyHeaderIndices = useMemo(
    () =>
      data
        .map((item, index) => {
          if ('sectionTitle' in item) return index;
        })
        .filter((x) => typeof x !== 'undefined') as number[],
    [data]
  );

  return (
    <FlashList
      data={data}
      estimatedItemSize={56} // TODO: is this correct?
      ItemSeparatorComponent={ItemSeparator}
      getItemType={(item) => {
        // To achieve better performance, specify the type based on the item
        return 'uuid' in item ? 'row' : 'sectionHeader';
      }}
      stickyHeaderIndices={stickyHeaderIndices}
      renderItem={(props) => {
        if (!props?.item) return null;

        if ('sectionTitle' in props.item) {
          if (renderSectionHeader) {
            return renderSectionHeader(props.item);
          }

          return <SectionHeader title={props.item.sectionTitle} />;
        } else if (renderItem && 'uuid' in props.item) {
          return renderItem(props as ListRenderItemInfo<T>);
        }

        return null;
      }}
      refreshControl={
        pullToRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
      contentContainerStyle={{ paddingBottom: playerBottomBarHeight }}
      {...props}
    />
  );
};
