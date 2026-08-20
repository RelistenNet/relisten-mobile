import { View } from 'react-native';
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
  ACTIVE_CATALOG_QUERY,
  readRetainedCatalogObject,
} from '@/relisten/realm/catalog_retirement';

export type SourceMembershipPolicy =
  | { mode: 'active' }
  | {
      mode: 'retained';
      accessSite: string;
    };

function sortSetsByIndex(sets: Iterable<SourceSet>): SourceSet[] {
  return Array.from(sets).sort((a, b) => a.index - b.index);
}

function sortTracksByPosition(tracks: Iterable<SourceTrack>): SourceTrack[] {
  return Array.from(tracks).sort((a, b) => a.trackPosition - b.trackPosition);
}

export function sourceSetsForSource(
  source: Source,
  membershipPolicy: SourceMembershipPolicy
): SourceSet[] {
  const sourceSets =
    membershipPolicy.mode === 'active'
      ? source.sourceSets.filtered(ACTIVE_CATALOG_QUERY)
      : source.sourceSets;

  return sortSetsByIndex(sourceSets).flatMap((sourceSet) => {
    if (membershipPolicy.mode === 'active') {
      return [sourceSet];
    }

    const retainedSourceSet = readRetainedCatalogObject(
      sourceSet,
      `${membershipPolicy.accessSite}.source-set`
    );
    return retainedSourceSet ? [retainedSourceSet] : [];
  });
}

function sourceTracksForSet(
  sourceSet: SourceSet,
  membershipPolicy: SourceMembershipPolicy
): SourceTrack[] {
  const sourceTracks =
    membershipPolicy.mode === 'active'
      ? sourceSet.sourceTracks.filtered(ACTIVE_CATALOG_QUERY)
      : sourceSet.sourceTracks;

  return sortTracksByPosition(sourceTracks).flatMap((sourceTrack) => {
    if (membershipPolicy.mode === 'active') {
      return [sourceTrack];
    }

    const retainedSourceTrack = readRetainedCatalogObject(
      sourceTrack,
      `${membershipPolicy.accessSite}.source-track`
    );
    return retainedSourceTrack ? [retainedSourceTrack] : [];
  });
}

export function sourceTracksForSource(
  source: Source,
  membershipPolicy: SourceMembershipPolicy
): SourceTrack[] {
  return sourceSetsForSource(source, membershipPolicy).flatMap((sourceSet) =>
    sourceTracksForSet(sourceSet, membershipPolicy)
  );
}

interface SourceSetsProps {
  source: Source;
  playShow: PlayShow;
  membershipPolicy: SourceMembershipPolicy;
}

export const SourceSets = ({ source, playShow, membershipPolicy }: SourceSetsProps) => {
  const sourceSets = sourceSetsForSource(source, membershipPolicy);

  return (
    <View>
      {sourceSets.map((sourceSet) => (
        <SourceSetComponent
          key={sourceSet.uuid}
          sourceSet={sourceSet}
          playShow={playShow}
          showHeader={sourceSets.length > 1}
          membershipPolicy={membershipPolicy}
        />
      ))}
      <View className="px-4">
        <ItemSeparator />
      </View>
    </View>
  );
};

interface SourceSetProps {
  sourceSet: SourceSet;
  playShow: PlayShow;
  showHeader: boolean;
  membershipPolicy: SourceMembershipPolicy;
}

export const SourceSetComponent = ({
  sourceSet,
  playShow,
  showHeader,
  membershipPolicy,
}: SourceSetProps) => {
  const userSettings = useUserSettings();
  const isOfflineTab = useIsOfflineTab();
  const queueOfflineOnly =
    isOfflineTab || userSettings.offlineModeWithDefault() === OfflineModeSetting.AlwaysOffline;
  const sourceTracks = sourceTracksForSet(sourceSet, membershipPolicy);

  return (
    <View>
      {showHeader && <SectionHeader title={sourceSet.name} />}
      {sourceTracks.map((t, idx) => {
        const playable = queueOfflineOnly ? t.playable(false) : true;

        return (
          <SourceTrackComponent
            key={t.uuid}
            sourceTrack={t}
            isLastTrackInSet={idx == sourceTracks.length - 1}
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
