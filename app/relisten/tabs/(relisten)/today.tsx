import { SafeAreaView } from 'react-native-safe-area-context';

import Flex from '@/relisten/components/flex';
import { RelistenText } from '@/relisten/components/relisten_text';
import { Artist } from '@/relisten/realm/models/artist';
import { Show } from '@/relisten/realm/models/show';
import { useTodayShows } from '@/relisten/realm/models/shows/today_shows_repo';
import { realm } from '@/relisten/realm/schema';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import * as R from 'remeda';
import { ShowCard } from '@/relisten/components/show_card';

export default function Page() {
  const { data, isNetworkLoading } = useTodayShows();
  const groupedShows = useMemo(() => {
    const groupedByArtistUuid = R.groupBy([...data], (item) => item.artistUuid);

    return Object.entries(groupedByArtistUuid).map(([artistUuid, shows]) => {
      const artist = realm?.objectForPrimaryKey('Artist', artistUuid) as Artist;

      return { artist, shows };
    });
  }, [data]);

  if (isNetworkLoading && !data.length) {
    return (
      <SafeAreaView>
        <RelistenText>Loading...</RelistenText>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView>
      <ScrollView>
        <View className="space-y-2">
          {groupedShows.map(({ artist, shows }) => (
            <View key={artist?.uuid} className="space-y-2">
              <RelistenText cn="ml-2 text-xl font-bold">{artist?.name}</RelistenText>
              <ScrollView horizontal className="pb-2 pl-2">
                {shows.map((show) => (
                  <ShowCard show={show} key={show.uuid} root="artists" cn="w-[144px] h-full" />
                ))}
              </ScrollView>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
