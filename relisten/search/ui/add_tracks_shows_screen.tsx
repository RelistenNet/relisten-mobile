import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { decodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { RelistenText } from '@/relisten/components/relisten_text';
import type { NetworkBackedResults } from '@/relisten/realm/network_backed_results';
import type { Show } from '@/relisten/realm/models/show';
import { useArtistSongShows } from '@/relisten/realm/models/shows/song_shows_repo';
import {
  useArtistVenueShows,
  useGlobalVenueShows,
} from '@/relisten/realm/models/shows/venue_shows_repo';
import { useAddTracks } from './add_tracks_context';
import { OpenFullPageButton, SheetScrollAnchor } from './add_tracks_controls';
import { SearchResultRow } from './search_result_row';
import { describeLocalShow } from '../search_rows';

type ShowsParams =
  | { kind: 'venue'; venueId: string; artistUuid?: string }
  | { kind: 'song'; songId: string; artistUuid: string };

/** The route's params, as `addTracksTapTarget` pushes them. */
function parseShowsParams(params: Record<string, string | string[] | undefined>): ShowsParams {
  const one = (key: string) => {
    const value = params[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
  };

  const artistUuid = one('artistUuid');
  const songId = one('songId');
  if (one('kind') === 'song' && songId && artistUuid) {
    return { kind: 'song', songId, artistUuid };
  }
  return { kind: 'venue', venueId: one('venueId') ?? '', artistUuid };
}

/**
 * A venue's or a song's shows inside Add Tracks. Searching a venue's or a
 * song's name mixes places and versions, so this lists exactly that one's
 * shows. Each opens its setlist, focused on the song when there is one.
 */
export function AddTracksShowsScreen() {
  const params = parseShowsParams(useLocalSearchParams());

  if (params.kind === 'song') {
    return <SongShows artistUuid={params.artistUuid} songId={params.songId} />;
  }
  if (params.artistUuid) {
    return <ArtistVenueShows artistUuid={params.artistUuid} venueId={params.venueId} />;
  }
  return <SharedVenueShows venueId={params.venueId} />;
}

function SharedVenueShows({ venueId }: { venueId: string }) {
  const results = useGlobalVenueShows(venueId);
  const { tab } = useAddTracks();
  return (
    <ShowList
      title={results.data?.venue?.name ?? 'Venue'}
      shows={results.data?.shows}
      results={results}
      fullPage={{
        pathname: `/relisten/tabs/${tab}/venue/[venueId]/` as const,
        params: { venueId },
      }}
    />
  );
}

function ArtistVenueShows({ artistUuid, venueId }: { artistUuid: string; venueId: string }) {
  const results = useArtistVenueShows(artistUuid, venueId);
  const { tab } = useAddTracks();
  const venue = results.data.venue;
  return (
    <ShowList
      title={venue?.venue?.name ?? 'Venue'}
      shows={venue?.shows}
      results={results}
      fullPage={{
        pathname: `/relisten/tabs/${tab}/[artistUuid]/venue/[venueUuid]/` as const,
        params: {
          artistUuid,
          venueUuid: decodeUuidCatalogId(venueId, 'imported_venue'),
          venueKind: 'imported_venue',
        },
      }}
    />
  );
}

function SongShows({ artistUuid, songId }: { artistUuid: string; songId: string }) {
  const results = useArtistSongShows(artistUuid, songId);
  const { tab } = useAddTracks();
  const { song, shows } = results.data.song;
  return (
    <ShowList
      title={song?.name ?? 'Song'}
      shows={song ? shows : undefined}
      results={results}
      focusSongId={songId}
      fullPage={{
        pathname: `/relisten/tabs/${tab}/[artistUuid]/song/[songUuid]/` as const,
        params: { artistUuid, songUuid: songId },
      }}
    />
  );
}

/** Newest first, so recent shows at a busy venue are near the top. */
function ShowList({
  title,
  shows,
  results,
  focusSongId,
  fullPage,
}: {
  title: string;
  shows: Show[] | undefined;
  results: Pick<NetworkBackedResults<unknown>, 'isNetworkLoading' | 'errors'>;
  focusSongId?: string;
  fullPage: Href;
}) {
  const router = useRouter();
  const { playlistId } = useAddTracks();
  const sorted = useMemo(
    () => [...(shows ?? [])].sort((a, b) => b.date.getTime() - a.date.getTime()),
    [shows]
  );

  return (
    <View className="flex-1 bg-relisten-blue-900">
      <Stack.Screen
        options={{
          title,
          headerRight: () => <OpenFullPageButton href={fullPage} />,
        }}
      />
      <SheetScrollAnchor />
      {sorted.length === 0 ? (
        <View className="flex-1 items-center justify-center p-6">
          {results.errors?.length ? (
            <RelistenText className="text-center text-gray-300">
              These shows couldn’t load.
            </RelistenText>
          ) : (
            <ActivityIndicator color="white" />
          )}
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(show) => show.uuid}
          ItemSeparatorComponent={ItemSeparator}
          contentContainerStyle={{ paddingBottom: 96 }}
          // Content starts under the sheet's header; the inset clears it.
          contentInsetAdjustmentBehavior="automatic"
          renderItem={({ item: show }) => (
            <SearchResultRow
              view={describeLocalShow(show, show.hasSoundboardSource)}
              onPress={() =>
                router.push({
                  pathname: '/relisten/add-tracks/source',
                  params: {
                    playlistId,
                    showUuid: show.uuid,
                    sourceUuid: 'initial',
                    ...(focusSongId ? { focusSongId } : {}),
                  },
                })
              }
            />
          )}
        />
      )}
    </View>
  );
}
