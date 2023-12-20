import { Link as SLink } from '@/relisten/api/models/source';
import {
  PlayShow,
  SourceTrackComponent,
} from '@/relisten/components/source/source_track_component';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { RefreshContextProvider, useRefreshContext } from '@/relisten/components/refresh_context';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenFlatList } from '@/relisten/components/relisten_flat_list';
import { RelistenLink } from '@/relisten/components/relisten_link';
import { RelistenText } from '@/relisten/components/relisten_text';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { SectionHeader } from '@/relisten/components/section_header';
import { Show } from '@/relisten/realm/models/show';
import { sortSources, useFullShow } from '@/relisten/realm/models/show_repo';
import { Source } from '@/relisten/realm/models/source';
import { SourceSet } from '@/relisten/realm/models/source_set';
import { useRealm } from '@/relisten/realm/schema';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { useForceUpdate } from '@/relisten/util/forced_update';
import { memo } from '@/relisten/util/memo';
import { MaterialIcons } from '@expo/vector-icons';
import { MoreOrLess } from '@rntext/more-or-less';
import dayjs from 'dayjs';
import { Link, useLocalSearchParams, useNavigation } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import React, { PropsWithChildren, useEffect, useMemo } from 'react';
import { List as ListContentLoader } from 'react-content-loader/native';
import {
  Animated,
  ScrollViewProps,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
} from 'react-native';

import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';

export default function Page() {
  const navigation = useNavigation();
  const { showUuid } = useLocalSearchParams();
  const { sourceUuid } = useLocalSearchParams();
  const results = useFullShow(String(showUuid));
  const show = results?.data?.show;
  const sources = results?.data?.sources;

  useEffect(() => {
    navigation.setOptions({
      title: show?.displayDate,
    });
  }, [show]);

  const sortedSources = useMemo(() => {
    if (!sources) return [];

    return sortSources(sources);
  }, [sources]);

  // default sourceUuid is initial which will just fallback to sortedSources[0]
  const selectedSource =
    sortedSources.find((source) => source.uuid === sourceUuid) ?? sortedSources[0];

  return (
    <RefreshContextProvider
      networkBackedResults={results}
      extraRefreshingConsideration={() => !selectedSource}
    >
      <DisappearingHeaderScreen
        ScrollableComponent={SourcesList}
        show={show}
        sources={sortedSources}
        selectedSource={selectedSource!}
      />
    </RefreshContextProvider>
  );
}

const SourcesList = ({
  show,
  selectedSource,
  sources,
  ...props
}: { show: Show | undefined; selectedSource: Source; sources?: Source[] } & ScrollViewProps) => {
  const { refreshing } = useRefreshContext();
  const player = useRelistenPlayer();

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
        {show.venue && (
          <RelistenText className="w-full pb-2 text-center text-xl" selectable={false}>
            {show.venue.name}, {show.venue.location}
          </RelistenText>
        )}
      </View>
      <ItemSeparator />
      {sources?.map((source) => {
        return <SourceDetail key={source.uuid} source={source} show={show} />;
      })}
    </Animated.ScrollView>
  );
};

export const SourceList = ({ sources }: { sources: Source[] }) => {
  return (
    <RelistenFlatList
      style={{ flex: 1, width: '100%' }}
      data={sources}
      renderItem={({ item: source, index }: { item: Source; index: number }) => (
        <SourceListItem source={source} index={index} key={index} />
      )}
    />
  );
};

function sourceRatingText(source: Source) {
  if (!source.avgRating) {
    return null;
  }

  return `${source.humanizedAvgRating()}★ (${source.numRatings || source.numReviews} ratings)`;
}

export const SourceFooter: React.FC<{ source: Source; show: Show }> = memo(({ show, source }) => {
  return (
    <View className="px-4 py-4">
      <RelistenText className="text-l py-1 text-gray-400">
        Source last updated: {dayjs(source.updatedAt).format('YYYY-MM-DD')}
      </RelistenText>
      <RelistenText className="text-l py-1 text-gray-400">
        Identifier: {source.upstreamIdentifier}
      </RelistenText>
      {source.links().map((l) => (
        <SourceLink key={l.upstream_source_id} className="py-1" link={l} />
      ))}
    </View>
  );
});

export const SourceLink = memo(({ link, ...props }: { link: SLink } & TouchableOpacityProps) => {
  return (
    <TouchableOpacity onPress={() => openBrowserAsync(link.url)} {...props}>
      <RelistenLink className="text-l font-bold text-gray-400">{link.label}</RelistenLink>
    </TouchableOpacity>
  );
});

export const SourceDetail: React.FC<{ source: Source; show: Show }> = memo(({ show, source }) => {
  return (
    <View className="flex w-full items-center px-4">
      <View className="w-full py-4">
        {source.taper && (
          <SourceProperty title="Taper">
            <MoreOrLess numberOfLines={1} textComponent={RelistenText}>
              {source.taper}
            </MoreOrLess>
          </SourceProperty>
        )}
        {source.transferrer && (
          <SourceProperty title="Transferrer">
            <MoreOrLess numberOfLines={1} textComponent={RelistenText}>
              {source.transferrer}
            </MoreOrLess>
          </SourceProperty>
        )}
        {source.source && (
          <SourceProperty title="Source">
            <MoreOrLess numberOfLines={1} textComponent={RelistenText}>
              {source.source}
            </MoreOrLess>
          </SourceProperty>
        )}
        {source.lineage && (
          <SourceProperty title="Lineage">
            <MoreOrLess numberOfLines={1} textComponent={RelistenText}>
              {source.lineage}
            </MoreOrLess>
          </SourceProperty>
        )}
        {source.taperNotes && (
          <SourceProperty title="Taper Notes">
            <MoreOrLess numberOfLines={1} textComponent={RelistenText}>
              {source.taperNotes}
            </MoreOrLess>
          </SourceProperty>
        )}
        {source.description && (
          <SourceProperty title="Description">
            <MoreOrLess numberOfLines={1} textComponent={RelistenText}>
              {source.description}
            </MoreOrLess>
          </SourceProperty>
        )}
      </View>

      <View className="w-full pb-2">
        <Link
          href={{
            pathname:
              '/relisten/(tabs)/artists/[artistUuid]/show/[showUuid]/source/[sourceUuid]/' as const,
            params: {
              artistUuid: show.artistUuid,
              yearUuid: show.yearUuid,
              showUuid: show.uuid,
              sourceUuid: source.uuid,
            },
          }}
          asChild
        >
          <RelistenButton
            textClassName="text-l"
            icon={<MaterialIcons name="source" size={20} color="white" />}
            disabled={show.sourceCount <= 1}
          >
            Select Source
          </RelistenButton>
        </Link>
      </View>
      {source.sourceSets.length === 1 && <ItemSeparator />}
    </View>
  );
});

export const SourceSets: React.FC<{ source: Source; playShow: PlayShow }> = memo(
  ({ source, playShow }) => {
    return (
      <View>
        {source.sourceSets.map((s) => (
          <SourceSetComponent key={s.uuid} sourceSet={s} source={source} playShow={playShow} />
        ))}
        <View className="px-4">
          <ItemSeparator />
        </View>
      </View>
    );
  }
);

export const SourceSetComponent: React.FC<{
  source: Source;
  sourceSet: SourceSet;
  playShow: PlayShow;
}> = memo(({ source, sourceSet, playShow }) => {
  return (
    <View>
      {source.sourceSets.length > 1 && <SectionHeader title={sourceSet.name} />}
      {sourceSet.sourceTracks.map((t, idx) => (
        <SourceTrackComponent
          key={t.uuid}
          sourceTrack={t}
          isLastTrackInSet={idx == sourceSet.sourceTracks.length - 1}
          onPress={playShow}
        />
      ))}
    </View>
  );
});

const SourceProperty: React.FC<PropsWithChildren<{ title: string; value?: string }>> = ({
  title,
  value,
  children,
}) => {
  return (
    <View className="w-full flex-1 flex-col py-1">
      <RelistenText className="pb-1 text-sm font-bold text-gray-400">{title}</RelistenText>
      {value ? (
        <RelistenText className="bg w-full grow" selectable={true}>
          {value}
        </RelistenText>
      ) : (
        <View className="bg w-full grow">{children}</View>
      )}
    </View>
  );
};

export const SourceListItem: React.FC<PropsWithChildren<{ source: Source; index: number }>> = memo(
  ({ source, index }) => {
    return (
      <View className="w-full flex-1 flex-col bg-white px-4 py-4">
        <RelistenText className="pb-1 text-sm font-bold">
          Source {index + 1} {source.duration && '— ' + source.humanizedDuration()}
        </RelistenText>
        {source.avgRating && <SourceProperty title="Rating" value={sourceRatingText(source)!} />}
        {source.taper && <SourceProperty title="Taper" value={source.taper} />}
        {source.transferrer && <SourceProperty title="Transferrer" value={source.transferrer} />}
        {source.source && <SourceProperty title="Source" value={source.source} />}
        {source.lineage && <SourceProperty title="Lineage" value={source.lineage} />}
      </View>
    );
  }
);
