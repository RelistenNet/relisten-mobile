import {
  useListeningTimeByArtist,
  useTotalListeningTime,
} from '@/relisten/realm/models/history/playback_history_entry_repo';
import { RelistenText } from '@/relisten/components/relisten_text';
import { ScrollScreen } from '@/relisten/components/screens/ScrollScreen';
import { useNavigation } from '@react-navigation/native';
import { type ParamListBase } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { ItemSeparator } from '@/relisten/components/item_separator';

function formatListeningTime(totalSeconds: number): string {
  if (totalSeconds >= 86400) {
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

type ListeningTimeVariant = 'total' | 'artist' | 'year';

function FormattedListeningTime({
  totalSeconds,
  variant = 'artist',
}: {
  totalSeconds: number;
  variant?: ListeningTimeVariant;
}) {
  if (totalSeconds >= 86400) {
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (variant === 'total') {
      return (
        <RelistenText className="text-center text-5xl font-bold text-white">
          {days}
          <RelistenText className="text-gray-300">d</RelistenText> {hours}
          <RelistenText className="text-gray-300">h</RelistenText> {minutes}
          <RelistenText className="text-gray-300">m</RelistenText>
        </RelistenText>
      );
    }
    if (variant === 'year') {
      return (
        <RelistenText className="text-sm text-gray-400">
          {days}
          <RelistenText className="text-gray-500">d</RelistenText> {hours}
          <RelistenText className="text-gray-500">h</RelistenText> {minutes}
          <RelistenText className="text-gray-500">m</RelistenText>
        </RelistenText>
      );
    }
    return (
      <RelistenText className="font-semibold text-gray-300">
        {days}
        <RelistenText className="text-gray-400">d</RelistenText> {hours}
        <RelistenText className="text-gray-400">h</RelistenText> {minutes}
        <RelistenText className="text-gray-400">m</RelistenText>
      </RelistenText>
    );
  }
  if (variant === 'total') {
    return (
      <RelistenText className="text-center text-5xl font-bold text-white">
        {formatListeningTime(totalSeconds)}
      </RelistenText>
    );
  }
  if (variant === 'year') {
    return (
      <RelistenText className="text-sm text-gray-400">
        {formatListeningTime(totalSeconds)}
      </RelistenText>
    );
  }
  return (
    <RelistenText className="font-semibold text-gray-300">
      {formatListeningTime(totalSeconds)}
    </RelistenText>
  );
}

export default function StatisticsPage() {
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const totalListeningTimeSeconds = useTotalListeningTime();
  const artistBreakdown = useListeningTimeByArtist();

  useEffect(() => {
    navigation.setOptions({ title: 'My Statistics' });
  }, [navigation]);

  return (
    <ScrollScreen>
      <ScrollView>
        <View className="m-4 rounded-lg bg-relisten-blue-700 p-6">
          <RelistenText className="mb-2 text-center text-md font-semibold uppercase tracking-widest text-gray-300">
            Total Listening Time
          </RelistenText>
          <FormattedListeningTime totalSeconds={totalListeningTimeSeconds} variant="total" />
        </View>

        {artistBreakdown.length > 0 && (
          <View className="mx-4 mb-4">
            <RelistenText className="mb-2 text-sm font-semibold uppercase tracking-widest text-gray-400">
              By Artist
            </RelistenText>
            <View className="rounded-lg bg-relisten-blue-900">
              {artistBreakdown.map((item, index) => (
                <View key={item.artistUuid}>
                  <View className={`flex-row items-center justify-between px-4 py-3`}>
                    <RelistenText className="flex-1 text-base text-white" numberOfLines={1}>
                      {item.artistName}
                    </RelistenText>
                    <FormattedListeningTime totalSeconds={item.totalSeconds} />
                  </View>
                  {item.byYear.map((yearEntry) => (
                    <View
                      key={yearEntry.year}
                      className={`flex-row items-center justify-between py-2 pl-8 pr-4`}
                    >
                      <RelistenText className="text-sm text-gray-400">
                        {yearEntry.year}
                      </RelistenText>
                      <FormattedListeningTime
                        totalSeconds={yearEntry.totalSeconds}
                        variant="year"
                      />
                    </View>
                  ))}
                  <ItemSeparator />
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </ScrollScreen>
  );
}
