import { Artist } from '@/relisten/realm/models/artist';
import { View } from 'react-native';
import { Link } from 'expo-router';
import { RelistenButton } from '@/relisten/components/relisten_button';
import React from 'react';

export function ArtistActionButtons({
  currentRoute,
  artist,
  goToRandomShow,
}: {
  currentRoute: string;
  artist: Artist;
  goToRandomShow: () => Promise<void>;
}) {
  return (
    <>
      <View className="w-full flex-row px-4 pb-4" style={{ gap: 16 }}>
        <Link
          href={{
            pathname: currentRoute + '/venues',
            params: {
              artistUuid: artist.uuid,
            },
          }}
          asChild
        >
          <RelistenButton
            className="shrink basis-1/3"
            textClassName="text-l"
            disabled={!(artist.features().per_source_venues || artist.features().per_show_venues)}
            disabledPopoverText="Venues feature not available for this artist"
          >
            Venues
          </RelistenButton>
        </Link>
        <Link
          href={{
            pathname: currentRoute + '/tours',
            params: {
              artistUuid: artist.uuid,
            },
          }}
          asChild
        >
          <RelistenButton
            className="shrink basis-1/3"
            textClassName="text-l"
            disabled={!artist.features().tours}
            disabledPopoverText="Tours feature not available for this artist"
          >
            Tours
          </RelistenButton>
        </Link>
        <Link
          href={{
            pathname: currentRoute + '/songs',
            params: {
              artistUuid: artist.uuid,
            },
          }}
          asChild
        >
          <RelistenButton
            className="shrink basis-1/3"
            textClassName="text-l"
            disabled={!artist.features().songs}
            disabledPopoverText="Songs feature not available for this artist"
          >
            Songs
          </RelistenButton>
        </Link>
      </View>
      <View className="w-full flex-row px-4 pb-4" style={{ gap: 16 }}>
        <Link
          href={{
            pathname: currentRoute + '/rated',
            params: {
              artistUuid: artist.uuid,
            },
          }}
          asChild
        >
          <RelistenButton
            className="shrink basis-1/3"
            textClassName="text-l"
            disabled={!artist.features().ratings}
            disabledPopoverText="Top Rated feature not available for this artist"
          >
            Top Rated
          </RelistenButton>
        </Link>
        <Link
          href={{
            pathname: currentRoute + '/recent',
            params: {
              artistUuid: artist.uuid,
            },
          }}
          asChild
        >
          <RelistenButton className="shrink basis-1/3" textClassName="text-l">
            Recent
          </RelistenButton>
        </Link>
        <RelistenButton
          className="shrink basis-1/3"
          textClassName="text-l"
          automaticLoadingIndicator
          asyncOnPress={goToRandomShow}
        >
          Random
        </RelistenButton>
      </View>
    </>
  );
}
