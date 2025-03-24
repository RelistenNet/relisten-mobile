import { RelistenText } from '@/relisten/components/relisten_text';
import { ShowCard } from '@/relisten/components/show_card';
import { Artist } from '@/relisten/realm/models/artist';
import { useTodayShows } from '@/relisten/realm/models/shows/today_shows_repo';
import { realm } from '@/relisten/realm/schema';
import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import * as R from 'remeda';
import { ScrollScreen } from '@/relisten/components/screens/ScrollScreen';
import { List as ListContentLoader } from 'react-content-loader/native';
import { RelistenBlue } from '@/relisten/relisten_blue';

export default function Page() {
  const { data, isNetworkLoading } = useTodayShows();
  const groupedShows = useMemo(() => {
    const groupedByArtistUuid = R.groupBy([...data], (item) => item.artistUuid);

    const grouped = Object.entries(groupedByArtistUuid).map(([artistUuid, shows]) => {
      const artist = realm?.objectForPrimaryKey('Artist', artistUuid) as Artist;

      return { artist, shows };
    });

    grouped.sort((a, b) => {
      return a.artist.name.localeCompare(b.artist.name);
    });

    return grouped;
  }, [data]);

  if (isNetworkLoading && !data.length) {
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
    <ScrollScreen>
      <ScrollView className="pt-2">
        {groupedShows.map(({ artist, shows }) => (
          <View key={artist?.uuid}>
            <RelistenText cn="ml-2 text-xl font-bold px-2">{artist?.name}</RelistenText>
            <ScrollView horizontal className="px-2 pb-4 pr-8 pt-2">
              {shows.map((show) => (
                <ShowCard
                  show={show}
                  key={show.uuid}
                  root="artists"
                  className="h-full w-[168px]"
                  showArtist={false}
                />
              ))}
            </ScrollView>
          </View>
        ))}
      </ScrollView>
    </ScrollScreen>
  );
}
