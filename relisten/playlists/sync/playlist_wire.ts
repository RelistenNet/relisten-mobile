import type { NewEntry, PlaylistOperation } from '@/relisten/playlists/playlist_operations';

/**
 * Wire shapes for the private playlist API (`/v1/playlists`), from the frozen
 * contract `2026-11-16-v4-playlist-contracts.md` in RelistenApi. JSON is
 * snake_case; absent optional fields are left out rather than sent as null.
 * Guide content (descriptions and text blocks) follows the contract's
 * 2026-11-18 amendment.
 */

/** A metadata edit. `description: null` clears it; an absent field is unchanged. */
export interface MetadataEdit {
  type: 'update_metadata';
  name?: string;
  description?: string | null;
}

/** Everything a listener's edit can send: the structural operations plus metadata. */
export type PlaylistEdit = PlaylistOperation | MetadataEdit;

export interface WireOperation {
  operation_id: string;
  base_revision: number;
  operation_type: PlaylistEdit['type'];
  payload: Record<string, unknown>;
}

export interface CreatePlaylistRequest {
  contract_version: 1;
  command_id: string;
  playlist_id: string;
  metadata: { name: string; description: string | null };
  segments: { segment_id: string; description?: string; entries: WireEntry[] }[];
}

/** A track entry, or a text block when `track_id` is absent. */
export interface WireEntry {
  entry_id: string;
  track_id?: string;
  description?: string;
}

export interface PlaylistSnapshotResponse {
  contract_version: 1;
  playlist_id: string;
  revision: number;
  archived: boolean;
  metadata: { name: string; description: string | null };
  segments: {
    segment_id: string;
    rank: string;
    description?: string | null;
    entries: {
      entry_id: string;
      track_id: string | null;
      rank: string;
      description?: string | null;
    }[];
  }[];
  created_at: string;
  updated_at: string;
  history_generation: string;
  public_code?: string | null;
  published?: boolean;
  taken_down?: boolean;
}

/**
 * Sharing state on an owned playlist's summary and snapshot. The code is kept
 * once issued, so making a playlist private and public again keeps its link.
 */
export type PlaylistPublicationState = Pick<
  PlaylistSnapshotResponse,
  'public_code' | 'published' | 'taken_down'
>;

export type PlaylistChange =
  | { type: 'metadata_updated'; name: string; description: string | null }
  // An upsert carries the full current state: an absent or null description means none.
  | { type: 'segment_upserted'; segment_id: string; rank: string; description?: string | null }
  | { type: 'segment_deleted'; segment_id: string }
  | {
      type: 'entry_upserted';
      entry_id: string;
      segment_id: string;
      track_id: string | null;
      rank: string;
      description?: string | null;
    }
  | { type: 'entry_deleted'; entry_id: string };

export interface PlaylistChangesResponse {
  contract_version: 1;
  playlist_id: string;
  head_revision: number;
  revisions: { revision: number; kind: 'content' | 'rebalance'; changes: PlaylistChange[] }[];
  next_after_revision: number;
  has_more: boolean;
  history_generation: string;
}

export type OperationResultStatus =
  | 'applied'
  | 'no_op'
  | 'target_deleted'
  | 'target_missing'
  | 'parent_missing'
  | 'id_conflict';

export interface OperationBatchResponse {
  contract_version: 1;
  head_revision: number;
  results: { operation_id: string; status: OperationResultStatus; revision: number | null }[];
  history_generation: string;
}

export interface ArchiveStateResponse {
  contract_version: 1;
  playlist_id: string;
  archived: boolean;
  changed: boolean;
  history_generation: string;
}

/** A playlist in the library feed: the full current summary. */
export interface PlaylistSummary {
  playlist_id: string;
  name: string;
  /** Track entries and text blocks. */
  entry_count: number;
  /** Track entries only. */
  track_count?: number;
  archived: boolean;
  revision: number;
  updated_at: string;
  public_code?: string | null;
  published?: boolean;
  taken_down?: boolean;
}

/** The contract's cap on operations per batch request. */
export const MAX_BATCH_OPERATIONS = 500;

/** Statuses the server accepted. The rest mean the edit did not land. */
export const ACCEPTED_STATUSES: ReadonlySet<OperationResultStatus> = new Set([
  'applied',
  'no_op',
  'target_deleted',
  'target_missing',
]);

export function toWireOperation(
  operationId: string,
  baseRevision: number,
  edit: PlaylistEdit
): WireOperation {
  return {
    operation_id: operationId,
    base_revision: baseRevision,
    operation_type: edit.type,
    payload: wirePayload(edit),
  };
}

function wirePayload(edit: PlaylistEdit): Record<string, unknown> {
  // JSON.stringify drops undefined members, which is how optional anchors stay absent.
  switch (edit.type) {
    case 'update_metadata':
      return { name: edit.name, description: edit.description };
    case 'insert_segment':
      return {
        segment_id: edit.segmentId,
        after_segment_id: edit.afterSegmentId,
        before_segment_id: edit.beforeSegmentId,
        description: edit.description,
        entries: wireEntries(edit.entries),
      };
    case 'update_segment':
      return { segment_id: edit.segmentId, description: edit.description };
    case 'move_segment':
      return {
        segment_id: edit.segmentId,
        after_segment_id: edit.afterSegmentId,
        before_segment_id: edit.beforeSegmentId,
      };
    case 'delete_segment':
      return { segment_id: edit.segmentId };
    case 'insert_entries':
      return {
        segment_id: edit.segmentId,
        after_entry_id: edit.afterEntryId,
        before_entry_id: edit.beforeEntryId,
        entries: wireEntries(edit.entries),
      };
    case 'move_entry': {
      const destination = edit.destination;
      return {
        entry_id: edit.entryId,
        destination:
          'newSegmentId' in destination
            ? {
                new_segment_id: destination.newSegmentId,
                after_segment_id: destination.afterSegmentId,
                before_segment_id: destination.beforeSegmentId,
              }
            : {
                segment_id: destination.segmentId,
                after_entry_id: destination.afterEntryId,
                before_entry_id: destination.beforeEntryId,
              },
      };
    }
    case 'update_entry':
      return { entry_id: edit.entryId, description: edit.description };
    case 'delete_entry':
      return { entry_id: edit.entryId };
  }
}

export function wireEntries(entries: NewEntry[]): WireEntry[] {
  return entries.map((entry) => ({
    entry_id: entry.entryId,
    track_id: entry.trackId,
    description: entry.description,
  }));
}

/**
 * What a refused edit was adding, so Add Again can offer it back whole: its
 * tracks and text blocks, and for a new group, the group's intro. A refused
 * edit stays in the outbox as `needs_attention`, which isn't replayed over the
 * confirmed state (`OVERLAY_STATES`), so it disappears from the playlist; the
 * stored operation is the only record of what it held.
 */
export interface RefusedAddition {
  description?: string;
  entries: NewEntry[];
}

export function refusedAddition(edit: PlaylistEdit): RefusedAddition | null {
  if (edit.type === 'insert_segment') {
    return { description: edit.description, entries: edit.entries };
  }
  return edit.type === 'insert_entries' ? { entries: edit.entries } : null;
}
