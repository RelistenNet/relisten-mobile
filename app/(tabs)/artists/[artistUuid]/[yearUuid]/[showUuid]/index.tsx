import { Link as SLink } from '@/relisten/api/models/source';
import { FavoriteObjectButton } from '@/relisten/components/favorite_icon_button';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { RefreshContextProvider, useRefreshContext } from '@/relisten/components/refresh_context';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenFlatList } from '@/relisten/components/relisten_flat_list';
import { RelistenLink } from '@/relisten/components/relisten_link';
import { RelistenText } from '@/relisten/components/relisten_text';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { SectionHeader } from '@/relisten/components/section_header';
import PlaybackMachine from '@/relisten/machines/PlaybackMachine';
import { Show } from '@/relisten/realm/models/show';
import { useFullShow } from '@/relisten/realm/models/show_repo';
import { Source } from '@/relisten/realm/models/source';
import { SourceSet } from '@/relisten/realm/models/source_set';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { useRealm } from '@/relisten/realm/schema';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { useForceUpdate } from '@/relisten/util/forced_update';
import { memo } from '@/relisten/util/memo';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { MoreOrLess } from '@rntext/more-or-less';
import dayjs from 'dayjs';
import { Link, useGlobalSearchParams, useNavigation } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import React, { PropsWithChildren, useCallback, useEffect, useMemo, useState } from 'react';
import { List as ListContentLoader } from 'react-content-loader/native';
import {
  Animated,
  Button,
  ScrollViewProps,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
} from 'react-native';
import * as R from 'remeda';

export const SourceList = ({ sources }: { sources: Source[] }) => {
  return (
    <RelistenFlatList
      style={{ flex: 1, width: '100%' }}
      data={sources}
      renderItem={({ item: source, index }) => (
        <SourceListItem source={source} index={index} key={index} />
      )}
    />
  );
};

export default function Page() {
  const navigation = useNavigation();
  const { showUuid } = useGlobalSearchParams();
  const results = useFullShow(String(showUuid));
  const {
    data: { show, sources },
  } = results;

  useEffect(() => {
    navigation.setOptions({
      title: show?.displayDate,
    });
  }, [show]);

  const sortedSources = useMemo(() => {
    const all = [...sources];

    return all.sort((a, b) => b.avgRatingWeighted - a.avgRatingWeighted);
  }, [sources]);

  const [selectedSourceIndex, setSelectedSourceIndex] = useState<number>(0);

  const selectedSource = sortedSources[selectedSourceIndex];

  return (
    <RefreshContextProvider
      networkBackedResults={results}
      extraRefreshingConsideration={() => !selectedSource}
    >
      <DisappearingHeaderScreen
        headerHeight={50}
        ScrollableComponent={SourceComponent}
        show={show!}
        selectedSource={selectedSource!}
      />
    </RefreshContextProvider>
  );
}

const SourceComponent = ({
  show,
  selectedSource,
  ...props
}: { show: Show; selectedSource: Source } & ScrollViewProps) => {
  const { refreshing } = useRefreshContext();

  if (refreshing) {
    return (
      <View className="w-full p-4">
        <ListContentLoader
          backgroundColor={RelistenBlue[800]}
          foregroundColor={RelistenBlue[700]}
        />
      </View>
    );
  }

  const showTracks = selectedSource.sourceSets
    .map((set) =>
      set.sourceTracks.map((track) => ({
        identifier: track.uuid,
        url: track.mp3Url,
        title: track.title,
      }))
    )
    .flat();

  const playShow = useCallback(
    (sourceTrack?: SourceTrack) => {
      const trackIndex = showTracks.findIndex((st) => st.identifier === sourceTrack?.uuid) ?? 0;

      PlaybackMachine.send('UPDATE_QUEUE', {
        queue: showTracks,
        trackIndex,
      });

      // PlaybackMachine.send('RESUME');
    },
    [showTracks]
  );

  return (
    <Animated.ScrollView style={{ flex: 1 }} {...props}>
      {/*<SelectedSource sources={sortedSources} sourceIndex={selectedSourceIndex} />*/}
      <SourceHeader source={selectedSource} show={show} playShow={playShow} />
      <SourceSets source={selectedSource} playShow={playShow} />
      <SourceFooter source={selectedSource} show={show} />
    </Animated.ScrollView>
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
      <RelistenText className="text-l py-1 text-slate-400">
        Source last updated: {dayjs(source.updatedAt).format('YYYY-MM-DD')}
      </RelistenText>
      <RelistenText className="text-l py-1 text-slate-400">
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
      <RelistenLink className="text-l font-bold text-slate-400">{link.label}</RelistenLink>
    </TouchableOpacity>
  );
});

export const SourceHeader: React.FC<{ source: Source; show: Show; playShow: any }> = memo(
  ({ show, source, playShow }) => {
    const realm = useRealm();
    const forceUpdate = useForceUpdate();

    const secondLine = R.compact([
      source.humanizedDuration(),
      `${R.sumBy(
        source.sourceSets.map((s) => s.sourceTracks.length),
        (l) => l
      )} tracks`,
      sourceRatingText(source),
    ]);

    return (
      <View className="flex w-full items-center px-4">
        <View className="w-full">
          <RelistenText
            className="w-full py-2 text-center text-4xl font-bold text-white"
            selectable={false}
          >
            {show.displayDate}
          </RelistenText>
          {show.venue && (
            <RelistenText className="w-full pb-2 text-center text-xl" selectable={false}>
              {show.venue.name}, {show.venue.location}&nbsp;›
            </RelistenText>
          )}
          {secondLine.length > 0 && (
            <RelistenText className="text-l w-full pb-2 text-center italic text-slate-400">
              {secondLine.join(' • ')}
            </RelistenText>
          )}
        </View>
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
        {false && (
          <View className="w-full flex-row pb-2" style={{ gap: 16 }}>
            <RelistenButton className="shrink basis-1/2">Switch Source</RelistenButton>
            <FavoriteObjectButton className="shrink basis-1/2" object={source} />
          </View>
        )}
        <View className="w-full flex-row pb-4 " style={{ gap: 16 }}>
          <RelistenButton
            className="shrink basis-1/2"
            textClassName="text-l"
            icon={<MaterialIcons name="play-arrow" size={20} color="white" />}
            onPress={() => playShow(0)}
          >
            Play
          </RelistenButton>
          <RelistenButton
            className="shrink basis-1/2"
            textClassName="text-l"
            icon={
              <MaterialIcons
                name={source.isFavorite ? 'favorite' : 'favorite-outline'}
                size={20}
                color="white"
              />
            }
            onPress={() => {
              realm.write(() => {
                source.isFavorite = !source.isFavorite;
                forceUpdate();
              });
            }}
          >
            {source.isFavorite ? 'In Library' : 'Add to Library'}
          </RelistenButton>
        </View>
        <View className="w-full pb-2">
          <Link
            href={{
              pathname: '/(tabs)/artists/[artistUuid]/[yearUuid]/[showUuid]/sources/' as const,
              params: {
                artistUuid: show.artistUuid,
                yearUuid: show.yearUuid,
                showUuid: show.uuid,
              },
            }}
            asChild
          >
            <RelistenButton
              textClassName="text-l"
              icon={<MaterialIcons name="play-arrow" size={20} color="white" />}
            >
              Switch Source
            </RelistenButton>
          </Link>
        </View>
        {source.sourceSets.length === 1 && <ItemSeparator />}
      </View>
    );
  }
);

export const SourceSets: React.FC<{ source: Source; playShow: any }> = memo(
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

export const SourceSetComponent: React.FC<{ source: Source; sourceSet: SourceSet; playShow: any }> =
  memo(({ source, sourceSet, playShow }) => {
    return (
      <View>
        {source.sourceSets.length > 1 && <SectionHeader title={sourceSet.name} />}
        {sourceSet.sourceTracks.map((t, idx) => (
          <SourceTrackComponent
            key={t.uuid}
            sourceTrack={t}
            source={source}
            isLastTrackInSet={idx == sourceSet.sourceTracks.length - 1}
            playShow={playShow}
          />
        ))}
      </View>
    );
  });

export const SourceTrackComponent: React.FC<{
  source: Source;
  sourceTrack: SourceTrack;
  isLastTrackInSet: boolean;
  playShow: any;
}> = memo(({ source, sourceTrack, isLastTrackInSet, playShow }) => {
  return (
    <TouchableOpacity
      className="flex flex-row items-start pl-6 pr-4"
      onPress={() => playShow(sourceTrack)}
    >
      <View className="basis-7 pt-3 ">
        <RelistenText className="pt-[1] text-lg text-slate-500">
          {sourceTrack.trackPosition}
        </RelistenText>
      </View>

      <View className="shrink flex-col">
        <View className="w-full grow flex-row items-center justify-between">
          <RelistenText className="shrink py-3 pr-2 text-lg">{sourceTrack.title}</RelistenText>
          <View className="grow"></View>
          <RelistenText className="py-3 text-base text-slate-400">
            {sourceTrack.humanizedDuration()}
          </RelistenText>
          <TouchableOpacity className="shrink-0 grow-0 py-3 pl-4">
            <MaterialCommunityIcons name="dots-horizontal" size={16} color="white" />
          </TouchableOpacity>
        </View>
        {!isLastTrackInSet && <ItemSeparator />}
      </View>
    </TouchableOpacity>
  );
});

const SelectedSource: React.FC<{ sources: Source[]; sourceIndex: number }> = ({
  sources,
  sourceIndex,
}) => {
  const source = sources[sourceIndex];

  if (!source) {
    return null;
  }

  return (
    <View className="flex w-full flex-row items-center justify-between bg-slate-100 px-4 py-2">
      <View className="flex shrink">
        <RelistenText className="pb-1 text-sm font-bold">
          Source {sourceIndex + 1}/{sources.length}
          {source.duration && ' — ' + source.humanizedDuration()}
        </RelistenText>
        <RelistenText className="pb-1 text-sm tracking-tighter" numberOfLines={1}>
          {R.compact([source.taper, source.transferrer]).join(', ')}
        </RelistenText>
        {source.source && (
          <RelistenText className="pb-1 text-sm tracking-tighter" numberOfLines={1}>
            {source.source}
          </RelistenText>
        )}
      </View>
      <View className="shrink-0">
        <Button title="Change Source" />
      </View>
    </View>
  );
};

const SourceProperty: React.FC<PropsWithChildren<{ title: string; value?: string }>> = ({
  title,
  value,
  children,
}) => {
  return (
    <View className="w-full flex-1 flex-col py-1">
      <RelistenText className="pb-1 text-sm font-bold text-slate-500">{title}</RelistenText>
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
