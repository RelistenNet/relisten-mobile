import Realm from 'realm';
import {
  PlaylistEntry,
  PlaylistSegment,
  PlaylistTrackAvailability,
} from '@/relisten/realm/models/playlists/playlist';
import type {
  EntryState,
  PlaylistSnapshot,
  SegmentState,
} from '@/relisten/playlists/playlist_operations';
import { parseUuidTypedId } from '@/relisten/util/typed_uuid_id';
import {
  GUIDE_MARKDOWN_VERSION,
  type GuideTextContext,
  sanitizeGuideMarkdown,
} from './guide_markdown';

/**
 * Reading and writing the displayed state of playlist rows, including guide
 * text. Every write of a displayed description goes through here, so the
 * sanitized copy the renderer reads (`descriptionMarkdown`) is computed once,
 * when the description changes, and never while rendering.
 */

/** The displayed state of a segment row, as the operation engine sees it. */
export function segmentStateOf(row: PlaylistSegment): SegmentState {
  return withOptional<SegmentState>({ segmentId: row.segmentId, rank: row.rank }, row.description);
}

/** The displayed state of an entry row; a text block has no `trackId`. */
export function entryStateOf(row: PlaylistEntry): EntryState {
  const state: EntryState = { entryId: row.entryId, segmentId: row.segmentId, rank: row.rank };
  if (row.trackId) {
    state.trackId = row.trackId;
  }
  return withOptional(state, row.description);
}

/** Tracks in a snapshot, which is what "N tracks" and the playlist's `entryCount` count. */
export function trackCount(snapshot: PlaylistSnapshot): number {
  let count = 0;
  for (const entry of snapshot.entries.values()) {
    if (entry.trackId) {
      count += 1;
    }
  }
  return count;
}

/**
 * Writes a segment's displayed state, creating the row if needed. The
 * description is written separately so clearing it clears the row (an upsert
 * leaves fields it isn't given alone) and its sanitized copy is refreshed.
 */
export function writeSegmentRow(realm: Realm, playlistId: string, segment: SegmentState) {
  const { description, ...fields } = segment;
  const row = realm.create(
    PlaylistSegment,
    { ...fields, playlistId, live: true },
    Realm.UpdateMode.Modified
  );
  writeDescription(realm, row, description);
}

/** Writes an entry's displayed state, like `writeSegmentRow`. Its track never changes. */
export function writeEntryRow(realm: Realm, playlistId: string, entry: EntryState) {
  const { description, ...fields } = entry;
  const row = realm.create(
    PlaylistEntry,
    { ...fields, playlistId, live: true },
    Realm.UpdateMode.Modified
  );
  writeDescription(realm, row, description);
}

/**
 * Sets a row's displayed description and its sanitized copy. Writing an
 * unchanged description writes nothing, so a rebuild that changed nothing
 * visible doesn't wake listeners.
 */
export function writeDescription(
  realm: Realm,
  row: PlaylistSegment | PlaylistEntry,
  description: string | undefined
) {
  if ((row.description ?? undefined) !== description) {
    row.description = description;
    writeSanitized(row, contextOf(realm, row));
    return;
  }
  refreshGuideMarkdown(realm, row);
}

/**
 * Re-sanitizes a row whose stored copy is stale: written by an older sanitizer,
 * or for a track whose duration has since become known.
 */
export function refreshGuideMarkdown(realm: Realm, row: PlaylistSegment | PlaylistEntry) {
  if (!row.description) {
    // Realm reads unset optional strings as null; only write when something is stored.
    if (row.descriptionMarkdownKey != null || row.descriptionMarkdown != null) {
      row.descriptionMarkdownKey = undefined;
      row.descriptionMarkdown = undefined;
    }
    return;
  }

  const context = contextOf(realm, row);
  if (row.descriptionMarkdownKey !== keyOf(context)) {
    writeSanitized(row, context);
  }
}

/** Refreshes every stale stored copy. Runs at startup and after playlist tracks load. */
export function refreshStaleGuideMarkdown(realm: Realm) {
  const rows = [
    ...realm.objects(PlaylistSegment).filtered('description != null'),
    ...realm.objects(PlaylistEntry).filtered('description != null'),
  ];
  const stale = rows.filter((row) => row.descriptionMarkdownKey !== keyOf(contextOf(realm, row)));
  if (stale.length === 0) {
    return;
  }

  realm.write(() => {
    for (const row of stale) {
      refreshGuideMarkdown(realm, row);
    }
  });
}

/**
 * The sanitized Markdown to render for a row. The stored copy is used when it
 * is current; otherwise this sanitizes on the spot, which only happens until
 * the next refresh writes it.
 */
export function renderableDescription(
  row: PlaylistSegment | PlaylistEntry,
  context: GuideTextContext
): string | undefined {
  if (!row.description) {
    return undefined;
  }
  return row.descriptionMarkdownKey === keyOf(context) && row.descriptionMarkdown != null
    ? row.descriptionMarkdown
    : sanitizeGuideMarkdown(row.description, context);
}

/** Who owns a row's description, which decides how timestamps link. */
export function contextOf(realm: Realm, row: PlaylistSegment | PlaylistEntry): GuideTextContext {
  return isEntry(row) ? entryContext(realm, row.trackId) : { kind: 'segment' };
}

/** The context of an entry's description: a track's note, or a text block when there's no track. */
export function entryContext(realm: Realm, trackId: string | undefined): GuideTextContext {
  return trackId
    ? { kind: 'track', durationSeconds: trackDurationSeconds(realm, trackId) }
    : { kind: 'text' };
}

function isEntry(row: PlaylistSegment | PlaylistEntry): row is PlaylistEntry {
  return row.objectSchema().name === PlaylistEntry.schema.name;
}

function writeSanitized(row: PlaylistSegment | PlaylistEntry, context: GuideTextContext) {
  row.descriptionMarkdown = row.description
    ? sanitizeGuideMarkdown(row.description, context)
    : undefined;
  row.descriptionMarkdownKey = row.description ? keyOf(context) : undefined;
}

/**
 * Identifies what a stored copy was computed from: the sanitizer version and,
 * for a track's note, the duration that decided which bare timestamps link
 * (`1:track:229` while known, `1:track:` before the track loads).
 */
function keyOf(context: GuideTextContext) {
  return context.kind === 'track'
    ? `${GUIDE_MARKDOWN_VERSION}:track:${context.durationSeconds ?? ''}`
    : `${GUIDE_MARKDOWN_VERSION}:${context.kind}`;
}

/**
 * The duration of the track an entry plays, following a recorded redirect,
 * or undefined until the catalog has loaded it. Whole seconds, since
 * timestamps name whole seconds.
 */
function trackDurationSeconds(realm: Realm, trackId: string): number | undefined {
  if (!hasSourceTracks(realm)) {
    return undefined;
  }

  const redirect = realm.objectForPrimaryKey(PlaylistTrackAvailability, trackId);
  const playableId =
    redirect?.status === 'redirected' && redirect.redirectTrackId
      ? redirect.redirectTrackId
      : trackId;
  const uuid = parseUuidTypedId(playableId, 'track');
  const duration = uuid
    ? realm.objectForPrimaryKey<Record<string, unknown>>('SourceTrack', uuid)?.duration
    : undefined;
  return typeof duration === 'number' && duration > 0 ? Math.floor(duration) : undefined;
}

/**
 * Tests open Realms with only the playlist models. Looking the catalog up by
 * name, behind this check, keeps those Realms usable without catalog models.
 */
function hasSourceTracks(realm: Realm) {
  // `realm.schema` rebuilds the whole schema description on every read (about
  // 0.1 ms), and this runs per described row, so the answer is kept per Realm.
  let known = sourceTracksByRealm.get(realm);
  if (known === undefined) {
    known = realm.schema.some((model) => model.name === 'SourceTrack');
    sourceTracksByRealm.set(realm, known);
  }
  return known;
}

const sourceTracksByRealm = new WeakMap<Realm, boolean>();

function withOptional<T extends { description?: string }>(state: T, description?: string): T {
  if (description) {
    state.description = description;
  }
  return state;
}
