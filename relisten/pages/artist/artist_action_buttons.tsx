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
          <RelistenButton className="shrink basis-1/3" textClassName="text-l">
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
          <RelistenButton className="shrink basis-1/3" textClassName="text-l">
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
          <RelistenButton className="shrink basis-1/3" textClassName="text-l">
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
          <RelistenButton className="shrink basis-1/3" textClassName="text-l">
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
          onPress={goToRandomShow}
        >
          Random
        </RelistenButton>
      </View>
    </>
  );
}
