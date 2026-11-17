import Realm from 'realm';
import { Playlist } from '@/relisten/realm/models/playlists/playlist';
import {
  orderedGroups,
  type PlaylistGroup,
  type PlaylistOperation,
  type PlaylistSnapshot,
} from '@/relisten/playlists/playlist_operations';
import {
  appendSegment,
  applyOperations,
  newSegmentId,
  readPlaylistSnapshot,
  restoreSnapshot,
  withdrawEdit,
} from '@/relisten/playlists/playlist_repository';

/**
 * User-facing edits, expressed as engine operations. Each edit records an undo
 * snapshot first; menus, drags and the add flow all come through here, so every
 * edit can be undone the same way.
 */

// region Undo

/**
 * In-memory undo history: the last few snapshots for the most recently edited
 * playlists. It lives for the app session, so a toast's Undo still works after
 * leaving the playlist screen.
 */
const MAX_UNDO_PER_PLAYLIST = 5;
const MAX_PLAYLISTS_WITH_UNDO = 10;

/**
 * How to undo one edit. A device playlist restores its earlier snapshot. An
 * account playlist withdraws the edit's operations, which only works until
 * they are sent: the server never lets a deleted ID come back.
 */
type UndoStep =
  | { kind: 'snapshot'; snapshot: PlaylistSnapshot }
  | { kind: 'operations'; operationIds: string[] };

const undoStacks = new Map<string, UndoStep[]>();

function pushUndo(playlistId: string, step: UndoStep) {
  const stack = undoStacks.get(playlistId) ?? [];
  stack.push(step);
  if (stack.length > MAX_UNDO_PER_PLAYLIST) {
    stack.shift();
  }
  // Re-insert so Map order tracks recency, then drop the least recently edited.
  undoStacks.delete(playlistId);
  undoStacks.set(playlistId, stack);
  if (undoStacks.size > MAX_PLAYLISTS_WITH_UNDO) {
    undoStacks.delete(undoStacks.keys().next().value!);
  }
}

/**
 * Restores the playlist to before its most recent edit. Returns false when
 * there is nothing to undo, or the edit already reached the account.
 */
export function undoLastEdit(realm: Realm, playlistId: string): boolean {
  const step = undoStacks.get(playlistId)?.pop();
  if (!step) {
    return false;
  }
  if (step.kind === 'operations') {
    return withdrawEdit(realm, playlistId, step.operationIds);
  }
  restoreSnapshot(realm, playlistId, step.snapshot);
  return true;
}

// endregion

/**
 * Applies operations in one transaction and records an undo snapshot only if
 * something changed. Every user edit goes through here; callers show a toast
 * (with Undo) only when this returns true.
 */
function edit(realm: Realm, playlistId: string, operations: PlaylistOperation[]): boolean {
  // Only a device playlist undoes by snapshot; an account playlist withdraws operations.
  const owned = !!realm.objectForPrimaryKey(Playlist, playlistId)?.ownerUserId;
  const before = owned ? undefined : readPlaylistSnapshot(realm, playlistId);
  const { changed, operationIds } = applyOperations(realm, playlistId, operations);
  if (changed) {
    pushUndo(
      playlistId,
      before ? { kind: 'snapshot', snapshot: before } : { kind: 'operations', operationIds }
    );
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
/** Appends each group as its own segment: a group of several tracks stays linked. */
export function addTracks(realm: Realm, playlistId: string, groups: string[][]): boolean {
  if (groups.length === 0) {
    return false;
  }
  return edit(
    realm,
    playlistId,
    groups.map((trackIds) => appendSegment(trackIds))
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
): boolean {
  const at = locate(readPlaylistSnapshot(realm, playlistId), entryId);
  if (!at) {
    return false;
  }

  if (!at.isSingle) {
    const neighbor = at.group.entries[at.index + (direction === 'up' ? -1 : 1)];
    if (!neighbor) {
      return false;
    }
    return edit(realm, playlistId, [
      {
        type: 'move_entry',
        entryId,
        destination:
          direction === 'up'
            ? { segmentId: at.group.segment.segmentId, beforeEntryId: neighbor.entryId }
            : { segmentId: at.group.segment.segmentId, afterEntryId: neighbor.entryId },
      },
    ]);
  }

  return moveSegmentStep(realm, playlistId, at.group.segment.segmentId, direction);
}

export function moveEntryToEdge(
  realm: Realm,
  playlistId: string,
  entryId: string,
  edge: 'top' | 'bottom'
): boolean {
  const at = locate(readPlaylistSnapshot(realm, playlistId), entryId);
  if (!at) {
    return false;
  }

  if (at.isSingle) {
    return moveSegmentToEdge(realm, playlistId, at.group.segment.segmentId, edge);
  }

  const first = at.groups[0].segment.segmentId;
  const last = at.groups[at.groups.length - 1].segment.segmentId;
  return edit(realm, playlistId, [
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
export function takeOutOfGroup(realm: Realm, playlistId: string, entryId: string): boolean {
  const at = locate(readPlaylistSnapshot(realm, playlistId), entryId);
  if (!at || at.isSingle) {
    return false;
  }
  return edit(realm, playlistId, [
    {
      type: 'move_entry',
      entryId,
      destination: { newSegmentId: newSegmentId(), afterSegmentId: at.group.segment.segmentId },
    },
  ]);
}

/** The group directly above a track on its own, which "Keep with…" would join. */
function groupAbove(snapshot: PlaylistSnapshot, entryId: string): PlaylistGroup | undefined {
  const at = locate(snapshot, entryId);
  if (!at || !at.isSingle || at.groupIndex === 0) {
    return undefined;
  }
  return at.groups[at.groupIndex - 1];
}

/** Joins a track on its own onto the end of the group (or single track) directly above it. */
export function keepWithAbove(realm: Realm, playlistId: string, entryId: string): boolean {
  const above = groupAbove(readPlaylistSnapshot(realm, playlistId), entryId);
  if (!above) {
    return false;
  }
  return edit(realm, playlistId, [
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

export function removeEntry(realm: Realm, playlistId: string, entryId: string): boolean {
  return edit(realm, playlistId, [{ type: 'delete_entry', entryId }]);
}

// endregion

// region Group moves

export function moveSegmentStep(
  realm: Realm,
  playlistId: string,
  segmentId: string,
  direction: MoveDirection
): boolean {
  const groups = orderedGroups(readPlaylistSnapshot(realm, playlistId));
  const index = groups.findIndex((g) => g.segment.segmentId === segmentId);
  const neighbor = groups[index + (direction === 'up' ? -1 : 1)];
  if (index < 0 || !neighbor) {
    return false;
  }

  return edit(realm, playlistId, [
    direction === 'up'
      ? { type: 'move_segment', segmentId, beforeSegmentId: neighbor.segment.segmentId }
      : { type: 'move_segment', segmentId, afterSegmentId: neighbor.segment.segmentId },
  ]);
}

export function moveSegmentToEdge(
  realm: Realm,
  playlistId: string,
  segmentId: string,
  edge: 'top' | 'bottom'
): boolean {
  const groups = orderedGroups(readPlaylistSnapshot(realm, playlistId));
  const first = groups[0]?.segment.segmentId;
  const last = groups[groups.length - 1]?.segment.segmentId;
  // Already at that edge: nothing to do (and no self-anchor, which would append).
  if (groups.length < 2 || segmentId === (edge === 'top' ? first : last)) {
    return false;
  }
  return edit(realm, playlistId, [
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
export function ungroup(realm: Realm, playlistId: string, segmentId: string): boolean {
  const group = orderedGroups(readPlaylistSnapshot(realm, playlistId)).find(
    (g) => g.segment.segmentId === segmentId
  );
  if (!group || group.entries.length < 2) {
    return false;
  }

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
  return edit(realm, playlistId, operations);
}

export function removeSegment(realm: Realm, playlistId: string, segmentId: string): boolean {
  return edit(realm, playlistId, [{ type: 'delete_segment', segmentId }]);
}

// endregion

// region Drops

/** Where a dragged track lands, as decided by the edit list from its neighboring rows. */
export type TrackDrop =
  | { kind: 'in_group'; segmentId: string; afterEntryId?: string; beforeEntryId?: string }
  | { kind: 'not_in_group'; afterSegmentId?: string; beforeSegmentId?: string };

export function dropTrack(
  realm: Realm,
  playlistId: string,
  entryId: string,
  drop: TrackDrop
): boolean {
  const at = locate(readPlaylistSnapshot(realm, playlistId), entryId);
  if (!at) {
    return false;
  }

  if (drop.kind === 'in_group') {
    return edit(realm, playlistId, [
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
  }

  // A track already on its own moves its whole segment, keeping the segment's ID.
  return edit(realm, playlistId, [
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
): boolean {
  return edit(realm, playlistId, [{ type: 'move_segment', segmentId, ...anchors }]);
}

// endregion
