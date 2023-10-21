import {
  Animated,
  RefreshControl,
  SectionListData,
  SectionListRenderItem,
  View,
} from 'react-native';
import { SectionHeader } from './section_header';
import { ItemSeparator } from './item_separator';
import { useRefreshContext } from './refresh_context';
import { SectionListProps } from 'react-native/Libraries/Lists/SectionList';
import { List as ListContentLoader } from 'react-content-loader/native';
import { RelistenObject } from '../api/models/relisten';
import { RelistenBlue } from '../relisten_blue';
import { useRelistenPlayerBottomBarContext } from '@/relisten/player/ui/player_bottom_bar';

export type RelistenSectionListData<T extends RelistenObject> = SectionListData<
  T,
  { title: string; data: ReadonlyArray<T> }
>;

export type RelistenSectionListProps<T extends RelistenObject> = {
  sections: ReadonlyArray<RelistenSectionListData<T>>;
  renderItem: SectionListRenderItem<T, { title: string; data: Readonly<T> }>;
  pullToRefresh?: boolean;
} & SectionListProps<T, { title: string; data: ReadonlyArray<T> }>;

export const RelistenSectionList = <T extends RelistenObject>({
  sections,
  renderItem,
  pullToRefresh = false,
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

  return (
    <Animated.SectionList
      sections={sections as any}
      keyExtractor={(item) => item.uuid}
      renderSectionHeader={({ section: { title } }) => {
        return <SectionHeader title={title} />;
      }}
      ItemSeparatorComponent={ItemSeparator}
      renderItem={renderItem}
      refreshControl={
        pullToRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
      contentContainerStyle={{ marginBottom: playerBottomBarHeight }}
      {...props}
    ></Animated.SectionList>
  );
};
