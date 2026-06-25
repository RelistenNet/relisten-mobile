import { Stack, useLocalSearchParams } from 'expo-router';
import { RelistenText } from '@/relisten/components/relisten_text';
import { View } from 'react-native';
import { List as ListContentLoader } from 'react-content-loader/native';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { RelistenFlatList } from '@/relisten/components/relisten_flat_list';
import { SourceReview } from '@/relisten/api/models/source';
import { useSourceReviews } from '@/relisten/realm/models/source_repo';
import dayjs from 'dayjs';
import { memo } from '@/relisten/util/memo';
import { ScrollScreen } from '@/relisten/components/screens/ScrollScreen';

export default function Page() {
  const { sourceUuid } = useLocalSearchParams();
  const { isNetworkLoading, data } = useSourceReviews(sourceUuid as string);
  const title = data ? `${data.length} Reviews` : 'Reviews';

  if (isNetworkLoading || !data) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <View className="w-full p-4">
          <ListContentLoader
            backgroundColor={RelistenBlue[800]}
            foregroundColor={RelistenBlue[700]}
          />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollScreen>
        <RelistenFlatList
          data={data}
          renderItem={({ item }) => <ReviewItem review={item} />}
          className="w-full flex-1"
        />
      </ScrollScreen>
    </>
  );
}

const ReviewItem = memo(({ review }: { review: SourceReview }) => {
  return (
    <View className="p-4">
      {(review.rating || review.title) && (
        <View className="flex-row items-start justify-between gap-4 pb-1">
          {review.title && (
            <RelistenText className="min-w-0 flex-1 text-xl font-semibold">
              {review.title.trim()}
            </RelistenText>
          )}
          <RelistenText className="shrink-0" selectable={false}>
            {review.rating ? `${review.rating}★` : ''}
          </RelistenText>
        </View>
      )}
      <View className="flex-row items-start justify-between gap-4 pb-2">
        {review.author && (
          <RelistenText className="min-w-0 flex-1 italic">{review.author.trim()}</RelistenText>
        )}
        <RelistenText className="shrink-0 text-gray-400" selectable={false}>
          {dayjs(review.updated_at).format('LL')}
        </RelistenText>
      </View>
      <RelistenText>{review.review.trim()}</RelistenText>
    </View>
  );
});
