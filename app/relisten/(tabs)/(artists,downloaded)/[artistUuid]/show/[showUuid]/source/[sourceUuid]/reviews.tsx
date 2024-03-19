import { useActionSheet } from '@expo/react-native-action-sheet';
import { useRealm } from '@/relisten/realm/schema';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { useFullShow } from '@/relisten/realm/models/show_repo';
import { useArtist } from '@/relisten/realm/models/artist_repo';
import React, { useEffect } from 'react';
import { RelistenText } from '@/relisten/components/relisten_text';
import { useRelistenApi } from '@/relisten/api/context';
import { useNetworkOnlyResults } from '@/relisten/realm/network_backed_behavior_hooks';
import { View } from 'react-native';
import { List as ListContentLoader } from 'react-content-loader/native';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { RelistenFlatList } from '@/relisten/components/relisten_flat_list';
import { SourceReview } from '@/relisten/api/models/source';
import { useSourceReviews } from '@/relisten/realm/models/source_repo';
import Flex from '@/relisten/components/flex';
import dayjs from 'dayjs';
import { memo } from '@/relisten/util/memo';

export default function Page() {
  const navigation = useNavigation();
  const { sourceUuid } = useLocalSearchParams();

  const { isNetworkLoading, data } = useSourceReviews(sourceUuid as string);

  useEffect(() => {
    navigation.setOptions({ title: data ? `${data.length} Reviews` : 'Reviews' });
  }, [data]);

  if (isNetworkLoading || !data) {
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
    <RelistenFlatList
      data={data}
      renderItem={({ item }) => <ReviewItem review={item} />}
      className="w-full flex-1"
    />
  );
}

const ReviewItem = memo(({ review }: { review: SourceReview }) => {
  return (
    <Flex className="flex-1 flex-col p-4">
      {(review.rating || review.title) && (
        <Flex className="flex-1 flex-row items-center justify-between pb-1" style={{ gap: 16 }}>
          {review.title && (
            <RelistenText className="flex-shrink text-xl font-semibold">
              {review.title.trim()}
            </RelistenText>
          )}
          <RelistenText selectable={false}>{review.rating ? `${review.rating}★` : ''}</RelistenText>
        </Flex>
      )}
      <Flex className="flex-1 flex-row items-center justify-between pb-2" style={{ gap: 16 }}>
        {review.author && <RelistenText className="italic">{review.author.trim()}</RelistenText>}
        <RelistenText className="text-gray-400" selectable={false}>
          {dayjs(review.updated_at).format('LL')}
        </RelistenText>
      </Flex>
      <RelistenText>{review.review.trim()}</RelistenText>
    </Flex>
  );
});
