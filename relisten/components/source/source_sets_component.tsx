import { View } from 'react-native';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { Source } from '@/relisten/realm/models/source';
import { PlayShow } from '@/relisten/player/ui/track_context_menu';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { SourceSet } from '@/relisten/realm/models/source_set';
import { SectionHeader } from '@/relisten/components/section_header';
import { SourceTrackComponent } from '@/relisten/components/source/source_track_component';
import { useUserSettings } from '@/relisten/realm/models/user_settings_repo';
import { OfflineModeSetting } from '@/relisten/realm/models/user_settings';

interface SourceSetsProps {
  source: Source;
  playShow: PlayShow;
  onDotsPress: (sourceTrack: SourceTrack) => void;
}

export const SourceSets = ({ source, playShow, onDotsPress }: SourceSetsProps) => {
  return (
    <View>
      {source.sourceSets.map((s) => (
        <SourceSetComponent
          key={s.uuid}
          sourceSet={s}
          source={source}
          playShow={playShow}
          onDotsPress={onDotsPress}
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
  onDotsPress: (sourceTrack: SourceTrack) => void;
}

export const SourceSetComponent = ({
  source,
  sourceSet,
  playShow,
  onDotsPress,
}: SourceSetProps) => {
  const userSettings = useUserSettings();

  return (
    <View>
      {source.sourceSets.length > 1 && <SectionHeader title={sourceSet.name} />}
      {sourceSet.sourceTracks.map((t, idx) => {
        const playable =
          userSettings.offlineModeWithDefault() === OfflineModeSetting.AlwaysOffline
            ? t.playable(false)
            : true; // always try network requests unles we are forcibly offline

        return (
          <SourceTrackComponent
            key={t.uuid}
            sourceTrack={t}
            isLastTrackInSet={idx == sourceSet.sourceTracks.length - 1}
            onPress={playable ? playShow : undefined}
            onDotsPress={playable ? () => onDotsPress(t) : undefined}
            disabled={!playable}
          />
        );
      })}
    </View>
  );
};
