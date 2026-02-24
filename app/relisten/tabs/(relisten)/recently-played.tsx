import { RelistenApiClient } from '@/relisten/api/client';
import Flex from '@/relisten/components/flex';
import { RelistenText } from '@/relisten/components/relisten_text';
import { ScrollScreen } from '@/relisten/components/screens/ScrollScreen';
import { Stagger } from '@/relisten/components/Stagger';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { MotiView } from 'moti';
import { useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { List as ListContentLoader } from 'react-content-loader/native';
import { ScrollView, View } from 'react-native';
import { FadeInRight, FadeOutDown } from 'react-native-reanimated';
import TimeAgo from 'react-timeago';
import { ShowLink } from '@/relisten/util/push_show';
import { useArtists } from '@/relisten/realm/models/artist_repo';
import { groupByUuid } from '@/relisten/util/group_by';

enum ACTIONS {
  UPDATE_DATA,
}

type HistoryTrack = {
  id: number;
  created_at: string;
  source_track_uuid: string;
  user_uuid: null;
  app_type: number;
  app_type_description: string;
  track: {
    source: {
      show_id: number;
      show_uuid: string | null;
      show: {
        artist_id: number;
        artist_uuid: string;
        venue_id: number;
        venue: {
          shows_at_venue: number;
          artist_id: number;
          artist_uuid: string;
          latitude: number | null;
          longitude: number | null;
          name: string;
          location: string;
          upstream_identifier: string;
          slug: string;
          past_names: string | null;
          sortName: string;
          uuid: string;
          id: number;
          created_at: string;
          updated_at: string;
        };
        venue_uuid: string | null;
        tour_id: number;
        tour_uuid: string | null;
        tour: null;
        year_id: number;
        year_uuid: string;
        year: null;
        era_id: number | null;
        era: null;
        date: string;
        avg_rating: number;
        avg_duration: number;
        display_date: string;
        most_recent_source_updated_at: string;
        has_soundboard_source: boolean;
        has_streamable_flac_source: boolean;
        source_count: number;
        uuid: string;
        id: number;
        created_at: string;
        updated_at: string;
      };
      artist: {
        features: {
          id: number;
          descriptions: boolean;
          eras: boolean;
          multiple_sources: boolean;
          reviews: boolean;
          ratings: boolean;
          tours: boolean;
          taper_notes: boolean;
          source_information: boolean;
          sets: boolean;
          per_show_venues: boolean;
          per_source_venues: boolean;
          venue_coords: boolean;
          songs: boolean;
          years: boolean;
          track_md5s: boolean;
          review_titles: boolean;
          jam_charts: boolean;
          setlist_data_incomplete: boolean;
          artist_id: number;
          track_names: boolean;
          venue_past_names: boolean;
          reviews_have_ratings: boolean;
          track_durations: boolean;
          can_have_flac: boolean;
        };
        musicbrainz_id: string;
        name: string;
        featured: number;
        slug: string;
        sort_name: string;
        uuid: string;
        id: number;
        created_at: string;
        updated_at: string;
      };
      artist_id: number;
      artist_uuid: string;
      venue_id: number;
      venue_uuid: string | null;
      venue: {
        artist_id: number;
        artist_uuid: string;
        latitude: number | null;
        longitude: number | null;
        name: string;
        location: string;
        upstream_identifier: string;
        slug: string;
        past_names: string | null;
        sortName: string;
        uuid: string;
        id: number;
        created_at: string;
        updated_at: string;
      };
      display_date: string;
      is_soundboard: boolean;
      is_remaster: boolean;
      has_jamcharts: boolean;
      avg_rating: number;
      num_reviews: number;
      num_ratings: number | null;
      avg_rating_weighted: number;
      duration: number;
      upstream_identifier: string;
      uuid: string;
      id: number;
      created_at: string;
      updated_at: string;
    };
    track: {
      source_id: number;
      source_uuid: string;
      source_set_id: number;
      source_set_uuid: string;
      artist_id: number;
      artist_uuid: string;
      show_uuid: string;
      track_position: number;
      duration: number;
      title: string;
      slug: string;
      mp3_url: string;
      mp3_md5: string;
      flac_url: string | null;
      flac_md5: string | null;
      uuid: string;
      id: number;
      created_at: string;
      updated_at: string;
    };
  };
};

const defaultState = {
  isLoading: true,
  data: [] as HistoryTrack[],
};

enum APP_TYPE {
  'ios' = 1,
  'web' = 2,
  'sonos' = 3,
  'android' = 4,
}

const removeDuplicates = (arr1: HistoryTrack[]) => {
  // Create a Set to track unique track UUIDs
  const uniqueIds = new Set<number>();
  const mergedArray: HistoryTrack[] = [];

  // Process all tracks from both arrays
  arr1.forEach((track) => {
    // Only add tracks we haven't seen before
    if (!uniqueIds.has(track.id)) {
      uniqueIds.add(track.id);
      mergedArray.push(track);
    }
  });

  return mergedArray;
};

const reducer = (state = defaultState, action: { type: ACTIONS; data?: HistoryTrack[] }) => {
  if (action.type === ACTIONS.UPDATE_DATA && action.data?.length) {
    return {
      ...state,
      isLoading: false,
      data: removeDuplicates(action.data.concat([...state.data]).slice(0, 200)),
    };
  }

  return { ...state };
};

const formatterFn = (value: number, unit: string) => value + unit.slice(0, 1);

export default function Page() {
  const [state, call] = useReducer(reducer, defaultState);
  const artistsResults = useArtists();

  useEffect(() => {
    const controller = new AbortController();

    const getData = async () => {
      let params = '';

      if (state.data[0]) {
        params = `?lastSeenId=${state.data[0]}`;
      }
      try {
        const data = await fetch(RelistenApiClient.API_BASE + `/v2/live/history${params}`, {
          signal: controller.signal,
        }).then((res) => res.json());

        call({ type: ACTIONS.UPDATE_DATA, data: data?.toReversed() });
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        throw e;
      }
    };

    getData();
    const interval = setInterval(() => {
      getData();
    }, 7000);

    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, []);

  const artistByUuid = useMemo(() => {
    return groupByUuid([...artistsResults.data]);
  }, [artistsResults.data]);

  if ((state.isLoading && !state.data.length) || artistsResults.isNetworkLoading) {
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
        <View className="w-full">
          <RelistenText className="bg-red-950 p-2 text-center">
            <RelistenText className="font-bold">Experimental:</RelistenText>
            &nbsp;this screen shows a live stream of what everyone is listening to right now.
            {'\n\n'}
            It will be improved over time.
          </RelistenText>
        </View>
        <Flex cn="gap-2" column>
          <Stagger
            enterDirection={-1}
            entering={() => FadeInRight.springify()}
            exiting={() => FadeOutDown.springify()}
          >
            {state.data.map((item) => {
              const artist = artistByUuid[item.track.source.artist.uuid];

              if (!artist) {
                return null;
              }

              return (
                <ShowLink
                  show={{
                    artist,
                    showUuid: item.track.source.show.uuid,
                    sourceUuid: item.track.source.uuid,
                    overrideGroupSegment: '(artists)',
                  }}
                  key={item.id}
                >
                  <MotiView className="relative flex w-[98%] flex-col border border-white/20 p-2">
                    <RelistenText cn="font-semibold">{item.track.track.title}</RelistenText>
                    <RelistenText cn="text-gray-300">{item.track.source.artist.name}</RelistenText>
                    <RelistenText cn="text-gray-400 text-sm">
                      {item.track.source.display_date}
                      {item.track.source.venue && (
                        <>
                          &nbsp;{item.track.source.venue.name} {item.track.source.venue.location}
                        </>
                      )}
                    </RelistenText>
                    <RelistenText cn="text-gray-400 text-xs absolute top-5 right-2">
                      {APP_TYPE[item.app_type]}
                    </RelistenText>
                    <TimeAgo
                      date={item.created_at}
                      formatter={formatterFn}
                      component={({ children }: { children?: ReactNode }) => (
                        <RelistenText cn="text-gray-400 text-xs absolute top-2 right-2">
                          {children}
                        </RelistenText>
                      )}
                    />
                  </MotiView>
                </ShowLink>
              );
            })}
          </Stagger>
        </Flex>
      </ScrollView>
    </ScrollScreen>
  );
}
