import { generateNKeysBetween } from 'fractional-indexing';

/**
 * The playlist operation engine. It implements the structural operations of the
 * frozen API contract (`2026-11-16-v4-playlist-contracts.md`) as a pure function
 * over an in-memory snapshot, and returns only the rows it changed. Playlists on
 * the device apply those changes directly; account playlists use the same
 * engine for their pending edits and for replaying them after a pull.
 *
 * Guide content: segments and entries carry optional Markdown descriptions,
 * and an entry with no `trackId` is a text block. Descriptions arrive here
 * already normalized (`normalizeGuideText`), the way the server stores them,
 * so a replayed edit produces exactly what the server will confirm.
 */

export interface SegmentState {
  segmentId: string;
  rank: string;
  description?: string;
}

/** A track entry, or a text block when `trackId` is absent. */
export interface EntryState {
  entryId: string;
  segmentId: string;
  trackId?: string;
  rank: string;
  description?: string;
}

export interface PlaylistSnapshot {
  segments: ReadonlyMap<string, SegmentState>;
  entries: ReadonlyMap<string, EntryState>;
}

/** A track to add (`trackId`, with an optional note), or a text block (`description` only). */
export interface NewEntry {
  entryId: string;
  trackId?: string;
  description?: string;
}

export type EntryDestination =
  | { segmentId: string; afterEntryId?: string; beforeEntryId?: string }
  | { newSegmentId: string; afterSegmentId?: string; beforeSegmentId?: string };

export type PlaylistOperation =
  | {
      type: 'insert_segment';
      segmentId: string;
      afterSegmentId?: string;
      beforeSegmentId?: string;
      /** A segment with a description may have no entries: a prose-only group. */
      description?: string;
      entries: NewEntry[];
    }
  /** `description: null` clears it; clearing a prose-only segment deletes it. */
  | { type: 'update_segment'; segmentId: string; description: string | null }
  | { type: 'move_segment'; segmentId: string; afterSegmentId?: string; beforeSegmentId?: string }
  | { type: 'delete_segment'; segmentId: string }
  | {
      type: 'insert_entries';
      segmentId: string;
      afterEntryId?: string;
      beforeEntryId?: string;
      entries: NewEntry[];
    }
  /** `description: null` clears a track's note. A text block can't be cleared, only deleted. */
  | { type: 'update_entry'; entryId: string; description: string | null }
  | { type: 'move_entry'; entryId: string; destination: EntryDestination }
  | { type: 'delete_entry'; entryId: string };

export type OperationStatus = 'applied' | 'no_op' | 'target_missing' | 'parent_missing';

export interface PlaylistChanges {
  upsertSegments: SegmentState[];
  deleteSegmentIds: string[];
  upsertEntries: EntryState[];
  deleteEntryIds: string[];
}

export interface OperationResult {
  status: OperationStatus;
  changes: PlaylistChanges;
}

/** The contract caps rank length; past it, a parent's children are respaced. */
export const MAX_RANK_LENGTH = 48;

const emptyChanges = (): PlaylistChanges => ({
  upsertSegments: [],
  deleteSegmentIds: [],
  upsertEntries: [],
  deleteEntryIds: [],
});

const result = (status: OperationStatus, changes = emptyChanges()): OperationResult => ({
  status,
  changes,
});

/** Ranks compare by byte order, which is plain JavaScript string order for this alphabet. */
export const byRank = (a: { rank: string }, b: { rank: string }) =>
  a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0;

export function sortedSegments(snapshot: PlaylistSnapshot): SegmentState[] {
  return [...snapshot.segments.values()].sort(byRank);
}

export function sortedEntriesOf(snapshot: PlaylistSnapshot, segmentId: string): EntryState[] {
  return [...snapshot.entries.values()].filter((e) => e.segmentId === segmentId).sort(byRank);
}

export interface PlaylistGroup {
  segment: SegmentState;
  entries: EntryState[];
}

/** The playlist in display order: segments by rank, each with its entries by rank. */
export function orderedGroups(snapshot: PlaylistSnapshot): PlaylistGroup[] {
  const entriesBySegment = new Map<string, EntryState[]>();
  for (const entry of snapshot.entries.values()) {
    const list = entriesBySegment.get(entry.segmentId) ?? [];
    list.push(entry);
    entriesBySegment.set(entry.segmentId, list);
  }

  return [...snapshot.segments.values()].sort(byRank).map((segment) => ({
    segment,
    entries: (entriesBySegment.get(segment.segmentId) ?? []).sort(byRank),
  }));
}

/** A snapshot an edit or replay updates in place, one operation at a time. */
export interface WorkingSnapshot {
  segments: Map<string, SegmentState>;
  entries: Map<string, EntryState>;
}

/** Folds an operation's changes into a working snapshot. */
export function applyChanges(snapshot: WorkingSnapshot, changes: PlaylistChanges) {
  for (const segment of changes.upsertSegments) {
    snapshot.segments.set(segment.segmentId, segment);
  }
  for (const entry of changes.upsertEntries) {
    snapshot.entries.set(entry.entryId, entry);
  }
  for (const id of changes.deleteEntryIds) {
    snapshot.entries.delete(id);
  }
  for (const id of changes.deleteSegmentIds) {
    snapshot.segments.delete(id);
  }
}

export function applyPlaylistOperation(
  snapshot: PlaylistSnapshot,
  operation: PlaylistOperation
): OperationResult {
  switch (operation.type) {
    case 'insert_segment':
      return insertSegment(snapshot, operation);
    case 'update_segment':
      return updateSegment(snapshot, operation.segmentId, operation.description ?? undefined);
    case 'move_segment':
      return moveSegment(snapshot, operation);
    case 'delete_segment':
      return deleteSegment(snapshot, operation.segmentId);
    case 'insert_entries':
      return insertEntries(snapshot, operation);
    case 'update_entry':
      return updateEntry(snapshot, operation.entryId, operation.description ?? undefined);
    case 'move_entry':
      return moveEntry(snapshot, operation.entryId, operation.destination);
    case 'delete_entry':
      return deleteEntry(snapshot, operation.entryId);
  }
}

function insertSegment(
  snapshot: PlaylistSnapshot,
  op: Extract<PlaylistOperation, { type: 'insert_segment' }>
): OperationResult {
  if (op.entries.length === 0 && !op.description) {
    throw new Error('A segment needs a description or at least one entry.');
  }

  const changes = emptyChanges();
  const [rank] = placeRanks(
    sortedSegments(snapshot),
    (s) => s.segmentId,
    op.afterSegmentId,
    op.beforeSegmentId,
    1,
    (segment, newRank) => changes.upsertSegments.push({ ...segment, rank: newRank })
  );
  changes.upsertSegments.push(
    withDescription<SegmentState>({ segmentId: op.segmentId, rank }, op.description)
  );
  addEntries(
    changes,
    op.segmentId,
    op.entries,
    generateNKeysBetween(null, null, op.entries.length)
  );
  return result('applied', changes);
}

function updateSegment(
  snapshot: PlaylistSnapshot,
  segmentId: string,
  description: string | undefined
): OperationResult {
  const segment = snapshot.segments.get(segmentId);
  if (!segment) {
    return result('target_missing');
  }
  if (segment.description === description) {
    return result('no_op');
  }

  // A segment needs a description or entries, so clearing a prose-only one removes it.
  if (!description && sortedEntriesOf(snapshot, segmentId).length === 0) {
    return deleteSegment(snapshot, segmentId);
  }

  const changes = emptyChanges();
  changes.upsertSegments.push(withDescription(segment, description));
  return result('applied', changes);
}

function updateEntry(
  snapshot: PlaylistSnapshot,
  entryId: string,
  description: string | undefined
): OperationResult {
  const entry = snapshot.entries.get(entryId);
  if (!entry) {
    return result('target_missing');
  }
  if (!entry.trackId && !description) {
    // The server refuses this whole batch; the editor deletes the block instead.
    throw new Error('A text block needs a description. Delete it instead.');
  }
  if (entry.description === description) {
    return result('no_op');
  }

  const changes = emptyChanges();
  changes.upsertEntries.push(withDescription(entry, description));
  return result('applied', changes);
}

function moveSegment(
  snapshot: PlaylistSnapshot,
  op: Extract<PlaylistOperation, { type: 'move_segment' }>
): OperationResult {
  const segment = snapshot.segments.get(op.segmentId);
  if (!segment) {
    return result('target_missing');
  }

  const all = sortedSegments(snapshot);
  const siblings = all.filter((s) => s.segmentId !== op.segmentId);
  const prevIndex = placementIndex(
    siblings,
    (s) => s.segmentId,
    op.afterSegmentId,
    op.beforeSegmentId
  );
  if (isSamePlace(all, siblings, prevIndex, (s) => s.segmentId, op.segmentId)) {
    return result('no_op');
  }

  const changes = emptyChanges();
  const [rank] = ranksAt(siblings, prevIndex, 1, (sibling, newRank) =>
    changes.upsertSegments.push({ ...sibling, rank: newRank })
  );
  changes.upsertSegments.push({ ...segment, rank });
  return result('applied', changes);
}

function deleteSegment(snapshot: PlaylistSnapshot, segmentId: string): OperationResult {
  if (!snapshot.segments.has(segmentId)) {
    return result('target_missing');
  }

  const changes = emptyChanges();
  changes.deleteSegmentIds.push(segmentId);
  changes.deleteEntryIds.push(...sortedEntriesOf(snapshot, segmentId).map((e) => e.entryId));
  return result('applied', changes);
}

function insertEntries(
  snapshot: PlaylistSnapshot,
  op: Extract<PlaylistOperation, { type: 'insert_entries' }>
): OperationResult {
  if (!snapshot.segments.has(op.segmentId)) {
    return result('parent_missing');
  }
  if (op.entries.length === 0) {
    return result('no_op');
  }

  const changes = emptyChanges();
  const ranks = placeRanks(
    sortedEntriesOf(snapshot, op.segmentId),
    (e) => e.entryId,
    op.afterEntryId,
    op.beforeEntryId,
    op.entries.length,
    (entry, newRank) => changes.upsertEntries.push({ ...entry, rank: newRank })
  );
  addEntries(changes, op.segmentId, op.entries, ranks);
  return result('applied', changes);
}

function moveEntry(
  snapshot: PlaylistSnapshot,
  entryId: string,
  destination: EntryDestination
): OperationResult {
  const entry = snapshot.entries.get(entryId);
  if (!entry) {
    return result('target_missing');
  }

  const changes = emptyChanges();

  if ('segmentId' in destination) {
    if (!snapshot.segments.has(destination.segmentId)) {
      return result('parent_missing');
    }

    const all = sortedEntriesOf(snapshot, destination.segmentId);
    const siblings = all.filter((e) => e.entryId !== entryId);
    const prevIndex = placementIndex(
      siblings,
      (e) => e.entryId,
      destination.afterEntryId,
      destination.beforeEntryId
    );
    if (
      destination.segmentId === entry.segmentId &&
      isSamePlace(all, siblings, prevIndex, (e) => e.entryId, entryId)
    ) {
      return result('no_op');
    }

    const [rank] = ranksAt(siblings, prevIndex, 1, (sibling, newRank) =>
      changes.upsertEntries.push({ ...sibling, rank: newRank })
    );
    changes.upsertEntries.push({ ...entry, segmentId: destination.segmentId, rank });
  } else {
    // Anchors resolve against the segments as they stand, including the one the
    // entry is leaving, before that segment is removed below.
    const [segmentRank] = placeRanks(
      sortedSegments(snapshot),
      (s) => s.segmentId,
      destination.afterSegmentId,
      destination.beforeSegmentId,
      1,
      (segment, newRank) => changes.upsertSegments.push({ ...segment, rank: newRank })
    );
    changes.upsertSegments.push({ segmentId: destination.newSegmentId, rank: segmentRank });
    const [entryRank] = generateNKeysBetween(null, null, 1);
    changes.upsertEntries.push({ ...entry, segmentId: destination.newSegmentId, rank: entryRank });
  }

  const destinationSegmentId =
    'segmentId' in destination ? destination.segmentId : destination.newSegmentId;
  removeSegmentIfEmptied(snapshot, entry.segmentId, destinationSegmentId, changes);
  return result('applied', changes);
}

function deleteEntry(snapshot: PlaylistSnapshot, entryId: string): OperationResult {
  const entry = snapshot.entries.get(entryId);
  if (!entry) {
    return result('target_missing');
  }

  const changes = emptyChanges();
  changes.deleteEntryIds.push(entryId);
  removeSegmentIfEmptied(snapshot, entry.segmentId, undefined, changes);
  return result('applied', changes);
}

function addEntries(
  changes: PlaylistChanges,
  segmentId: string,
  entries: NewEntry[],
  ranks: string[]
) {
  entries.forEach((entry, index) => {
    if (!entry.trackId && !entry.description) {
      throw new Error('A text block needs a description.');
    }
    changes.upsertEntries.push({ ...entry, segmentId, rank: ranks[index] });
  });
}

/** Sets or clears a description without leaving an explicit `undefined` key behind. */
function withDescription<T extends { description?: string }>(row: T, description?: string): T {
  const next = { ...row };
  delete next.description;
  return description ? { ...next, description } : next;
}

/**
 * A segment needs a description or entries, so taking out the last entry of a
 * segment with no description removes it in the same operation.
 */
function removeSegmentIfEmptied(
  snapshot: PlaylistSnapshot,
  sourceSegmentId: string,
  destinationSegmentId: string | undefined,
  changes: PlaylistChanges
) {
  if (sourceSegmentId === destinationSegmentId) {
    return;
  }
  if (snapshot.segments.get(sourceSegmentId)?.description) {
    return;
  }
  if (sortedEntriesOf(snapshot, sourceSegmentId).length === 1) {
    changes.deleteSegmentIds.push(sourceSegmentId);
  }
}

/**
 * Contract placement rules, as the index of the sibling the new item follows
 * (-1 for the start). Placement never fails: a missing anchor, or one in another
 * parent, counts as absent; an inverted pair keeps only `after`; with two
 * present anchors the item goes right after `after`.
 */
function placementIndex<T>(
  siblings: T[],
  idOf: (item: T) => string,
  afterId: string | undefined,
  beforeId: string | undefined
): number {
  const afterIndex = afterId ? siblings.findIndex((s) => idOf(s) === afterId) : -1;
  if (afterIndex >= 0) {
    return afterIndex;
  }

  const beforeIndex = beforeId ? siblings.findIndex((s) => idOf(s) === beforeId) : -1;
  if (beforeIndex >= 0) {
    return beforeIndex - 1;
  }

  return siblings.length - 1;
}

/** True when placing after `prevIndex` would put the item back where it already is. */
function isSamePlace<T>(
  all: T[],
  siblings: T[],
  prevIndex: number,
  idOf: (item: T) => string,
  movingId: string
): boolean {
  const currentIndex = all.findIndex((item) => idOf(item) === movingId);
  return currentIndex === prevIndex + 1 && siblings.length === all.length - 1;
}

function placeRanks<T extends { rank: string }>(
  siblings: T[],
  idOf: (item: T) => string,
  afterId: string | undefined,
  beforeId: string | undefined,
  count: number,
  onRespace: (sibling: T, rank: string) => void
): string[] {
  return ranksAt(siblings, placementIndex(siblings, idOf, afterId, beforeId), count, onRespace);
}

/**
 * Returns `count` ranks for new items after `siblings[prevIndex]`. When the gap
 * has run out of short keys, every sibling is respaced first (reported through
 * `onRespace`), so no stored rank exceeds MAX_RANK_LENGTH.
 */
function ranksAt<T extends { rank: string }>(
  siblings: T[],
  prevIndex: number,
  count: number,
  onRespace: (sibling: T, rank: string) => void
): string[] {
  const prev = siblings[prevIndex]?.rank ?? null;
  const next = siblings[prevIndex + 1]?.rank ?? null;
  const ranks = generateNKeysBetween(prev, next, count);
  if (ranks.every((rank) => rank.length <= MAX_RANK_LENGTH)) {
    return ranks;
  }

  const insertAt = prevIndex + 1;
  const respaced = generateNKeysBetween(null, null, siblings.length + count);
  siblings.forEach((sibling, index) => {
    onRespace(sibling, respaced[index < insertAt ? index : index + count]);
  });
  return respaced.slice(insertAt, insertAt + count);
}
