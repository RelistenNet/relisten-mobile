import Realm from 'realm';
import {
  orderedGroups,
  type PlaylistGroup,
  type PlaylistOperation,
  type PlaylistSnapshot,
} from '@/relisten/playlists/playlist_operations';

export { orderedGroups, type PlaylistGroup };
import {
  appendSegment,
  applyOperation,
  newSegmentId,
  readPlaylistSnapshot,
  restoreSnapshot,
} from '@/relisten/playlists/playlist_repository';

/**
 * User-facing edits, expressed as engine operations. Each edit records an undo
 * snapshot first; menus, drags and the add flow all come through here, so every
 * edit can be undone the same way.
 */

// region Undo

const MAX_UNDO = 5;
const undoStacks = new Map<string, PlaylistSnapshot[]>();

function pushUndo(playlistId: string, snapshot: PlaylistSnapshot) {
  const stack = undoStacks.get(playlistId) ?? [];
  stack.push(snapshot);
  if (stack.length > MAX_UNDO) {
    stack.shift();
  }
  undoStacks.set(playlistId, stack);
}

/** Restores the playlist to before its most recent edit. Returns false when there is nothing to undo. */
export function undoLastEdit(realm: Realm, playlistId: string): boolean {
  const snapshot = undoStacks.get(playlistId)?.pop();
  if (!snapshot) {
    return false;
  }
  restoreSnapshot(realm, playlistId, snapshot);
  return true;
}

export function canUndo(playlistId: string) {
  return (undoStacks.get(playlistId)?.length ?? 0) > 0;
}

/** Undo history lasts for one visit to a playlist. */
export function clearUndo(playlistId: string) {
  undoStacks.delete(playlistId);
}

// endregion

/** Applies operations and records an undo snapshot only if one of them changed something. */
function edit(realm: Realm, playlistId: string, operations: PlaylistOperation[]): boolean {
  const before = readPlaylistSnapshot(realm, playlistId);
  let changed = false;
  for (const operation of operations) {
    changed = applyOperation(realm, playlistId, operation).status === 'applied' || changed;
  }
  if (changed) {
    pushUndo(playlistId, before);
  }
  return changed;
}

function locate(snapshot: PlaylistSnapshot, entryId: string) {
  const groups = orderedGroups(snapshot);
  const groupIndex = groups.findIndex((g) => g.entries.some((e) => e.entryId === entryId));
  if (groupIndex < 0) {
    return undefined;
  }
  const group = groups[groupIndex];
  const index = group.entries.findIndex((e) => e.entryId === entryId);
  return { groups, groupIndex, group, index, isSingle: group.entries.length === 1 };
}

// region Adding

/** Adds tracks at the end: as one group when `together`, otherwise each on its own. */
export function addTracks(realm: Realm, playlistId: string, trackIds: string[], together: boolean) {
  if (trackIds.length === 0) {
    return;
  }
  edit(
    realm,
    playlistId,
    together ? [appendSegment(trackIds)] : trackIds.map((trackId) => appendSegment([trackId]))
  );
}

// endregion

// region Track moves

export type MoveDirection = 'up' | 'down';

/**
 * One step: inside a group, past the neighboring track; on its own, past the
 * neighboring group, hopping over it whole.
 */
export function moveEntryStep(
  realm: Realm,
  playlistId: string,
  entryId: string,
  direction: MoveDirection
) {
  const at = locate(readPlaylistSnapshot(realm, playlistId), entryId);
  if (!at) return;

  if (!at.isSingle) {
    const neighbor = at.group.entries[at.index + (direction === 'up' ? -1 : 1)];
    if (!neighbor) return;
    edit(realm, playlistId, [
      {
        type: 'move_entry',
        entryId,
        destination:
          direction === 'up'
            ? { segmentId: at.group.segment.segmentId, beforeEntryId: neighbor.entryId }
            : { segmentId: at.group.segment.segmentId, afterEntryId: neighbor.entryId },
      },
    ]);
    return;
  }

  moveSegmentStep(realm, playlistId, at.group.segment.segmentId, direction);
}

export function canMoveEntry(
  snapshot: PlaylistSnapshot,
  entryId: string,
  direction: MoveDirection
) {
  const at = locate(snapshot, entryId);
  if (!at) return false;
  if (!at.isSingle) {
    return direction === 'up' ? at.index > 0 : at.index < at.group.entries.length - 1;
  }
  return direction === 'up' ? at.groupIndex > 0 : at.groupIndex < at.groups.length - 1;
}

export function moveEntryToEdge(
  realm: Realm,
  playlistId: string,
  entryId: string,
  edge: 'top' | 'bottom'
) {
  const at = locate(readPlaylistSnapshot(realm, playlistId), entryId);
  if (!at) return;

  if (at.isSingle) {
    moveSegmentToEdge(realm, playlistId, at.group.segment.segmentId, edge);
    return;
  }

  const first = at.groups[0].segment.segmentId;
  const last = at.groups[at.groups.length - 1].segment.segmentId;
  edit(realm, playlistId, [
    {
      type: 'move_entry',
      entryId,
      destination:
        edge === 'top'
          ? { newSegmentId: newSegmentId(), beforeSegmentId: first }
          : { newSegmentId: newSegmentId(), afterSegmentId: last },
    },
  ]);
}

/** Takes a track out of its group; it lands on its own right after the group. */
export function takeOutOfGroup(realm: Realm, playlistId: string, entryId: string) {
  const at = locate(readPlaylistSnapshot(realm, playlistId), entryId);
  if (!at || at.isSingle) return;
  edit(realm, playlistId, [
    {
      type: 'move_entry',
      entryId,
      destination: { newSegmentId: newSegmentId(), afterSegmentId: at.group.segment.segmentId },
    },
  ]);
}

/** The group directly above a track on its own, which "Keep with…" would join. */
export function groupAbove(snapshot: PlaylistSnapshot, entryId: string): PlaylistGroup | undefined {
  const at = locate(snapshot, entryId);
  if (!at || !at.isSingle || at.groupIndex === 0) return undefined;
  return at.groups[at.groupIndex - 1];
}

/** Joins a track on its own onto the end of the group (or single track) directly above it. */
export function keepWithAbove(realm: Realm, playlistId: string, entryId: string) {
  const above = groupAbove(readPlaylistSnapshot(realm, playlistId), entryId);
  if (!above) return;
  edit(realm, playlistId, [
    {
      type: 'move_entry',
      entryId,
      destination: {
        segmentId: above.segment.segmentId,
        afterEntryId: above.entries[above.entries.length - 1].entryId,
      },
    },
  ]);
}

export function removeEntry(realm: Realm, playlistId: string, entryId: string) {
  edit(realm, playlistId, [{ type: 'delete_entry', entryId }]);
}

// endregion

// region Group moves

export function moveSegmentStep(
  realm: Realm,
  playlistId: string,
  segmentId: string,
  direction: MoveDirection
) {
  const groups = orderedGroups(readPlaylistSnapshot(realm, playlistId));
  const index = groups.findIndex((g) => g.segment.segmentId === segmentId);
  const neighbor = groups[index + (direction === 'up' ? -1 : 1)];
  if (index < 0 || !neighbor) return;

  edit(realm, playlistId, [
    direction === 'up'
      ? { type: 'move_segment', segmentId, beforeSegmentId: neighbor.segment.segmentId }
      : { type: 'move_segment', segmentId, afterSegmentId: neighbor.segment.segmentId },
  ]);
}

export function canMoveSegment(
  snapshot: PlaylistSnapshot,
  segmentId: string,
  direction: MoveDirection
) {
  const groups = orderedGroups(snapshot);
  const index = groups.findIndex((g) => g.segment.segmentId === segmentId);
  return index >= 0 && (direction === 'up' ? index > 0 : index < groups.length - 1);
}

export function moveSegmentToEdge(
  realm: Realm,
  playlistId: string,
  segmentId: string,
  edge: 'top' | 'bottom'
) {
  const groups = orderedGroups(readPlaylistSnapshot(realm, playlistId));
  if (groups.length < 2) return;
  edit(realm, playlistId, [
    edge === 'top'
      ? { type: 'move_segment', segmentId, beforeSegmentId: groups[0].segment.segmentId }
      : {
          type: 'move_segment',
          segmentId,
          afterSegmentId: groups[groups.length - 1].segment.segmentId,
        },
  ]);
}

/** Puts every track of a group on its own, keeping their order. */
export function ungroup(realm: Realm, playlistId: string, segmentId: string) {
  const group = orderedGroups(readPlaylistSnapshot(realm, playlistId)).find(
    (g) => g.segment.segmentId === segmentId
  );
  if (!group || group.entries.length < 2) return;

  const operations: PlaylistOperation[] = [];
  let after = segmentId;
  for (const entry of group.entries.slice(1)) {
    const next = newSegmentId();
    operations.push({
      type: 'move_entry',
      entryId: entry.entryId,
      destination: { newSegmentId: next, afterSegmentId: after },
    });
    after = next;
  }
  edit(realm, playlistId, operations);
}

export function removeSegment(realm: Realm, playlistId: string, segmentId: string) {
  edit(realm, playlistId, [{ type: 'delete_segment', segmentId }]);
}

// endregion

// region Drops

/** Where a dragged track lands, as decided by the edit list from its neighboring rows. */
export type TrackDrop =
  | { kind: 'in_group'; segmentId: string; afterEntryId?: string; beforeEntryId?: string }
  | { kind: 'not_in_group'; afterSegmentId?: string; beforeSegmentId?: string };

export function dropTrack(realm: Realm, playlistId: string, entryId: string, drop: TrackDrop) {
  const at = locate(readPlaylistSnapshot(realm, playlistId), entryId);
  if (!at) return;

  if (drop.kind === 'in_group') {
    edit(realm, playlistId, [
      {
        type: 'move_entry',
        entryId,
        destination: {
          segmentId: drop.segmentId,
          afterEntryId: drop.afterEntryId,
          beforeEntryId: drop.beforeEntryId,
        },
      },
    ]);
    return;
  }

  // A track already on its own moves its whole segment, keeping the segment's ID.
  edit(realm, playlistId, [
    at.isSingle
      ? {
          type: 'move_segment',
          segmentId: at.group.segment.segmentId,
          afterSegmentId: drop.afterSegmentId,
          beforeSegmentId: drop.beforeSegmentId,
        }
      : {
          type: 'move_entry',
          entryId,
          destination: {
            newSegmentId: newSegmentId(),
            afterSegmentId: drop.afterSegmentId,
            beforeSegmentId: drop.beforeSegmentId,
          },
        },
  ]);
}

export function dropSegment(
  realm: Realm,
  playlistId: string,
  segmentId: string,
  anchors: { afterSegmentId?: string; beforeSegmentId?: string }
) {
  edit(realm, playlistId, [{ type: 'move_segment', segmentId, ...anchors }]);
}

// endregion
