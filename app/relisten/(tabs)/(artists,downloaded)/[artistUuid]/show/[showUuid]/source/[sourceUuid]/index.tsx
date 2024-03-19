import { Link as SLink } from '@/relisten/api/models/source';
import { FavoriteObjectButton } from '@/relisten/components/favorite_icon_button';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { RefreshContextProvider, useRefreshContext } from '@/relisten/components/refresh_context';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenFlatList } from '@/relisten/components/relisten_flat_list';
import { RelistenLink } from '@/relisten/components/relisten_link';
import { RelistenText } from '@/relisten/components/relisten_text';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { Show } from '@/relisten/realm/models/show';
import { sortSources, useFullShow } from '@/relisten/realm/models/show_repo';
import { Source } from '@/relisten/realm/models/source';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { useRealm } from '@/relisten/realm/schema';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { useForceUpdate } from '@/relisten/util/forced_update';
import { MaterialIcons } from '@expo/vector-icons';
import { MoreOrLess } from '@rntext/more-or-less';
import dayjs from 'dayjs';
import { Link, useLocalSearchParams, useNavigation } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import React, { PropsWithChildren, useCallback, useEffect, useMemo } from 'react';
import { List as ListContentLoader } from 'react-content-loader/native';
import {
  Animated,
  ScrollViewProps,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
} from 'react-native';
import * as R from 'remeda';

import { SourceSets } from '@/relisten/components/source/source_sets_component';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import { PlayShow, useSourceTrackContextMenu } from '@/relisten/player/ui/track_context_menu';
import { useArtist } from '@/relisten/realm/models/artist_repo';
import { useGroupSegment } from '@/relisten/util/routes';
import { useActionSheet } from '@expo/react-native-action-sheet';
import { DownloadManager } from '@/relisten/offline/download_manager';

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

export default function Page() {
  const { showActionSheetWithOptions } = useActionSheet();

  const realm = useRealm();
  const navigation = useNavigation();
  const { showUuid } = useLocalSearchParams();
  const { sourceUuid } = useLocalSearchParams();
  const player = useRelistenPlayer();

  const results = useFullShow(String(showUuid));
  const show = results?.data?.show;
  const sources = results?.data?.sources;
  const artist = useArtist(show?.artistUuid);

  const sortedSources = useMemo(() => {
    if (!sources) return [];

    return sortSources(sources);
  }, [sources]);

  // default sourceUuid is initial which will just fall back to sortedSources[0]
  const selectedSource =
    sortedSources.find((source) => source.uuid === sourceUuid) ?? sortedSources[0];

  const playShow = useCallback(
    (sourceTrack?: SourceTrack) => {
      if (
        !sourceTrack ||
        !sourceTrack.mp3Url ||
        !sourceTrack.uuid ||
        !artist.data ||
        !show ||
        !selectedSource
      ) {
        return;
      }

      const showTracks = selectedSource.allSourceTracks();

      const trackIndex = Math.max(
        showTracks.findIndex((st) => st.uuid === sourceTrack?.uuid),
        0
      );

      player.queue.replaceQueue(
        showTracks.map((t) =>
          PlayerQueueTrack.fromSourceTrack(t, selectedSource, artist.data, show.venue)
        ),
        trackIndex
      );
    },
    [selectedSource, artist.data, show]
  ) satisfies PlayShow;

  const downloadShow = () => {
    const showTracks = selectedSource.allSourceTracks();

    showTracks.forEach((track) => {
      DownloadManager.SHARED_INSTANCE.downloadTrack(track);
    });
  };

  const onDotsPress = useCallback(() => {
    if (!show) {
      return;
    }

    const options = [
      'Play Show',
      'Download Entire Show',
      'View Sources',
      'Toggle Favorite',
      'Cancel',
    ];
    const cancelButtonIndex = options.length - 1;

    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
      },
      (selectedIndex?: number) => {
        switch (selectedIndex) {
          case 0:
            playShow(selectedSource?.sourceSets[0].sourceTracks[0]);

            break;
          case 1:
            downloadShow();
            break;

          case 2:
            break;
          case 3:
            realm.write(() => {
              selectedSource.isFavorite = !selectedSource.isFavorite;
            });
            break;
          case cancelButtonIndex:
            break;
          // Canceled
        }
      }
    );
  }, [show]);

  useEffect(() => {
    navigation.setOptions({
      title: show?.displayDate,
      headerRight: () => (
        <MaterialIcons name="more-horiz" color="white" size={22} onPress={onDotsPress} />
      ),
    });
  }, [show]);

  return (
    <RefreshContextProvider
      networkBackedResults={results}
      extraRefreshingConsideration={() => !selectedSource}
    >
      <DisappearingHeaderScreen
        ScrollableComponent={SourceComponent}
        show={show}
        selectedSource={selectedSource!}
        playShow={playShow}
        downloadShow={downloadShow}
      />
    </RefreshContextProvider>
  );
}

const SourceComponent = ({
  show,
  selectedSource,
  playShow,
  downloadShow,
  ...props
}: {
  show: Show | undefined;
  selectedSource?: Source;
  playShow: PlayShow;
  downloadShow: () => void;
} & ScrollViewProps) => {
  const { refreshing } = useRefreshContext();
  const artist = useArtist(show?.artistUuid);
  const { showContextMenu } = useSourceTrackContextMenu();

  const onDotsPress = useCallback(
    (sourceTrack: SourceTrack) => {
      if (!artist.data || !show || !selectedSource) {
        return;
      }

      const queueTrack = PlayerQueueTrack.fromSourceTrack(
        sourceTrack,
        selectedSource,
        artist.data,
        show.venue
      );

      showContextMenu(queueTrack, playShow);
    },
    [selectedSource, artist.data, show, playShow]
  );

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

  if (!selectedSource) {
    return (
      <View className="w-full p-4">
        <RelistenText>There was an error...</RelistenText>
      </View>
    );
  }

  return (
    <Animated.ScrollView style={{ flex: 1 }} {...props}>
      {/*<SelectedSource sources={sortedSources} sourceIndex={selectedSourceIndex} />*/}
      <SourceHeader
        source={selectedSource}
        show={show}
        downloadShow={downloadShow}
        playShow={playShow}
      />
      <SourceSets source={selectedSource} playShow={playShow} onDotsPress={onDotsPress} />
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const SourceFooter: React.FC<{ source: Source; show: Show }> = ({ show, source }) => {
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
};

export const SourceLink = ({ link, ...props }: { link: SLink } & TouchableOpacityProps) => {
  return (
    <TouchableOpacity onPress={() => openBrowserAsync(link.url)} {...props}>
      <RelistenLink className="text-l font-bold text-gray-400">{link.label}</RelistenLink>
    </TouchableOpacity>
  );
};

export const SourceHeader = ({
  show,
  source,
  playShow,
  downloadShow,
}: {
  source: Source;
  show: Show;
  playShow: PlayShow;
  downloadShow: () => void;
}) => {
  const realm = useRealm();
  const forceUpdate = useForceUpdate();
  const groupSegment = useGroupSegment(true);

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
          <RelistenText className="text-l w-full pb-2 text-center italic text-gray-400">
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
      </View>
      {false && (
        <View className="w-full flex-row pb-2" style={{ gap: 16 }}>
          <RelistenButton className="shrink basis-1/2">Switch Source</RelistenButton>
          <FavoriteObjectButton className="shrink basis-1/2" object={source} />
        </View>
      )}
      <View className="w-full flex-row pb-4 " style={{ gap: 16 }}>
        <RelistenButton
          className="shrink basis-1/3"
          textClassName="text-l"
          icon={<MaterialIcons name="play-arrow" size={20} color="white" />}
          onPress={() => playShow(source.sourceSets[0].sourceTracks[0])}
        >
          Play
        </RelistenButton>
        <RelistenButton
          className="shrink basis-1/3"
          textClassName="text-l"
          onPress={() => downloadShow()}
        >
          <MaterialIcons name="file-download" size={20} color="white" />
        </RelistenButton>
        <RelistenButton
          className="shrink basis-1/3"
          textClassName="text-l"
          onPress={() => {
            realm.write(() => {
              source.isFavorite = !source.isFavorite;
              forceUpdate();
            });
          }}
        >
          <MaterialIcons
            name={source.isFavorite ? 'favorite' : 'favorite-outline'}
            size={20}
            color="white"
          />
        </RelistenButton>
      </View>
      <View className="w-full pb-2">
        <Link
          href={{
            pathname: `/relisten/(tabs)/${groupSegment}/[artistUuid]/show/[showUuid]/sources/`,
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
            icon={<MaterialIcons name="source" size={20} color="white" />}
            disabled={show.sourceCount <= 1}
          >
            Switch Source
          </RelistenButton>
        </Link>
      </View>
      {source.sourceSets.length === 1 && <ItemSeparator />}
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

export const SourceListItem: React.FC<PropsWithChildren<{ source: Source; index: number }>> = ({
  source,
  index,
}) => {
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
};
