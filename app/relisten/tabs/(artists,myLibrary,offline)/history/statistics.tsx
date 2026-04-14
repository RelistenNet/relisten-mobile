import {
  useListeningTimeByArtist,
  useTotalListeningTime,
} from '@/relisten/realm/models/history/playback_history_entry_repo';
import { RelistenText } from '@/relisten/components/relisten_text';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { useNavigation } from '@react-navigation/native';
import { type ParamListBase } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';

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

function FormattedListeningTime({ totalSeconds }: { totalSeconds: number }) {
  if (totalSeconds >= 86400) {
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return (
      <RelistenText className="text-center text-5xl font-bold text-white">
        {days}
        <RelistenText className="text-gray-300 text-3xl">d</RelistenText> {hours}
        <RelistenText className="text-gray-300 text-3xl">h</RelistenText> {minutes}
        <RelistenText className="text-gray-300 text-3xl">m</RelistenText>
      </RelistenText>
    );
  }
  return (
    <RelistenText className="text-center text-5xl font-bold text-white">
      {formatListeningTime(totalSeconds)}
    </RelistenText>
  );
}

function StatisticsHeader({ totalSeconds }: { totalSeconds: number }) {
  return (
    <View className="flex w-full flex-col items-center gap-1 py-2 pb-8">
      <RelistenText
        className="w-full text-center text-4xl font-bold text-white pb-4"
        selectable={false}
      >
        My Statistics
      </RelistenText>
      <View>
        <RelistenText className="text-xl text-center italic text-gray-400">
          Total Listening Time
        </RelistenText>
        <FormattedListeningTime totalSeconds={totalSeconds} />
      </View>
    </View>
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
    <DisappearingHeaderScreen ScrollableComponent={ScrollView}>
      <StatisticsHeader totalSeconds={totalListeningTimeSeconds} />

      {artistBreakdown.length > 0 && (
        <View className="mx-4 mb-4">
          <RelistenText className="mb-2 text-sm font-semibold uppercase tracking-widest text-gray-400">
            By Artist
          </RelistenText>
          <View className="rounded-lg bg-relisten-blue-900">
            {artistBreakdown.map((item) => (
              <View key={item.artistUuid}>
                <View className="flex-row items-center justify-between px-4 py-3">
                  <RelistenText className="flex-1 text-base text-white" numberOfLines={1}>
                    {item.artistName}
                  </RelistenText>
                  <RelistenText className="text-md text-white">
                    {formatListeningTime(item.totalSeconds)}
                  </RelistenText>
                </View>
                {item.byYear.map((yearEntry) => (
                  <View
                    key={yearEntry.year}
                    className="flex-row items-center justify-between py-2 pl-8 pr-4"
                  >
                    <RelistenText className="text-sm text-gray-400">{yearEntry.year}</RelistenText>
                    <RelistenText className="text-sm text-gray-400">
                      {formatListeningTime(yearEntry.totalSeconds)}
                    </RelistenText>
                  </View>
                ))}
                <ItemSeparator />
              </View>
            ))}
          </View>
        </View>
      )}
    </DisappearingHeaderScreen>
  );
}
