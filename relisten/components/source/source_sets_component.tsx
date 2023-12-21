import { View } from 'react-native';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { Source } from '@/relisten/realm/models/source';
import { PlayShow } from '@/relisten/player/ui/track_context_menu';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { SourceSet } from '@/relisten/realm/models/source_set';
import { SectionHeader } from '@/relisten/components/section_header';
import { SourceTrackComponent } from '@/relisten/components/source/source_track_component';

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
  return (
    <View>
      {source.sourceSets.length > 1 && <SectionHeader title={sourceSet.name} />}
      {sourceSet.sourceTracks.map((t, idx) => (
        <SourceTrackComponent
          key={t.uuid}
          sourceTrack={t}
          isLastTrackInSet={idx == sourceSet.sourceTracks.length - 1}
          onPress={playShow}
          onDotsPress={() => onDotsPress(t)}
        />
      ))}
    </View>
  );
};
