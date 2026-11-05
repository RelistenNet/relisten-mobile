import { useRelistenApi } from '@/relisten/api/context';
import { decodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import type { LiveHistoryResource } from '@/relisten/api/catalog/resources';
import Flex from '@/relisten/components/flex';
import { RelistenText } from '@/relisten/components/relisten_text';
import { ScrollScreen } from '@/relisten/components/screens/ScrollScreen';
import { Stagger } from '@/relisten/components/Stagger';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { MotiView } from 'moti';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { List as ListContentLoader } from 'react-content-loader/native';
import { ScrollView, View } from 'react-native';
import { FadeInRight, FadeOutDown } from 'react-native-reanimated';
import TimeAgo from 'react-timeago';
import { ShowLink } from '@/relisten/util/push_show';
import { useArtists } from '@/relisten/realm/models/artist_repo';
import { groupByUuid } from '@/relisten/util/group_by';
import { usePlayerBottomScrollViewProps } from '@/relisten/player/ui/player_bar_layout';

interface HistoryState {
  isLoading: boolean;
  data: LiveHistoryResource[];
  error?: string;
}

function mergeHistory(incoming: LiveHistoryResource[], previous: LiveHistoryResource[]) {
  const seen = new Set<number>();
  const merged: LiveHistoryResource[] = [];
  for (const event of [...incoming].reverse().concat(previous)) {
    if (!seen.has(event.sequence)) {
      seen.add(event.sequence);
      merged.push(event);
    }
    if (merged.length === 200) {
      break;
    }
  }
  return merged;
}

const formatterFn = (value: number, unit: string) => value + unit.slice(0, 1);

export default function Page() {
  const playerBottomScrollViewProps = usePlayerBottomScrollViewProps();
  const { apiClient } = useRelistenApi();
  const [state, setState] = useState<HistoryState>({ isLoading: true, data: [] });
  const artistsResults = useArtists();

  useEffect(() => {
    let active = true;
    let pending = false;
    let afterSequence: number | undefined;

    const poll = async () => {
      if (pending) {
        return;
      }
      pending = true;
      const response = await apiClient.liveHistory(afterSequence);
      pending = false;
      if (!active) {
        return;
      }
      if (response.error || !response.data) {
        setState((current) => ({
          ...current,
          isLoading: false,
          error: response.error?.message ?? 'Could not load recent activity.',
        }));
        return;
      }

      const events = response.data;
      afterSequence = events.at(-1)?.sequence ?? afterSequence;
      setState((current) => ({
        isLoading: false,
        data: mergeHistory(events, current.data),
      }));
    };

    void poll();
    const interval = setInterval(() => void poll(), 7000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [apiClient]);

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
      <ScrollView className="pt-2" {...playerBottomScrollViewProps}>
        <View className="w-full">
          <RelistenText className="bg-red-950 p-2 text-center">
            <RelistenText className="font-bold">Experimental:</RelistenText>
            &nbsp;this screen shows a live stream of what everyone is listening to right now.
            {'\n\n'}
            It will be improved over time.
          </RelistenText>
        </View>
        {state.error && <RelistenText cn="p-2 text-red-300">{state.error}</RelistenText>}
        <Flex cn="gap-2" column>
          <Stagger
            enterDirection={-1}
            entering={() => FadeInRight.springify()}
            exiting={() => FadeOutDown.springify()}
          >
            {state.data.map((item) => {
              const artist = artistByUuid[decodeUuidCatalogId(item.show.artist_id, 'artist')];

              if (!artist) {
                return null;
              }

              return (
                <ShowLink
                  show={{
                    artist,
                    showUuid: decodeUuidCatalogId(item.show.id, 'show'),
                    sourceUuid: decodeUuidCatalogId(item.track.source_id, 'source'),
                    overrideGroupSegment: '(artists)',
                  }}
                  key={item.sequence}
                >
                  <MotiView className="relative flex w-[98%] flex-col border border-white/20 p-2">
                    <RelistenText cn="font-semibold">{item.track.title}</RelistenText>
                    <RelistenText cn="text-gray-300">{artist.name}</RelistenText>
                    <RelistenText cn="text-gray-400 text-sm">
                      {item.show.display_date}
                      {item.show.imported_venue && (
                        <>
                          &nbsp;{item.show.imported_venue.name} {item.show.imported_venue.location}
                        </>
                      )}
                    </RelistenText>
                    <RelistenText cn="text-gray-400 text-xs absolute top-5 right-2">
                      {item.app_type}
                    </RelistenText>
                    <TimeAgo
                      date={item.played_at}
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
