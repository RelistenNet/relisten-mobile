import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { RelistenText } from '@/relisten/components/relisten_text';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { useRealm } from '@/relisten/realm/schema';
import { removeEntry, removeSegment } from '@/relisten/playlists/playlist_actions';
import {
  type DisplayItem,
  type DropSlot,
  type EditItem,
  type EditMetrics,
  type LinkPosition,
  railFor,
} from '@/relisten/playlists/playlist_drag_slots';
import type {
  PlaylistLayout,
  PlaylistRowEntry,
  PlaylistRowGroup,
} from '@/relisten/playlists/playlist_hooks';
import {
  entryTitle,
  linkedEntriesLabel,
  markdownPreview,
} from '@/relisten/playlists/playlist_format';
import {
  type GuideTextPlace,
  type GuideTextTarget,
  openGuideTextEditor,
} from '@/relisten/playlists/guide/guide_text_navigation';
import { GroupMenu, TrackMenu } from '@/relisten/playlists/ui/playlist_menus';
import { LinkRail } from '@/relisten/playlists/ui/link_rail';
import { showLine } from '@/relisten/playlists/ui/playlist_rows';
import { removedMessage, toastEdit } from '@/relisten/playlists/ui/playlist_toast';

/**
 * The rows of the playlist in edit mode: tracks, text blocks, group intros,
 * link lines and the drop placeholder. `PlaylistEditList` lays them out and
 * drags them; each row here only draws itself and offers its own actions.
 */

/** The handle column on the right of every row; a touch that starts here starts a drag. */
export const HANDLE_WIDTH = 48;

export type EntryItem = Extract<EditItem, { kind: 'track' }>;

export function EditListRow({
  item,
  next,
  metrics,
  playlistId,
  layout,
  settlingRow,
}: {
  item: DisplayItem;
  next: DisplayItem | undefined;
  metrics: EditMetrics;
  playlistId: string;
  layout: PlaylistLayout;
  settlingRow: EditItem | undefined;
}) {
  const rail = railFor(item, next);

  switch (item.kind) {
    case 'lead':
      return <View style={{ height: item.height }} />;
    case 'gap':
      return (
        <PlaceholderRow slot={item.slot} rail={rail} metrics={metrics} settlingRow={settlingRow} />
      );
    case 'link':
      return (
        <LinkLineRow
          item={item}
          rail={rail}
          metrics={metrics}
          playlistId={playlistId}
          layout={layout}
        />
      );
    case 'description':
      return (
        <DescriptionRow group={item.group} rail={rail} metrics={metrics} playlistId={playlistId} />
      );
    case 'prose':
      return <ProseRow group={item.group} rail={rail} metrics={metrics} playlistId={playlistId} />;
    case 'collapsed':
      return (
        <View style={{ height: metrics.trackHeight }}>
          <LinkRail link={rail} active={false} />
          <RowContent item={item} metrics={metrics} />
        </View>
      );
    case 'track':
      return (
        <EntryRow
          item={item}
          rail={rail}
          metrics={metrics}
          playlistId={playlistId}
          layout={layout}
        />
      );
  }
}

/** The guide text editor, opened at a place in this playlist. */
function useEditGuideText(playlistId: string) {
  const router = useRouter();
  return (place: GuideTextPlace) =>
    openGuideTextEditor(router, { ...place, playlistId } as GuideTextTarget);
}

function PlaceholderRow({
  slot,
  rail,
  metrics,
  settlingRow,
}: {
  slot: DropSlot;
  rail: LinkPosition | undefined;
  metrics: EditMetrics;
  settlingRow: EditItem | undefined;
}) {
  return (
    <View style={{ height: metrics.trackHeight }}>
      <LinkRail link={rail} active />
      {settlingRow ? (
        <RowContent item={settlingRow} metrics={metrics} />
      ) : (
        <View style={[styles.placeholder, slot.inLink && styles.placeholderInLink]}>
          {slot.label && (
            <RelistenText
              className="text-sm font-semibold text-relisten-blue-300"
              numberOfLines={1}
              selectable={false}
            >
              {slot.label}
            </RelistenText>
          )}
        </View>
      )}
    </View>
  );
}

function LinkLineRow({
  item,
  rail,
  metrics,
  playlistId,
  layout,
}: {
  item: Extract<EditItem, { kind: 'link' }>;
  rail: LinkPosition | undefined;
  metrics: EditMetrics;
  playlistId: string;
  layout: PlaylistLayout;
}) {
  const label = linkedEntriesLabel(item.group.entries);
  return (
    <View style={{ height: metrics.linkHeight }} className="flex-row items-center">
      <LinkRail link={rail} active={false} />
      <View className="w-12" />
      <GroupMenu
        playlistId={playlistId}
        layout={layout}
        group={item.group}
        style={{ flex: 1, minWidth: 0, alignSelf: 'stretch' }}
      >
        <View className="h-full flex-1 justify-center" accessibilityRole="button">
          <RelistenText className="text-sm text-gray-400" numberOfLines={1} selectable={false}>
            {label}
          </RelistenText>
        </View>
      </GroupMenu>
      <DragHandle label={label} />
    </View>
  );
}

/**
 * A framed group's description: tapping edits it. It has no handle: a linked
 * group moves by its link line, and dragging a described single track takes
 * the track out and leaves the description as a text-only group.
 */
function DescriptionRow({
  group,
  rail,
  metrics,
  playlistId,
}: {
  group: PlaylistRowGroup;
  rail: LinkPosition | undefined;
  metrics: EditMetrics;
  playlistId: string;
}) {
  const editText = useEditGuideText(playlistId);
  return (
    <View style={{ height: metrics.descriptionHeight }} className="flex-row items-center">
      <LinkRail link={rail} active={false} />
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Edit intro"
        className="h-full min-w-0 flex-1 justify-center pl-12"
        style={{ paddingRight: HANDLE_WIDTH }}
        onPress={() => editText({ kind: 'segment', segmentId: group.segment.segmentId })}
      >
        <RelistenText className="text-sm italic text-gray-300" numberOfLines={1} selectable={false}>
          {groupPreview(group)}
        </RelistenText>
      </TouchableOpacity>
    </View>
  );
}

/** A group with only text: one row that edits on tap, removes, and drags as a group. */
function ProseRow({
  group,
  rail,
  metrics,
  playlistId,
}: {
  group: PlaylistRowGroup;
  rail: LinkPosition | undefined;
  metrics: EditMetrics;
  playlistId: string;
}) {
  const realm = useRealm();
  const editText = useEditGuideText(playlistId);
  const segmentId = group.segment.segmentId;
  const remove = () =>
    toastEdit(realm, playlistId, removeSegment(realm, playlistId, segmentId), 'Removed text');

  return (
    <View style={{ height: metrics.trackHeight }} className="flex-row items-center">
      <LinkRail link={rail} active={false} />
      <RemoveButton label="Remove text" onRemove={remove} />
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Edit text"
        className="h-full min-w-0 flex-1 justify-center"
        onPress={() => editText({ kind: 'segment', segmentId })}
      >
        <PreviewLines title={groupPreview(group)} subtitle="Text" />
      </TouchableOpacity>
      <DragHandle label="text" />
    </View>
  );
}

/** A track, or a text block, which edits on tap instead of opening the track menu. */
function EntryRow({
  item,
  rail,
  metrics,
  playlistId,
  layout,
}: {
  item: EntryItem;
  rail: LinkPosition | undefined;
  metrics: EditMetrics;
  playlistId: string;
  layout: PlaylistLayout;
}) {
  const realm = useRealm();
  const editText = useEditGuideText(playlistId);
  const { row, group } = item;
  const isText = row.status === 'text';
  const title = entryTitle(row);
  const remove = () =>
    toastEdit(
      realm,
      playlistId,
      removeEntry(realm, playlistId, row.entry.entryId),
      removedMessage(row, group)
    );
  const body = { flex: 1, minWidth: 0, alignSelf: 'stretch' } as const;

  return (
    <View style={{ height: metrics.trackHeight }} className="flex-row items-center">
      <LinkRail link={rail} active={false} />
      <RemoveButton label={`Remove ${title}`} onRemove={remove} />
      {isText ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Edit note"
          style={body}
          onPress={() => editText({ kind: 'entry', entryId: row.entry.entryId })}
        >
          <EntryText item={item} />
        </TouchableOpacity>
      ) : (
        <TrackMenu playlistId={playlistId} layout={layout} row={row} style={body}>
          <EntryText item={item} />
        </TrackMenu>
      )}
      <DragHandle label={title} />
    </View>
  );
}

/** The non-interactive body of a row: under the finger, in a folded list, and while settling. */
export function RowContent({
  item,
  metrics,
  badge,
}: {
  item: EditItem;
  metrics: EditMetrics;
  /** What dropping here would do, shown on the row under the finger. */
  badge?: string;
}) {
  if (item.kind === 'track') {
    return (
      <View style={{ height: metrics.trackHeight }} className="flex-row items-center">
        <View className="w-12" />
        <EntryText item={item} />
        <View className="w-3" />
        {badge && (
          <RelistenText
            className="max-w-[45%] text-sm font-semibold text-relisten-blue-300"
            numberOfLines={1}
            selectable={false}
          >
            {badge}
          </RelistenText>
        )}
        <View className="w-4" />
      </View>
    );
  }
  if (item.kind !== 'collapsed') {
    return null;
  }

  const { title, subtitle } = collapsedLines(item.group);
  return (
    <View style={{ height: metrics.trackHeight }} className="justify-center pl-12 pr-11">
      <PreviewLines title={title} subtitle={subtitle} />
    </View>
  );
}

/** A whole group as two lines, for the folded list while a group is dragged. */
function collapsedLines(group: PlaylistRowGroup): {
  title: string;
  subtitle: string;
} {
  const { entries } = group;
  if (entries.length === 0) {
    return { title: groupPreview(group), subtitle: 'Text' };
  }
  if (entries.length > 1) {
    return {
      title: linkedEntriesLabel(entries),
      subtitle: entries.map(entryTitle).join(', '),
    };
  }
  const row = entries[0];
  return row.status === 'text'
    ? { title: entryPreview(row), subtitle: 'Note' }
    : { title: entryTitle(row), subtitle: showLine(row) };
}

function EntryText({ item }: { item: EntryItem }) {
  const { row } = item;
  if (row.status === 'text') {
    return (
      <View className="min-w-0 flex-1 justify-center">
        <PreviewLines title={entryPreview(row)} subtitle="Note" />
      </View>
    );
  }

  const subtitle = showLine(row);
  return (
    <View className="min-w-0 flex-1 justify-center">
      <RelistenText className="text-lg" numberOfLines={1} selectable={false}>
        {row.sourceTrack ? entryTitle(row) : 'Track'}
      </RelistenText>
      {subtitle !== '' && (
        <RelistenText className="text-sm text-gray-400" numberOfLines={1} selectable={false}>
          {subtitle}
        </RelistenText>
      )}
    </View>
  );
}

function PreviewLines({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <RelistenText className="text-lg" numberOfLines={1} selectable={false}>
        {title}
      </RelistenText>
      {subtitle !== '' && (
        <RelistenText className="text-sm text-gray-400" numberOfLines={1} selectable={false}>
          {subtitle}
        </RelistenText>
      )}
    </>
  );
}

const groupPreview = (group: PlaylistRowGroup) =>
  markdownPreview(group.descriptionMarkdown ?? group.segment.description);

const entryPreview = (row: PlaylistRowEntry) =>
  markdownPreview(row.descriptionMarkdown ?? row.entry.description);

function RemoveButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-11 w-12 items-center justify-center"
      onPress={onRemove}
    >
      <Ionicons name="remove-circle" size={22} color="#e5484d" />
    </TouchableOpacity>
  );
}

/**
 * The ≡ in a row's handle column. The list's gesture does the dragging; this
 * only marks the spot. VoiceOver users move rows from the row's menu.
 */
function DragHandle({ label }: { label: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`Reorder ${label}`}
      accessibilityHint="Use the row's menu to move it without dragging."
      style={{ width: HANDLE_WIDTH }}
      className="h-11 items-center justify-center"
    >
      <MaterialIcons color="rgba(255, 255, 255, 0.62)" name="drag-handle" size={24} />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    marginVertical: 6,
    marginHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: RelistenBlue[400],
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  placeholderInLink: { marginLeft: 20 },
});
