import { View } from 'react-native';
import Realm from 'realm';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { Source } from '@/relisten/realm/models/source';
import {
  type PlayShow,
  SourceTrackActionsMenu,
} from '@/relisten/player/ui/source_track_actions_menu';
import { SourceSet } from '@/relisten/realm/models/source_set';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { SectionHeader } from '@/relisten/components/section_header';
import { SourceTrackComponent } from '@/relisten/components/source/source_track_component';
import { useUserSettings } from '@/relisten/realm/models/user_settings_repo';
import { OfflineModeSetting } from '@/relisten/realm/models/user_settings';
import { useIsOfflineTab } from '@/relisten/util/routes';
import {
  canUseNetworkAudioForTargets,
  hasPlayableLocalFile,
  useUnavailableCatalogTargetKeys,
} from '@/relisten/library/catalog_audio_availability';

function sortSetsByIndex(sets: Realm.List<SourceSet> | SourceSet[]): SourceSet[] {
  return Array.from(sets).sort((a, b) => a.index - b.index);
}

function sortTracksByPosition(tracks: Realm.List<SourceTrack> | SourceTrack[]): SourceTrack[] {
  return Array.from(tracks).sort((a, b) => a.trackPosition - b.trackPosition);
}

interface SourceSetsProps {
  source: Source;
  playShow: PlayShow;
}

export const SourceSets = ({ source, playShow }: SourceSetsProps) => {
  const sortedSets = sortSetsByIndex(source.sourceSets);
  const unavailableTargetKeys = useUnavailableCatalogTargetKeys();

  return (
    <View>
      {sortedSets.map((s) => (
        <SourceSetComponent
          key={s.uuid}
          sourceSet={s}
          source={source}
          playShow={playShow}
          unavailableTargetKeys={unavailableTargetKeys}
        />
      ))}
      <View className="px-4">
        <ItemSeparator />
      </View>
    </View>
  );
};

interface SourceSetProps {
  source: Source;
  sourceSet: SourceSet;
  playShow: PlayShow;
  unavailableTargetKeys: ReadonlySet<string>;
}

export const SourceSetComponent = ({
  source,
  sourceSet,
  playShow,
  unavailableTargetKeys,
}: SourceSetProps) => {
  const userSettings = useUserSettings();
  const isOfflineTab = useIsOfflineTab();
  const queueOfflineOnly =
    isOfflineTab || userSettings.offlineModeWithDefault() === OfflineModeSetting.AlwaysOffline;

  return (
    <View>
      {source.sourceSets.length > 1 && <SectionHeader title={sourceSet.name} />}
      {sortTracksByPosition(sourceSet.sourceTracks).map((t, idx) => {
        const hasLocalFile = hasPlayableLocalFile(t);
        const networkPlaybackAllowed = canUseNetworkAudioForTargets(unavailableTargetKeys, t);
        const playable = queueOfflineOnly ? hasLocalFile : hasLocalFile || networkPlaybackAllowed;

        return (
          <SourceTrackComponent
            key={t.uuid}
            sourceTrack={t}
            isLastTrackInSet={idx == sourceSet.sourceTracks.length - 1}
            onPress={playable ? playShow : undefined}
            actions={
              <SourceTrackActionsMenu
                sourceTrack={t}
                playShow={playShow}
                networkPlaybackAllowed={networkPlaybackAllowed}
              />
            }
            disabled={!playable}
          />
        );
      })}
    </View>
  );
};
