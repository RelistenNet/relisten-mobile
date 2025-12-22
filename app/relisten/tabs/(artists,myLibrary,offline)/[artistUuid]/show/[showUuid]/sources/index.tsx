import { ItemSeparator } from '@/relisten/components/item_separator';
import { RefreshContextProvider, useRefreshContext } from '@/relisten/components/refresh_context';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { Show } from '@/relisten/realm/models/show';
import { useFullShowWithSelectedSource } from '@/relisten/realm/models/show_repo';
import { Source } from '@/relisten/realm/models/source';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { memo } from '@/relisten/util/memo';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, type FC } from 'react';
import { List as ListContentLoader } from 'react-content-loader/native';
import { Animated, ScrollViewProps, View } from 'react-native';
import Flex from '@/relisten/components/flex';
import Plur from '@/relisten/components/plur';
import { SourceReviewsButton, SourceSummary } from '@/relisten/components/source/source_components';
import { SectionHeader } from '@/relisten/components/section_header';
import colors from 'tailwindcss/colors';
import { SourceTrackSucceededIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { ShowLink, ShowRedirect } from '@/relisten/util/push_show';
import { Artist } from '@/relisten/realm/models/artist';
import dayjs from 'dayjs';

export default function Page() {
  const navigation = useNavigation();
  const { showUuid } = useLocalSearchParams();
  const { sourceUuid } = useLocalSearchParams();

  const {
    results,
    show,
    artist: artistResults,
    sources,
  } = useFullShowWithSelectedSource(String(showUuid), 'initial');

  const artist = artistResults.data;

  useEffect(() => {
    navigation.setOptions({
      title: show?.displayDate,
    });
  }, [show]);

  if (sources.length === 1) {
    return (
      <ShowRedirect show={{ artist: artist!, showUuid: show.uuid, sourceUuid: sources[0].uuid }} />
    );
  }

  // default sourceUuid is initial which will just fallback to sortedSources[0]
  const selectedSource = sources.find((source) => source.uuid === sourceUuid) ?? sources[0];

  return (
    <RefreshContextProvider
      networkBackedResults={results}
      extraRefreshingConsideration={() => !selectedSource}
    >
      <DisappearingHeaderScreen
        ScrollableComponent={SourcesList}
        show={show}
        sources={sources}
        selectedSource={selectedSource!}
        artist={artist!}
      />
    </RefreshContextProvider>
  );
}

const SourcesList = ({
  show,
  sources,
  artist,
  ...props
}: {
  show: Show | undefined;
  artist: Artist;
  sources?: Source[];
} & ScrollViewProps) => {
  const { refreshing } = useRefreshContext();

  if (refreshing || !show) {
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
    <Animated.ScrollView style={{ flex: 1 }} {...props}>
      <View className="w-full">
        <RelistenText
          className="w-full py-2 text-center text-4xl font-bold text-white"
          selectable={false}
        >
          {show.displayDate}
        </RelistenText>
        <RelistenText className="text-l w-full pb-2 text-center italic text-gray-400">
          <Plur word="tape" count={show.sourceCount} />
          {'\u00A0\u2022\u00A0'}
          {artist.name}
        </RelistenText>
      </View>
      <ItemSeparator />
      {sources?.map((source, idx) => {
        return (
          <SourceDetail key={source.uuid} source={source} show={show} artist={artist} idx={idx} />
        );
      })}
    </Animated.ScrollView>
  );
};

export const SourceDetail: FC<{ source: Source; show: Show; idx: number; artist: Artist }> = memo(
  ({ show, source, artist, idx }) => {
    return (
      <View>
        <View className="w-full">
          <SectionHeader className="flex-row items-center">
            <RelistenText className="text-m font-bold">Source #{idx + 1}</RelistenText>
            {source.isSoundboard && (
              <RelistenText cn="ml-1 text-xs font-bold text-relisten-blue-600">SBD</RelistenText>
            )}
            {source.isFavorite && (
              <View className="ml-1">
                <MaterialCommunityIcons name="cards-heart" color={colors.blue['200']} />
              </View>
            )}
            {source.hasOfflineTracks && <SourceTrackSucceededIndicator className="ml-1" />}
            <View className="flex-grow" />
            <RelistenText>
              {source.avgRating != 0 && source.humanizedAvgRating() + '\u00A0★\u00A0•\u00A0'}
              {source.humanizedDuration()}
            </RelistenText>
          </SectionHeader>
        </View>
        <View className="flex w-full items-center px-4">
          <ShowLink show={{ artist, showUuid: show.uuid, sourceUuid: source.uuid }}>
            <SourceSummary source={source}>
              <RelistenText className="mt-2 text-sm" selectable={false}>
                {source.upstreamIdentifier}
              </RelistenText>
              <View className="mb-1 mt-1 w-full">
                <RelistenText className="text-sm" selectable={false}>
                  Updated on {dayjs(source.updatedAt).format('YYYY-MM-DD')}
                </RelistenText>
              </View>
            </SourceSummary>
          </ShowLink>
          <View className="w-full pb-6">
            <Flex className="w-full flex-row" style={{ gap: 16 }}>
              <ShowLink
                show={{
                  artist,
                  showUuid: show.uuid,
                  sourceUuid: source.uuid,
                }}
                asChild
                className="flex-1"
              >
                <RelistenButton
                  textClassName="text-l"
                  icon={<MaterialIcons name="source" size={20} color="white" />}
                >
                  Select Source
                </RelistenButton>
              </ShowLink>
              {source.reviewCount > 0 && <SourceReviewsButton source={source} show={show} />}
            </Flex>
          </View>
        </View>
      </View>
    );
  }
);
