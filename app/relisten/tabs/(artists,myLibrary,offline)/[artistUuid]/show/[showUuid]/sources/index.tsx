import { ItemSeparator } from '@/relisten/components/item_separator';
import { RefreshContextProvider, useRefreshContext } from '@/relisten/components/refresh_context';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { Show } from '@/relisten/realm/models/show';
import {
  sortSources,
  useFullShow,
  useFullShowWithSelectedSource,
} from '@/relisten/realm/models/show_repo';
import { Source } from '@/relisten/realm/models/source';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { memo } from '@/relisten/util/memo';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Link, useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { List as ListContentLoader } from 'react-content-loader/native';
import { Animated, ScrollViewProps, View } from 'react-native';
import { useGroupSegment } from '@/relisten/util/routes';
import Flex from '@/relisten/components/flex';
import Plur from '@/relisten/components/plur';
import { SourceSummary } from '@/relisten/components/source/source_components';
import { SectionHeader } from '@/relisten/components/section_header';
import { Tag } from '@/relisten/components/tag';
import colors from 'tailwindcss/colors';
import { SourceTrackSucceededIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { ShowLink } from '@/relisten/util/push_show';
import { Artist } from '@/relisten/realm/models/artist';

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
  selectedSource,
  sources,
  artist,
  ...props
}: {
  show: Show | undefined;
  artist: Artist;
  selectedSource: Source;
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

function sourceRatingText(source: Source) {
  if (!source.avgRating) {
    return null;
  }

  return `${source.humanizedAvgRating()}★ (${source.numRatings || source.numReviews} ratings)`;
}

export const SourceDetail: React.FC<{ source: Source; show: Show; idx: number; artist: Artist }> =
  memo(({ show, source, artist, idx }) => {
    const groupSegment = useGroupSegment(true);

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
          </SectionHeader>
        </View>
        <View className="flex w-full items-center px-4">
          <SourceSummary source={source} />
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
              {source.reviewCount > 0 && (
                <Link
                  href={{
                    pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/show/[showUuid]/source/[sourceUuid]/reviews`,
                    params: {
                      artistUuid: show.artistUuid,
                      showUuid: show.uuid,
                      sourceUuid: source.uuid,
                    },
                  }}
                  asChild
                  className="flex-1"
                >
                  <RelistenButton
                    textClassName="text-l"
                    icon={null}
                    disabled={show.sourceCount <= 1}
                  >
                    <Plur word={'Review'} count={source.reviewCount} />
                    {source.avgRating ? ` • ${source.avgRating.toFixed(1)}★` : ''}
                  </RelistenButton>
                </Link>
              )}
            </Flex>
          </View>
        </View>
      </View>
    );
  });
