import { ItemSeparator } from '@/relisten/components/item_separator';
import { RefreshContextProvider, useRefreshContext } from '@/relisten/components/refresh_context';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenFlatList } from '@/relisten/components/relisten_flat_list';
import { RelistenText } from '@/relisten/components/relisten_text';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { Show } from '@/relisten/realm/models/show';
import { useFullShowWithSelectedSource } from '@/relisten/realm/models/show_repo';
import { Source } from '@/relisten/realm/models/source';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { useRealm } from '@/relisten/realm/schema';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { useForceUpdate } from '@/relisten/util/forced_update';
import { MaterialIcons } from '@expo/vector-icons';
import { Link, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { PropsWithChildren, useCallback, useEffect, useState } from 'react';
import { List as ListContentLoader } from 'react-content-loader/native';
import { Animated, Platform, ScrollViewProps, Share, TouchableOpacity, View } from 'react-native';
import * as R from 'remeda';

import { SourceSets } from '@/relisten/components/source/source_sets_component';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import { PlayShow, useSourceTrackContextMenu } from '@/relisten/player/ui/track_context_menu';
import { useGroupSegment } from '@/relisten/util/routes';
import { useActionSheet } from '@expo/react-native-action-sheet';
import { DownloadManager } from '@/relisten/offline/download_manager';
import Flex from '@/relisten/components/flex';
import Plur from '@/relisten/components/plur';
import { log } from '@/relisten/util/logging';
import { RelistenErrors } from '@/relisten/components/relisten_errors';
import {
  SourceFooter,
  SourceProperty,
  SourceSummary,
} from '@/relisten/components/source/source_components';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { useUserSettings } from '@/relisten/realm/models/user_settings_repo';
import { OfflineModeSetting } from '@/relisten/realm/models/user_settings';
import { Artist } from '@/relisten/realm/models/artist';

const logger = log.extend('source screen');

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
  const player = useRelistenPlayer();
  const { showUuid, sourceUuid, playTrackUuid } = useLocalSearchParams();
  const [hasAutoplayed, setHasAutoplayed] = useState(false);
  const userSettings = useUserSettings();

  const { results, show, artist, selectedSource } = useFullShowWithSelectedSource(
    String(showUuid),
    String(sourceUuid)
  );

  const playShow = useCallback(
    (sourceTrack?: SourceTrack) => {
      if (!sourceTrack || !sourceTrack.streamingUrl() || !sourceTrack.uuid || !selectedSource) {
        logger.warn(
          `Missing value when trying to play source track: sourceTrack=${sourceTrack} sourceUuid=${sourceUuid} mp3Url=${sourceTrack?.streamingUrl()} uuid=${sourceTrack?.uuid} artist=${artist.data} show=${show} selectedSource=${selectedSource}`
        );
        return;
      }

      const showTracks = selectedSource.allSourceTracks().filter((t) => {
        if (userSettings.offlineModeWithDefault() === OfflineModeSetting.AlwaysOffline) {
          return t.playable(false);
        }

        return true;
      });

      const trackIndex = Math.max(
        showTracks.findIndex((st) => st.uuid === sourceTrack?.uuid),
        0
      );

      if (showTracks.length > 0) {
        player.queue.replaceQueue(
          showTracks.map((t) => PlayerQueueTrack.fromSourceTrack(t)),
          trackIndex
        );
      }
    },
    [selectedSource, userSettings]
  ) satisfies PlayShow;

  const downloadShow = () => {
    if (!selectedSource) {
      logger.warn(
        `Missing value when trying to download show: artist=${artist.data} sourceUuid=${sourceUuid} show=${show} selectedSource=${selectedSource}`
      );
      return;
    }
    const showTracks = selectedSource.allSourceTracks();

    showTracks.forEach((track) => {
      DownloadManager.SHARED_INSTANCE.downloadTrack(track);
    });
  };

  const removeDownloads = () => {
    if (!selectedSource) {
      logger.warn(
        `Missing value when trying to remove downloads: artist=${artist.data} sourceUuid=${sourceUuid} show=${show} selectedSource=${selectedSource}`
      );
      return;
    }
    const showTracks = selectedSource.allSourceTracks();

    showTracks.forEach((track) => {
      DownloadManager.SHARED_INSTANCE.removeDownload(track);
    });
  };

  const onDotsPress = useCallback(() => {
    if (!show) {
      return;
    }

    const options = [
      'Share Show',
      'Play Show',
      'Download Entire Show',
      'Remove All Downloads for Show',
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
          case 0: {
            const [year, month, day] = selectedSource.displayDate.split('-');
            const url = `https://relisten.net/${artist.data?.slug}/${year}/${month}/${day}?source=${selectedSource.uuid}`;
            Share.share({
              message: `Check out ${show.displayDate} (${show.venue?.name ?? ''}) by ${artist?.data?.name} on @relistenapp${Platform.OS === 'ios' ? '' : `: ${url}`}`,
              url: url,
            }).then(() => {});

            break;
          }
          case 1:
            playShow(selectedSource?.sourceSets[0].sourceTracks[0]);

            break;
          case 2:
            downloadShow();
            break;

          case 3:
            removeDownloads();
            break;

          case 4:
            break;
          case 5:
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
        <TouchableOpacity onPressOut={onDotsPress}>
          <MaterialIcons name="more-horiz" color="white" size={22} />
        </TouchableOpacity>
      ),
    });
  }, [show]);

  useEffect(() => {
    if (!selectedSource || hasAutoplayed) {
      return;
    }

    for (const track of selectedSource.allSourceTracks()) {
      if (track.uuid === playTrackUuid) {
        playShow(track);

        // Prevent autoplaying again if they switch sources and switch back
        setHasAutoplayed(true);
        break;
      }
    }
  }, [show, playTrackUuid, playShow, selectedSource, setHasAutoplayed]);

  return (
    <RefreshContextProvider
      networkBackedResults={results}
      extraRefreshingConsideration={() => !selectedSource}
    >
      <DisappearingHeaderScreen
        ScrollableComponent={SourceComponent}
        show={show}
        artist={artist.data || undefined}
        selectedSource={selectedSource}
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
  artist,
  downloadShow,
  ...props
}: {
  show: Show | undefined;
  selectedSource?: Source;
  artist?: Artist;
  playShow: PlayShow;
  downloadShow: () => void;
} & ScrollViewProps) => {
  const { refreshing, errors, hasData } = useRefreshContext();
  const { showContextMenu } = useSourceTrackContextMenu();

  const onDotsPress = useCallback((sourceTrack: SourceTrack) => {
    const queueTrack = PlayerQueueTrack.fromSourceTrack(sourceTrack);

    showContextMenu(queueTrack, playShow);
  }, []);

  if (errors && !hasData) {
    return (
      <View className="w-full p-4">
        <RelistenErrors errors={errors} />
      </View>
    );
  }

  if (refreshing || !show || !artist) {
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
        artist={artist}
      />
      <SourceSets source={selectedSource} playShow={playShow} onDotsPress={onDotsPress} />
      <SourceFooter source={selectedSource} />
    </Animated.ScrollView>
  );
};

function sourceRatingText(source: Source) {
  if (!source.avgRating) {
    return null;
  }

  return `${source.humanizedAvgRating()}★ (${source.numRatings || source.numReviews} ratings)`;
}

export const SourceHeader = ({
  show,
  source,
  artist,
  playShow,
  downloadShow,
}: {
  source: Source;
  show: Show;
  playShow: PlayShow;
  artist: Artist;
  downloadShow: () => void;
}) => {
  const realm = useRealm();
  const router = useRouter();
  const forceUpdate = useForceUpdate();
  const groupSegment = useGroupSegment(true);

  const secondLine = R.filter(
    [
      source.humanizedDuration(),
      `${R.sumBy(
        source.sourceSets.map((s) => s.sourceTracks.length),
        (l) => l
      )} tracks`,
      artist.name,
    ],
    R.isTruthy
  );

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
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/venue/[venueUuid]/`,
                params: {
                  artistUuid: show.artistUuid,
                  venueUuid: show.venueUuid,
                },
              })
            }
          >
            <RelistenText className="w-full pb-2 text-center text-xl" selectable={false}>
              {show.venue.name}, {show.venue.location}&nbsp;›
            </RelistenText>
          </TouchableOpacity>
        )}
        {secondLine.length > 0 && (
          <RelistenText className="text-l w-full pb-2 text-center italic text-gray-400">
            {secondLine.join('\u00A0•\u00A0')}
          </RelistenText>
        )}
      </View>
      <SourceSummary source={source} hideExtraDetails />
      <View className="w-full flex-row pb-4" style={{ gap: 16 }}>
        <RelistenButton
          className="shrink basis-1/4"
          textClassName="text-l"
          icon={<MaterialIcons name="play-arrow" size={20} color="white" />}
          onPress={() => playShow(source.sourceSets[0].sourceTracks[0])}
        >
          Play
        </RelistenButton>
        <RelistenButton
          className="shrink basis-1/4"
          textClassName="text-l"
          onPress={() => downloadShow()}
        >
          <MaterialIcons name="file-download" size={20} color="white" />
        </RelistenButton>
        <RelistenButton
          className="shrink basis-1/4"
          textClassName="text-l"
          onPress={() => {
            realm.write(() => {
              source.isFavorite = !(source.isFavorite || show.isFavorite);
              show.isFavorite = source.isFavorite;
              forceUpdate();
            });
          }}
        >
          <MaterialIcons
            name={source.isFavorite || show.isFavorite ? 'favorite' : 'favorite-outline'}
            size={20}
            color={source.isFavorite || show.isFavorite ? 'red' : 'white'}
          />
        </RelistenButton>
        <RelistenButton
          className="shrink basis-1/4"
          textClassName="text-l"
          onPress={() => {
            const [year, month, day] = show.displayDate.split('-');
            const url = `https://relisten.net/${artist?.slug}/${year}/${month}/${day}?source=${source.uuid}`;
            Share.share({
              message: `Check out ${show.displayDate} (${show.venue?.name ?? ''}) by ${artist?.name} on @relistenapp${Platform.OS === 'ios' ? '' : `: ${url}`}`,
              url: url,
            }).then(() => {});
          }}
        >
          <MaterialIcons name="ios-share" size={20} />
        </RelistenButton>
      </View>
      {(show.sourceCount > 1 || source.reviewCount > 0) && (
        <Flex className="w-full flex-row pb-4" style={{ gap: 16 }}>
          {show.sourceCount > 1 && (
            <Link
              href={{
                pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/show/[showUuid]/sources/`,
                params: {
                  artistUuid: show.artistUuid,
                  showUuid: show.uuid,
                },
              }}
              asChild
              className="flex-1"
            >
              <RelistenButton
                textClassName="text-l"
                icon={<MaterialIcons name="source" size={20} color="white" />}
                disabled={show.sourceCount <= 1}
              >
                Switch Source
              </RelistenButton>
            </Link>
          )}
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
              <RelistenButton textClassName="text-l" icon={null} disabled={source.reviewCount < 1}>
                <Plur word={'Review'} count={source.reviewCount} />
                {source.avgRating ? `\u00A0•\u00A0${source.avgRating.toFixed(1)}★` : ''}
              </RelistenButton>
            </Link>
          )}
        </Flex>
      )}
      {source.sourceSets.length === 1 && <ItemSeparator />}
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
