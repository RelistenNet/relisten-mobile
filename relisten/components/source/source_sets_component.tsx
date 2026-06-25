import { View } from 'react-native';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { Source } from '@/relisten/realm/models/source';
import {
  type PlayShow,
  SourceTrackActionsMenu,
} from '@/relisten/player/ui/source_track_actions_menu';
import { SourceSet } from '@/relisten/realm/models/source_set';
import { SectionHeader } from '@/relisten/components/section_header';
import { SourceTrackComponent } from '@/relisten/components/source/source_track_component';
import { useUserSettings } from '@/relisten/realm/models/user_settings_repo';
import { OfflineModeSetting } from '@/relisten/realm/models/user_settings';
import { useIsOfflineTab } from '@/relisten/util/routes';

interface SourceSetsProps {
  source: Source;
  playShow: PlayShow;
}

export const SourceSets = ({ source, playShow }: SourceSetsProps) => {
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
};

interface SourceSetProps {
  source: Source;
  sourceSet: SourceSet;
  playShow: PlayShow;
}

export const SourceSetComponent = ({ source, sourceSet, playShow }: SourceSetProps) => {
  const userSettings = useUserSettings();
  const isOfflineTab = useIsOfflineTab();
  const queueOfflineOnly =
    isOfflineTab || userSettings.offlineModeWithDefault() === OfflineModeSetting.AlwaysOffline;

  return (
    <View>
      {source.sourceSets.length > 1 && <SectionHeader title={sourceSet.name} />}
      {sourceSet.sourceTracks.map((t, idx) => {
        const playable = queueOfflineOnly ? t.playable(false) : true;

        return (
          <SourceTrackComponent
            key={t.uuid}
            sourceTrack={t}
            isLastTrackInSet={idx == sourceSet.sourceTracks.length - 1}
            onPress={playable ? playShow : undefined}
            actions={
              playable ? <SourceTrackActionsMenu sourceTrack={t} playShow={playShow} /> : null
            }
            disabled={!playable}
          />
        );
      })}
    </View>
  );
};
