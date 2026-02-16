import React, { useMemo } from 'react';
import { Artist } from '@/relisten/realm/models/artist';
import { useRelistenApi } from '@/relisten/api/context';
import { useIsOfflineTab, useRoute } from '@/relisten/util/routes';
import { useArtistMetadata } from '@/relisten/realm/models/artist_repo';
import { View } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';
import Plur from '@/relisten/components/plur';
import { ArtistActionButtons } from '@/relisten/pages/artist/artist_action_buttons';
import { ArtistShowsOnThisDayTray } from '@/relisten/pages/artist/artist_shows_on_this_day_tray';
import { ArtistShowsByMomentumTray } from '@/relisten/pages/artist/artist_shows_by_momentum_tray';
import { usePushShowRespectingUserSettings } from '@/relisten/util/push_show';

export const YearsHeader: React.FC<{ artist: Artist | null }> = ({ artist }) => {
  const { apiClient } = useRelistenApi();
  const currentRoute = useRoute();
  const isOfflineTab = useIsOfflineTab();
  const metadata = useArtistMetadata(artist);
  const { pushShow } = usePushShowRespectingUserSettings();

  if (!artist) {
    return null;
  }

  const goToRandomShow = async () => {
    const randomShow = await apiClient.randomShow(artist.uuid);

    if (randomShow?.data?.uuid) {
      pushShow({ artist, showUuid: randomShow!.data!.uuid });
    }
  };

  const artistAsArray = useMemo(() => [artist], [artist]);

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
      {!isOfflineTab && <ArtistShowsOnThisDayTray artists={artistAsArray} />}
      {!isOfflineTab && <ArtistShowsByMomentumTray artists={artistAsArray} />}
    </>
  );
};
