import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Image,
  Modal,
  ModalProps,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { DownloadManager } from '@/relisten/offline/download_manager';
import Flex from '@/relisten/components/flex';
import { RelistenText } from '@/relisten/components/relisten_text';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { log } from '@/relisten/util/logging';
import {
  FavoritedSource,
  isLegacyDatabaseEmpty,
  LegacyDatabaseContents,
  loadLegacyDatabaseContents,
  OfflineTrack,
} from '@/relisten/realm/old_ios_schema';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { errorDisplayString, RelistenApiClient } from '@/relisten/api/client';
import { Realm } from '@realm/react';
import { artistsNetworkBackedBehavior } from '@/relisten/realm/models/artist_repo';
import { groupByUuid } from '@/relisten/util/group_by';
import { ShowWithFullSourcesNetworkBackedBehavior } from '@/relisten/realm/models/show_repo';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import * as fs from 'expo-file-system';
import { realm, useRealm } from '@/relisten/realm/schema';
import {
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
  SourceTrackOfflineInfoType,
} from '@/relisten/realm/models/source_track_offline_info';
import { OFFLINE_DIRECTORY } from '@/relisten/realm/models/source_track';
import { NetworkBackedBehaviorExecutor } from '@/relisten/realm/network_backed_behavior';
import { useRelistenApi } from '@/relisten/api/context';

const logger = log.extend('LegacyDataMigrationModal');

export const SEEN_MODAL_KEY = '@relistenapp/seen-v6-migration-modal';

export interface LegacyDataMigrationResult {
  type: 'artist' | 'offline_track' | 'source' | 'show';
  identifier: string;
  success: boolean;
  migrated: boolean;
  message?: string;
}

export class LegacyDataMigrator {
  constructor(
    private api: RelistenApiClient,
    private realm: Realm
  ) {}

  public async migrateOfflineTrack(
    sourceUuid: string,
    offlineTracks: ReadonlyArray<OfflineTrack>,
    allOfflineFiles: string[]
  ): Promise<LegacyDataMigrationResult[]> {
    const sourceBehavior = new ShowWithFullSourcesNetworkBackedBehavior(
      this.realm,
      undefined,
      sourceUuid
    );
    const result = await NetworkBackedBehaviorExecutor.executeUntilMatches(
      sourceBehavior,
      this.api,
      (result) => {
        return (result.errors?.length ?? 0) > 0 || sourceBehavior.isLocalDataShowable(result.data);
      }
    );

    if (result.errors && result.errors.length > 0) {
      return offlineTracks.map((t) => {
        return {
          type: 'offline_track',
          identifier: t.track_uuid,
          success: false,
          migrated: false,
          message: result.errors?.map((e) => errorDisplayString(e))?.join(', '),
        };
      });
    }

    const sources = result.data.sources.filter((s) => s.uuid === sourceUuid);

    if (sources.length === 0) {
      return offlineTracks.map((t) => {
        return {
          type: 'offline_track',
          identifier: t.track_uuid,
          success: false,
          migrated: false,
          message: 'Source not found',
        };
      });
    }

    const source = sources[0];

    const sourceTracksByUuid = groupByUuid(source.allSourceTracks());
    const results: LegacyDataMigrationResult[] = [];

    for (const offlineTrack of offlineTracks) {
      const sourceTrack = sourceTracksByUuid[offlineTrack.track_uuid];

      if (!sourceTrack) {
        results.push({
          type: 'offline_track',
          identifier: offlineTrack.track_uuid,
          success: false,
          migrated: false,
          message: 'Source track not found',
        });
        continue;
      }

      if (sourceTrack.offlineInfo) {
        // if there's already an offline info, don't do anything
        results.push({
          type: 'offline_track',
          identifier: offlineTrack.track_uuid,
          success: true,
          migrated: false,
        });
        continue;
      }

      const mp3urlMD5 = await digestStringAsync(CryptoDigestAlgorithm.MD5, sourceTrack.mp3Url);
      const expectedLegacyFilename = `${mp3urlMD5}.mp3`;

      for (const filename of allOfflineFiles) {
        if (filename.includes(expectedLegacyFilename)) {
          const info = await fs.getInfoAsync(filename, { size: true });

          if (!info.exists) {
            continue;
          }

          try {
            await fs.makeDirectoryAsync(OFFLINE_DIRECTORY);
          } catch {
            /* no extra work to do */
          }

          // Move the file first so that we don't show offline UI when it isn't available
          await fs.moveAsync({ from: filename, to: sourceTrack.downloadedFileLocation() });

          this.realm.write(() => {
            const newOfflineInfo = new SourceTrackOfflineInfo(realm!, {
              sourceTrackUuid: sourceTrack.uuid,
              queuedAt: new Date(),
              startedAt: new Date(),
              completedAt: new Date(),
              downloadedBytes: info.size,
              totalBytes: info.size,
              percent: 1.0,
              status: SourceTrackOfflineInfoStatus.Succeeded,
              type: SourceTrackOfflineInfoType.UserInitiated,
            });

            sourceTrack.offlineInfo = newOfflineInfo;
          });

          results.push({
            type: 'offline_track',
            identifier: offlineTrack.track_uuid,
            success: true,
            migrated: true,
            message: `${sourceTrack.artist.name} - ${sourceTrack.title}`,
          });

          break;
        }
      }
    }

    return results;
  }

  public async migrateFavoriteShow(showUuid: string): Promise<LegacyDataMigrationResult> {
    const showBehavior = new ShowWithFullSourcesNetworkBackedBehavior(this.realm, showUuid);
    const result = await NetworkBackedBehaviorExecutor.executeUntilMatches(
      showBehavior,
      this.api,
      (result) => {
        return (result.errors?.length ?? 0) > 0 || showBehavior.isLocalDataShowable(result.data);
      }
    );

    const show = result.data.show;

    if (show) {
      const alreadyMigrated = show.isFavorite === true;

      if (!alreadyMigrated) {
        this.realm.write(() => {
          show.isFavorite = true;
        });
      }

      return {
        type: 'show',
        identifier: showUuid,
        success: true,
        migrated: !alreadyMigrated,
        message: `${show.artist.name} - ${show.displayDate}`,
      };
    }

    if (result.errors && result.errors.length > 0) {
      return {
        type: 'show',
        identifier: showUuid,
        success: false,
        migrated: false,
        message: result.errors.map((e) => errorDisplayString(e)).join(', '),
      };
    }

    return {
      type: 'show',
      identifier: showUuid,
      success: false,
      migrated: false,
      message: 'Unknown error. No show or errors.',
    };
  }

  public async migrateFavoriteSource(
    legacySource: FavoritedSource
  ): Promise<LegacyDataMigrationResult> {
    const sourceUuid = legacySource.uuid;
    const sourceBehavior = new ShowWithFullSourcesNetworkBackedBehavior(
      this.realm,
      legacySource.show_uuid,
      sourceUuid
    );
    const result = await NetworkBackedBehaviorExecutor.executeUntilMatches(
      sourceBehavior,
      this.api,
      (result) => {
        return (result.errors?.length ?? 0) > 0 || sourceBehavior.isLocalDataShowable(result.data);
      }
    );

    if (result.errors && result.errors.length > 0) {
      return {
        type: 'source',
        identifier: sourceUuid,
        success: false,
        migrated: false,
        message: result.errors.map((e) => errorDisplayString(e)).join(', '),
      };
    }

    const show = result.data.show;
    const sources = result.data.sources.filter((s) => s.uuid === sourceUuid);

    if (sources.length === 0) {
      return {
        type: 'source',
        identifier: sourceUuid,
        success: false,
        migrated: false,
        message: 'Source not found',
      };
    }

    const source = sources[0];

    if (show && source) {
      const alreadyMigrated = source.isFavorite === true;

      if (!alreadyMigrated) {
        this.realm.write(() => {
          show.isFavorite = true;
          source.isFavorite = true;
        });
      }

      return {
        type: 'source',
        identifier: sourceUuid,
        success: true,
        migrated: !alreadyMigrated,
        message: `${source.artist.name} - ${source.displayDate}`,
      };
    }

    return {
      type: 'source',
      identifier: sourceUuid,
      success: false,
      migrated: false,
      message: 'Unknown error. No show, sources  or errors.',
    };
  }

  public async migrateFavoriteArtists(artistUuids: string[]): Promise<LegacyDataMigrationResult[]> {
    const artistsBehavior = artistsNetworkBackedBehavior(this.realm, false);
    const { data: artists } = await NetworkBackedBehaviorExecutor.executeToFirstShowableData(
      artistsBehavior,
      this.api
    );

    const artistByUuid = groupByUuid([...artists]);

    const results: LegacyDataMigrationResult[] = this.realm.write(() => {
      return artistUuids.map((uuid) => {
        const artist = artistByUuid[uuid];

        if (artist) {
          const alreadyMigrated = artist.isFavorite === true;
          artist.isFavorite = true;

          return {
            type: 'artist',
            identifier: artist.uuid,
            success: true,
            migrated: !alreadyMigrated,
            message: artist.name,
          };
        } else {
          return {
            type: 'artist',
            identifier: uuid,
            success: false,
            migrated: false,
            message: 'Artist not found',
          };
        }
      });
    });

    return results;
  }
}

export function LegacyDataMigrationModal({
  forceShow = false,
  ...props
}: { forceShow?: boolean } & ModalProps) {
  const [modalVisible, setModalVisible] = useState(forceShow);
  const [seenModalBefore, setSeenModalBefore] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [legacyData, setLegacyData] = useState<LegacyDatabaseContents | undefined>(undefined);
  const [migrationProgress, setMigrationProgress] = useState<string>('');
  const shouldMakeNetworkRequests = useShouldMakeNetworkRequests();
  const { apiClient } = useRelistenApi();
  const realm = useRealm();

  useEffect(() => {
    (async () => {
      try {
        const value = await AsyncStorage.getItem(SEEN_MODAL_KEY);
        setSeenModalBefore(value === 'true');
      } catch {
        setSeenModalBefore(false);
      }
    })();
  }, [setSeenModalBefore, forceShow]);

  useEffect(() => {
    if (seenModalBefore) {
      return;
    }

    (async () => {
      setLegacyData(await loadLegacyDatabaseContents());
    })();
  }, [seenModalBefore, setLegacyData]);

  useEffect(() => {
    if (legacyData) {
      const hasNotDismissed = !seenModalBefore;
      const eligibleForModal = hasNotDismissed && Platform.OS === 'ios';
      const hasLegacyData = !isLegacyDatabaseEmpty(legacyData);

      logger.debug(
        `seenModalBefore=${seenModalBefore}, eligibleForModal=${eligibleForModal}, hasLegacyData=${hasLegacyData}`
      );

      if (eligibleForModal && hasLegacyData && shouldMakeNetworkRequests) {
        setModalVisible(true);
      }
    }
  }, [legacyData, setModalVisible, seenModalBefore]);

  const clearModal = ({ markAsSeen }: { markAsSeen: boolean }) => {
    if (markAsSeen) {
      (async function () {
        try {
          await AsyncStorage.setItem(SEEN_MODAL_KEY, 'true');
        } catch (e) {
          logger.error(`Error setting ${SEEN_MODAL_KEY}: ${e}`);
        }
      })();
    }
    setModalVisible(false);
  };

  const migrateLegacyData = async () => {
    if (!legacyData) {
      return;
    }

    setMigrating(true);

    const progress: string[] = [];

    function addProgress(message: string) {
      progress.push(message);
      setMigrationProgress(progress.join('\n'));
    }

    function addResult(result: LegacyDataMigrationResult) {
      addProgress(
        `${result.type}: ${result.success ? '' : 'ERROR: '}${result.message ?? 'Unknown error'}`
      );
    }

    addProgress('Starting migration');
    const migrator = new LegacyDataMigrator(apiClient, realm);

    if (legacyData.artistUuids.length > 0) {
      addProgress('Migrating artists...');
      const results = await migrator.migrateFavoriteArtists(legacyData.artistUuids);

      results.forEach(addResult);
    }

    if (legacyData.showUuids.length > 0) {
      addProgress('Migrating shows...');

      for (const showUuid of legacyData.showUuids) {
        const result = await migrator.migrateFavoriteShow(showUuid);

        addResult(result);
      }
    }

    if (legacyData.sources.length > 0) {
      addProgress('Migrating sources...');

      for (const source of legacyData.sources) {
        const result = await migrator.migrateFavoriteSource(source);

        addResult(result);
      }
    }

    if (Object.entries(legacyData.offlineTracksBySource).length > 0) {
      addProgress('Migrating offline tracks...');

      for (const [sourceUuid, offlineTracks] of Object.entries(legacyData.offlineTracksBySource)) {
        const results = await migrator.migrateOfflineTrack(
          sourceUuid,
          offlineTracks,
          legacyData.offlineFilenames
        );

        results.forEach(addResult);
      }
    }

    addProgress('Migration complete!');

    setMigrating(false);

    setTimeout(() => {
      clearModal({ markAsSeen: true });
    }, 5000);
  };

  return (
    <>
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => {
          setModalVisible(false);
        }}
        {...props}
      >
        <Flex
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
        >
          <Flex
            column
            className="h-5/6 w-10/12 rounded-lg border-2 border-relisten-blue-700 bg-relisten-blue-900 p-4"
          >
            <Image
              source={require('@/assets/Relisten White.png')}
              resizeMode="contain"
              className="mb-2 h-[28] w-full"
            />
            <ScrollView className="grow">
              {legacyData ? (
                <>
                  <RelistenText className="mb-2">
                    <Text className="font-bold">
                      You can now migrate your favorites and offlined shows from the previous
                      version of the app!
                    </Text>
                  </RelistenText>
                  <RelistenText className="mb-4">
                    By pressing the &ldquo;Migrate data&rdquo; button below, all your prior
                    favorites will be migrated and joined in with any existing favorites you&apos;ve
                    made in the new app.{' '}
                    <RelistenText className="font-bold">
                      You need an Internet connection to perform this migration.
                    </RelistenText>{' '}
                    If you don&apos;t have an Internet connection, you can still use the app, just
                    press the &ldquo;Later&rdquo; button below to dismiss this message and migrate
                    later from the Relisten tab.
                  </RelistenText>
                  <RelistenText className="font-bold">
                    Legacy data that will be migrated
                  </RelistenText>
                  <RelistenText>{legacyData.artistUuids.length} Favorited artists</RelistenText>
                  <RelistenText>{legacyData.showUuids.length} Favorited shows</RelistenText>
                  <RelistenText>{legacyData.sources.length} Favorited sources</RelistenText>
                  <RelistenText>
                    {legacyData.offlineFilenames.length} Downloaded tracks
                  </RelistenText>
                  {migrationProgress.length > 0 && (
                    <>
                      <RelistenText className="mt-4 font-bold">Migration progress</RelistenText>
                      <RelistenText className="whitespace-pre-wrap">
                        {migrationProgress}
                      </RelistenText>
                    </>
                  )}
                </>
              ) : (
                <View className="flex-1 items-center justify-center">
                  <ActivityIndicator size="large" color="white" />
                </View>
              )}
            </ScrollView>
            <View className="pt-4">
              <Flex className="w-full justify-stretch pt-4">
                <View className="basis-1/2 pr-1">
                  <RelistenButton
                    onPress={() => clearModal({ markAsSeen: true })}
                    disabled={migrating}
                  >
                    Later
                  </RelistenButton>
                </View>
                <View className="flex basis-1/2 flex-row items-stretch justify-stretch pl-1">
                  <RelistenButton
                    onPress={() => migrateLegacyData()}
                    className="flex-1 bg-green-600"
                    disabled={migrating}
                  >
                    Migrate data
                  </RelistenButton>
                </View>
              </Flex>
            </View>
          </Flex>
        </Flex>
      </Modal>
    </>
  );
}
