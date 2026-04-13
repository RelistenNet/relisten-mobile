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

function FormattedListeningTime({
  totalSeconds,
  isTotal = false,
}: {
  totalSeconds: number;
  isTotal?: boolean;
}) {
  const totalTimeStyle = 'text-center text-5xl font-bold text-white';
  const artistTimeStyle = 'font-semibold text-gray-300';
  if (totalSeconds >= 86400) {
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const dim = 'text-gray-300';
    return (
      <RelistenText className={isTotal ? totalTimeStyle : artistTimeStyle}>
        {days}
        <RelistenText className={dim}>d</RelistenText> {hours}
        <RelistenText className={dim}>h</RelistenText> {minutes}
        <RelistenText className={dim}>m</RelistenText>
      </RelistenText>
    );
  }
  return (
    <RelistenText className={isTotal ? totalTimeStyle : artistTimeStyle}>
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
          <FormattedListeningTime totalSeconds={totalListeningTimeSeconds} isTotal />
        </View>

        {artistBreakdown.length > 0 && (
          <View className="mx-4 mb-4">
            <RelistenText className="mb-2 text-sm font-semibold uppercase tracking-widest text-gray-400">
              By Artist
            </RelistenText>
            <View className="rounded-lg bg-relisten-blue-800">
              {artistBreakdown.map((item, index) => (
                <View
                  key={item.artistUuid}
                  className={`flex-row items-center justify-between px-4 py-3 ${
                    index < artistBreakdown.length - 1 ? 'border-b border-relisten-blue-700' : ''
                  }`}
                >
                  <RelistenText className="flex-1 text-base text-white" numberOfLines={1}>
                    {item.artistName}
                  </RelistenText>
                  <FormattedListeningTime totalSeconds={item.totalSeconds} />
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </ScrollScreen>
  );
}
