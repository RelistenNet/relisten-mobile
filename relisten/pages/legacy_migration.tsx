import { useEffect, useState } from 'react';
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
import Flex from '@/relisten/components/flex';
import { RelistenText } from '@/relisten/components/relisten_text';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { log } from '@/relisten/util/logging';
import {
  FavoritedSource,
  LegacyDatabaseContents,
  legacyDatabaseExists,
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
import { Directory, File } from 'expo-file-system';
import { realm, useRealm } from '@/relisten/realm/schema';
import {
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
  SourceTrackOfflineInfoType,
} from '@/relisten/realm/models/source_track_offline_info';
import { OFFLINE_DIRECTORY } from '@/relisten/realm/models/source_track';
import { NetworkBackedBehaviorExecutor } from '@/relisten/realm/network_backed_behavior';
import { useRelistenApi } from '@/relisten/api/context';
import { yearsNetworkBackedModelArrayBehavior } from '@/relisten/realm/models/year_repo';
import RelistenWhite from '@/assets/relisten_white.png';

const logger = log.extend('LegacyDataMigrationModal');

export const SEEN_MODAL_KEY = '@relistenapp/seen-v6-migration-modal/v2';

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
          const legacyFile = new File(filename);

          if (!legacyFile.exists) {
            continue;
          }

          try {
            new Directory(OFFLINE_DIRECTORY).create({ intermediates: true, idempotent: true });
          } catch {
            /* no extra work to do */
          }

          // Move the file first so that we don't show offline UI when it isn't available
          const destinationFile = new File(sourceTrack.downloadedFileLocation());
          if (destinationFile.exists) {
            destinationFile.delete();
          }
          legacyFile.move(destinationFile);

          this.realm.write(() => {
            const newOfflineInfo = new SourceTrackOfflineInfo(realm!, {
              sourceTrackUuid: sourceTrack.uuid,
              queuedAt: new Date(),
              startedAt: new Date(),
              completedAt: new Date(),
              downloadedBytes: legacyFile.size,
              totalBytes: legacyFile.size,
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
      const yearsBehavior = yearsNetworkBackedModelArrayBehavior(
        this.realm,
        false,
        show.artistUuid
      );
      await NetworkBackedBehaviorExecutor.executeUntilMatches(yearsBehavior, this.api, (result) => {
        return (result.errors?.length ?? 0) > 0 || yearsBehavior.isLocalDataShowable(result.data);
      });

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
    const artistsBehavior = artistsNetworkBackedBehavior(this.realm, false, true);
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
  const [migrating, setMigrating] = useState(false);
  const [loadingLegacyData, setLoadingLegacyData] = useState(false);
  const [legacyData, setLegacyData] = useState<LegacyDatabaseContents | undefined>(undefined);
  const [migrationProgress, setMigrationProgress] = useState<string>('');
  const shouldMakeNetworkRequests = useShouldMakeNetworkRequests();
  const { apiClient } = useRelistenApi();
  const realm = useRealm();

  useEffect(() => {
    (async () => {
      const isIOS = Platform.OS === 'ios';

      if (!isIOS) {
        return;
      }

      const seenModalBefore = (await AsyncStorage.getItem(SEEN_MODAL_KEY)) === 'true';
      const hasNotDismissed = !seenModalBefore;
      const legacyDbExists = await legacyDatabaseExists();
      const eligibleForModal = legacyDbExists && hasNotDismissed && isIOS;

      if (forceShow || (eligibleForModal && shouldMakeNetworkRequests)) {
        setModalVisible(true);
      }
    })();
  }, [forceShow]);

  const loadLegacyData = async () => {
    setLoadingLegacyData(true);
    try {
      const data = await loadLegacyDatabaseContents();
      setLegacyData(data);
    } catch (error) {
      logger.error(`Failed to load legacy data: ${error}`);
      setMigrationProgress(`Error loading legacy data. Please try again later.\n\nError: ${error}`);
    } finally {
      setLoadingLegacyData(false);
    }
  };

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

    setTimeout(() => {
      setMigrating(false);
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
            <Image source={RelistenWhite} resizeMode="contain" className="mb-2 h-[28] w-full" />
            <ScrollView className="grow">
              <>
                <RelistenText className="mb-2">
                  <Text className="font-bold">
                    NEW AND UPDATED: You can now migrate your favorites and offlined shows from the
                    previous version of the app!
                  </Text>
                </RelistenText>
                <RelistenText className="mb-4">
                  By pressing the &ldquo;Migrate data&rdquo; button below, all your prior favorites
                  will be migrated and joined in with any existing favorites you&apos;ve made in the
                  new app.{' '}
                  <RelistenText className="font-bold">
                    You need an Internet connection to perform this migration.
                  </RelistenText>{' '}
                  If you don&apos;t have an Internet connection, you can still use the app, just
                  press the &ldquo;Later&rdquo; button below to dismiss this message and migrate
                  later from the Relisten tab.
                </RelistenText>
                {loadingLegacyData ? (
                  <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color="white" />
                    <RelistenText className="mt-4 text-center">Loading legacy data...</RelistenText>
                    <RelistenText className="mt-2 text-center text-sm opacity-75">
                      This may take a few seconds as we analyze your previous app data.
                    </RelistenText>
                  </View>
                ) : legacyData ? (
                  <>
                    <RelistenText className="font-bold">
                      Legacy data that will be migrated
                    </RelistenText>
                    <RelistenText>{legacyData.artistUuids.length} Favorited artists</RelistenText>
                    <RelistenText>{legacyData.showUuids.length} Favorited shows</RelistenText>
                    <RelistenText>{legacyData.sources.length} Favorited sources</RelistenText>
                    <RelistenText>
                      {legacyData.offlineFilenames.length} Downloaded tracks
                    </RelistenText>
                  </>
                ) : (
                  <RelistenButton onPress={loadLegacyData} className={'bg-green-600'}>
                    Load Legacy Data
                  </RelistenButton>
                )}
                {migrationProgress.length > 0 && (
                  <>
                    <RelistenText className="mt-4 font-bold">Migration progress</RelistenText>
                    <RelistenText className="whitespace-pre-wrap">{migrationProgress}</RelistenText>
                  </>
                )}
              </>
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
                    disabled={migrating || loadingLegacyData || !legacyData}
                  >
                    {loadingLegacyData ? 'Loading...' : 'Migrate data'}
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
