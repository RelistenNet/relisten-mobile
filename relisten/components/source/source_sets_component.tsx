import { Ionicons } from '@expo/vector-icons';
import { type ComponentRef, type Ref } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { RelistenBlue } from '@/relisten/relisten_blue';
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

function sortSetsByIndex(sets: Realm.List<SourceSet> | SourceSet[]): SourceSet[] {
  return Array.from(sets).sort((a, b) => a.index - b.index);
}

function sortTracksByPosition(tracks: Realm.List<SourceTrack> | SourceTrack[]): SourceTrack[] {
  return Array.from(tracks).sort((a, b) => a.trackPosition - b.trackPosition);
}

/** Checkbox selection of tracks, used to add some of a show's tracks to a playlist. */
export interface TrackSelection {
  selected: ReadonlySet<string>;
  toggle: (sourceTrackUuid: string) => void;
}

interface SourceSetsProps {
  source: Source;
  playShow: PlayShow;
  /** Present while selecting tracks. */
  selection?: TrackSelection;
  /** Starts selecting with this track checked, from a long press or the track's menu. */
  onStartSelection?: (sourceTrackUuid: string) => void;
  /** Files a search pointed at: highlighted, never played. */
  focusedTrackUuids?: ReadonlySet<string>;
  /** Attached to the first focused file in setlist order, to scroll it into view. */
  firstFocusedRowRef?: Ref<ComponentRef<typeof View>>;
}

export const SourceSets = ({
  source,
  playShow,
  selection,
  onStartSelection,
  focusedTrackUuids,
  firstFocusedRowRef,
}: SourceSetsProps) => {
  const sortedSets = sortSetsByIndex(source.sourceSets);
  const firstFocusedUuid = focusedTrackUuids
    ? sortedSets
        .flatMap((set) => sortTracksByPosition(set.sourceTracks))
        .find((track) => focusedTrackUuids.has(track.uuid))?.uuid
    : undefined;

  return (
    <View>
      {sortedSets.map((s) => (
        <SourceSetComponent
          key={s.uuid}
          sourceSet={s}
          source={source}
          playShow={playShow}
          selection={selection}
          onStartSelection={onStartSelection}
          focusedTrackUuids={focusedTrackUuids}
          firstFocusedUuid={firstFocusedUuid}
          firstFocusedRowRef={firstFocusedRowRef}
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
  selection?: TrackSelection;
  onStartSelection?: (sourceTrackUuid: string) => void;
  focusedTrackUuids?: ReadonlySet<string>;
  firstFocusedUuid?: string;
  firstFocusedRowRef?: Ref<ComponentRef<typeof View>>;
}

export const SourceSetComponent = ({
  source,
  sourceSet,
  playShow,
  selection,
  onStartSelection,
  focusedTrackUuids,
  firstFocusedUuid,
  firstFocusedRowRef,
}: SourceSetProps) => {
  const userSettings = useUserSettings();
  const isOfflineTab = useIsOfflineTab();
  const queueOfflineOnly =
    isOfflineTab || userSettings.offlineModeWithDefault() === OfflineModeSetting.AlwaysOffline;

  return (
    <View>
      {source.sourceSets.length > 1 && <SectionHeader title={sourceSet.name} />}
      {sortTracksByPosition(sourceSet.sourceTracks).map((t, idx) => {
        const playable = !queueOfflineOnly || t.offlineInfo?.isPlayableOffline() === true;

        if (selection) {
          const checked = selection.selected.has(t.uuid);
          return (
            <SourceTrackComponent
              key={t.uuid}
              sourceTrack={t}
              isLastTrackInSet={idx == sourceSet.sourceTracks.length - 1}
              onPress={() => selection.toggle(t.uuid)}
              // The row is the one checkbox screen readers see; the circle mirrors it.
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              actions={
                <TouchableOpacity
                  accessibilityElementsHidden
                  className="h-11 w-11 items-center justify-center"
                  importantForAccessibility="no"
                  onPress={() => selection.toggle(t.uuid)}
                >
                  <Ionicons
                    name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={checked ? RelistenBlue[400] : 'rgba(255,255,255,0.5)'}
                  />
                </TouchableOpacity>
              }
            />
          );
        }

        return (
          <SourceTrackComponent
            key={t.uuid}
            sourceTrack={t}
            isLastTrackInSet={idx == sourceSet.sourceTracks.length - 1}
            highlighted={focusedTrackUuids?.has(t.uuid)}
            rowRef={t.uuid === firstFocusedUuid ? firstFocusedRowRef : undefined}
            onPress={playable ? playShow : undefined}
            onLongPress={onStartSelection && (() => onStartSelection(t.uuid))}
            actions={
              <SourceTrackActionsMenu
                sourceTrack={t}
                playShow={playShow}
                onSelect={onStartSelection && (() => onStartSelection(t.uuid))}
              />
            }
            disabled={!playable}
          />
        );
      })}
    </View>
  );
};
