import { FlashList, FlashListProps, ListRenderItem } from '@shopify/flash-list';
import { ReactElement, useMemo } from 'react';
import { List as ListContentLoader } from 'react-content-loader/native';
import { RefreshControl, View } from 'react-native';
import { RelistenObject } from '../api/models/relisten';
import { RelistenBlue } from '../relisten_blue';
import { ItemSeparator } from './item_separator';
import { useRefreshContext } from './refresh_context';
import { SectionHeader } from './section_header';
import { RelistenErrors } from '@/relisten/components/relisten_errors';

export interface RelistenSection<T> {
  sectionTitle?: string;
  data: ReadonlyArray<T>;
}

export type RelistenSectionHeader = {
  sectionTitle: string;
  metadata?: number;
  headerComponent?: ReactElement;
};

export type RelistenSectionData<T> = ReadonlyArray<RelistenSection<T>>;

export type FlashListRelistenRawItem<T> = { rawItem: T; keyPrefix?: string };
export type FlashListRelistenData<T> = ReadonlyArray<
  FlashListRelistenRawItem<T> | RelistenSectionHeader
>;

export type RelistenSectionListProps<T> = Omit<
  FlashListProps<FlashListRelistenRawItem<T> | RelistenSectionHeader>,
  'data' | 'renderItem'
> & {
  data: RelistenSectionData<T>;
  renderItem: ListRenderItem<T>;
  renderSectionHeader?: (item: RelistenSectionHeader) => ReactElement;
  pullToRefresh?: boolean;
};

export const FAKE_SENTINEL = '__FAKE__';
export const LOADING_SENTINEL = '__LOADING__';
export const ERROR_SENTINEL = '__ERROR__';

export const RelistenSectionList = <T extends RelistenObject>({
  data,
  renderItem,
  pullToRefresh = false,
  renderSectionHeader,
  ListHeaderComponent,
  ...props
}: RelistenSectionListProps<T>) => {
  const { onRefresh, refreshing, errors } = useRefreshContext(/* refreshRequired= */ false);
  // you might ask why we need this
  // and you'd be correct
  // ..
  // it's to fix a flashlist bug: https://github.com/Shopify/flash-list/issues/727
  const internalData = useMemo<FlashListRelistenData<T>>(() => {
    const internalData = [];

    if (ListHeaderComponent) {
      internalData.push({ sectionTitle: 'ListHeaderComponent' });
    }

    if (refreshing) {
      internalData.push({ sectionTitle: FAKE_SENTINEL });
      internalData.push({ sectionTitle: LOADING_SENTINEL });
    } else if (errors && errors.length && !(data && data.length > 1 && data[1].data.length > 0)) {
      internalData.push({ sectionTitle: FAKE_SENTINEL });
      internalData.push({ sectionTitle: ERROR_SENTINEL });

      // always allow pull to refresh if we got an error. refreshing might fix it.
      pullToRefresh = true;
    } else {
      internalData.push(
        ...data.flatMap((section) => {
          if (section.sectionTitle) {
            return [
              { sectionTitle: section.sectionTitle, ...section },
              ...section.data.map((rawItem) => ({ rawItem, keyPrefix: section.sectionTitle })),
            ];
          } else {
            return [...section.data.map((rawItem) => ({ rawItem, keyPrefix: undefined }))];
          }
        })
      );
    }
    return internalData;
  }, [data, refreshing, errors]);

  // TODO: fix in core - or migrate back to SectionList
  // reference: https://discord.com/channels/395033814008594436/466023446590259220/1186791164423176275
  // const stickyHeaderIndices = useMemo(
  //   () =>
  //     internalData
  //       .map((item, index) => {
  //         if ('sectionTitle' in item) return index;
  //       })
  //       .filter((x) => typeof x !== 'undefined') as number[],
  //   [internalData]
  // );

  return (
    <FlashList
      data={internalData}
      keyboardShouldPersistTaps="handled"
      ItemSeparatorComponent={ItemSeparator}
      getItemType={(item) => {
        // To achieve better performance, specify the type based on the item
        return 'rawItem' in item ? 'row' : 'sectionHeader';
      }}
      // stickyHeaderIndices={stickyHeaderIndices}
      keyExtractor={(item, index) => {
        if ('sectionTitle' in item) {
          return [item.sectionTitle, index].join(':');
        } else if ('uuid' in item.rawItem) {
          if ('keyPrefix' in item) {
            // keyPrefix is for situations where we have 2 rows in the same list
            // that all share the same `uuid`
            // a good example is on the Artists list, where Grateful Dead may show up under
            // 'featured' and 'default' (and even 'favorites' too!)
            // so we need to ensure each row has its own unique key despite all being "Grateful Dead"
            return [item.keyPrefix, item.rawItem.uuid].join(':');
          }
        }

        throw new Error('missing key');
      }}
      renderItem={(props) => {
        if (!props?.item) return null;

        if ('sectionTitle' in props.item) {
          // see comment above
          if (props.item.sectionTitle === 'ListHeaderComponent') {
            return ListHeaderComponent as ReactElement;
          }
          if (props.item.sectionTitle === FAKE_SENTINEL) {
            return null;
          }
          if (props.item.sectionTitle === LOADING_SENTINEL) {
            return (
              <View className="w-full p-4">
                <ListContentLoader
                  backgroundColor={RelistenBlue[800]}
                  foregroundColor={RelistenBlue[700]}
                />
              </View>
            );
          }
          if (props.item.sectionTitle === ERROR_SENTINEL) {
            return (
              <View className="w-full p-4">
                <RelistenErrors errors={errors} />
              </View>
            );
          }
          if (renderSectionHeader) {
            return renderSectionHeader(props.item);
          }

          return <SectionHeader title={props.item.sectionTitle} />;
        } else if (renderItem && 'rawItem' in props.item && 'uuid' in props.item.rawItem) {
          return renderItem({
            ...props,
            item: props.item.rawItem,
          });
        }

        return null;
      }}
      refreshing={refreshing}
      refreshControl={
        pullToRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={() => onRefresh(true)} />
        ) : undefined
      }
      // contentContainerStyle={{ paddingBottom: playerBottomBarHeight }}
      {...props}
    />
  );
};
