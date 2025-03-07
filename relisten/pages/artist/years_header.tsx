import React from 'react';
import { Artist } from '@/relisten/realm/models/artist';
import { useRelistenApi } from '@/relisten/api/context';
import { useGroupSegment, useIsOfflineTab, useRoute } from '@/relisten/util/routes';
import { useRouter } from 'expo-router';
import { useArtistMetadata } from '@/relisten/realm/models/artist_repo';
import { View } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';
import Plur from '@/relisten/components/plur';
import { ArtistActionButtons } from '@/relisten/pages/artist/artist_action_buttons';
import { ArtistShowsOnThisDayTray } from '@/relisten/pages/artist/artist_shows_on_this_day_tray';

export const YearsHeader: React.FC<{ artist: Artist | null }> = ({ artist }) => {
  const { apiClient } = useRelistenApi();
  const currentRoute = useRoute();
  const router = useRouter();
  const isOfflineTab = useIsOfflineTab();
  const groupSegment = useGroupSegment(true);
  const metadata = useArtistMetadata(artist);

  if (!artist) {
    return null;
  }

  const goToRandomShow = async () => {
    const randomShow = await apiClient.randomShow(artist.uuid);

    if (randomShow?.data?.uuid) {
      router.push({
        pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/show/[showUuid]/source/[sourceUuid]/`,
        params: {
          artistUuid: artist.uuid,
          showUuid: randomShow!.data!.uuid,
          sourceUuid: 'initial',
        },
      });
    }
  };

  return (
    <>
      <View className="flex w-full items-center pb-1">
        <View className="w-full px-4 pb-2">
          <RelistenText
            className="w-full py-2 text-center text-4xl font-bold text-white"
            selectable={false}
          >
            {artist.name}
          </RelistenText>

          <RelistenText className="text-l w-full pb-2 text-center italic text-gray-400">
            {/* <Plur word="year" count={years.length} /> &middot;&nbsp; */}
            <Plur word="show" count={metadata.shows} /> &middot;&nbsp;
            <Plur word="tape" count={metadata.sources} />
          </RelistenText>
        </View>
        {!isOfflineTab && (
          <ArtistActionButtons
            currentRoute={currentRoute}
            artist={artist}
            goToRandomShow={goToRandomShow}
          />
        )}
      </View>
      {!isOfflineTab && <ArtistShowsOnThisDayTray artist={artist} />}
    </>
  );
};
