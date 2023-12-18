/* eslint-disable react/prop-types */
import { FlashList, FlashListProps, ListRenderItem, ListRenderItemInfo } from '@shopify/flash-list';
import { useMemo } from 'react';
import { List as ListContentLoader } from 'react-content-loader/native';
import { RefreshControl, View } from 'react-native';
import { RelistenObject } from '../api/models/relisten';
import { RelistenBlue } from '../relisten_blue';
import { ItemSeparator } from './item_separator';
import { useRefreshContext } from './refresh_context';
import { SectionHeader } from './section_header';
import { useRelistenPlayerBottomBarContext } from '../player/ui/player_bottom_bar';

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
  ListHeaderComponent,
  ...props
}: RelistenSectionListProps<T>) => {
  const { onRefresh, refreshing } = useRefreshContext();
  const { playerBottomBarHeight } = useRelistenPlayerBottomBarContext();

  // you might ask why we need this
  // and you'd be correct
  // ..
  // it's to fix a flashlist bug: https://github.com/Shopify/flash-list/issues/727
  const internalData = useMemo(() => {
    let internalData: (T | RelistenSectionHeader)[] = [];
    if (ListHeaderComponent) {
      internalData = [{ sectionTitle: 'ListHeaderComponent' }, ...data];
    } else {
      internalData = [...data];
    }
    if (refreshing) {
      internalData.push({ sectionTitle: 'LOADING' });
    }
    return internalData;
  }, [data, refreshing]);

  const stickyHeaderIndices = useMemo(
    () =>
      internalData
        .map((item, index) => {
          if ('sectionTitle' in item) return index;
        })
        .filter((x) => typeof x !== 'undefined') as number[],
    [internalData]
  );

  return (
    <FlashList
      data={internalData}
      estimatedItemSize={56}
      ItemSeparatorComponent={ItemSeparator}
      getItemType={(item) => {
        // To achieve better performance, specify the type based on the item
        return 'uuid' in item ? 'row' : 'sectionHeader';
      }}
      stickyHeaderIndices={stickyHeaderIndices}
      renderItem={(props) => {
        if (!props?.item) return null;

        if ('sectionTitle' in props.item) {
          // see comment above
          if (props.item.sectionTitle === 'ListHeaderComponent') {
            return ListHeaderComponent as JSX.Element;
          }
          if (props.item.sectionTitle === 'LOADING') {
            return (
              <View className="w-full p-4">
                <ListContentLoader
                  backgroundColor={RelistenBlue[800]}
                  foregroundColor={RelistenBlue[700]}
                />
              </View>
            );
          }
          if (renderSectionHeader) {
            return renderSectionHeader(props.item);
          }

          return <SectionHeader title={props.item.sectionTitle} />;
        } else if (renderItem && 'uuid' in props.item) {
          return renderItem(props as ListRenderItemInfo<T>);
        }

        return null;
      }}
      refreshing={refreshing}
      refreshControl={
        pullToRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
      contentContainerStyle={{ paddingBottom: playerBottomBarHeight }}
      {...props}
    />
  );
};
