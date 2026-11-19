import type { PlaylistSnapshot } from '@/relisten/playlists/playlist_operations';

/**
 * Normalization and limits for guide descriptions, matching the User Service
 * (`PlaylistValidation`) so an edit the device accepts is one the server
 * accepts, and replays produce what the server stores.
 */

export const MAX_GUIDE_DESCRIPTION_CHARACTERS = 2_000;
export const MAX_PROSE_ONLY_SEGMENTS = 100;
/** All live descriptions in a playlist, including its own metadata description. */
export const MAX_GUIDE_DESCRIPTION_BYTES = 200_000;

/** Trimmed and NFC-normalized, as the server stores it. Blank text is no description. */
export function normalizeGuideText(text: string | null | undefined): string | undefined {
  const normalized = text?.trim().normalize('NFC');
  return normalized ? normalized : undefined;
}

export class GuideLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GuideLimitError';
  }
}

/** Refuses one description that is too long. Characters are Unicode scalar values. */
export function assertDescriptionLength(description: string | undefined) {
  if (description && [...description].length > MAX_GUIDE_DESCRIPTION_CHARACTERS) {
    throw new GuideLimitError(
      `Notes can be at most ${MAX_GUIDE_DESCRIPTION_CHARACTERS.toLocaleString()} characters.`
    );
  }
}

/**
 * Refuses a playlist state over the per-playlist guide limits. The server
 * checks the state a batch leaves behind, so this checks the state after an
 * edit, not the edit itself.
 */
export function assertGuideLimits(snapshot: PlaylistSnapshot, metadataDescription?: string) {
  const segmentsWithEntries = new Set([...snapshot.entries.values()].map((e) => e.segmentId));
  const proseOnly = [...snapshot.segments.values()].filter(
    (segment) => !segmentsWithEntries.has(segment.segmentId)
  ).length;
  if (proseOnly > MAX_PROSE_ONLY_SEGMENTS) {
    throw new GuideLimitError(
      `A playlist can have at most ${MAX_PROSE_ONLY_SEGMENTS} text sections between groups.`
    );
  }

  let bytes = utf8Length(metadataDescription);
  for (const row of [...snapshot.segments.values(), ...snapshot.entries.values()]) {
    bytes += utf8Length(row.description);
  }
  if (bytes > MAX_GUIDE_DESCRIPTION_BYTES) {
    throw new GuideLimitError('This playlist has as much text as it can hold.');
  }
}

function utf8Length(text: string | undefined) {
  let bytes = 0;
  for (const character of text ?? '') {
    const codePoint = character.codePointAt(0)!;
    bytes += codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/**
 * Points `#entry=<old-id>&t=` links at new entry IDs, for entries re-created
 * with fresh IDs (Add Again, and later copying a public guide). Only that exact
 * prefix changes, so a bare ID in prose stays as written.
 */
export function rewriteEntryLinks(text: string, newIds: ReadonlyMap<string, string>): string {
  return text.replace(/#entry=(playlist_entry_[0-9a-z]{26})&t=/g, (link, entryId: string) => {
    const newId = newIds.get(entryId);
    return newId ? `#entry=${newId}&t=` : link;
  });
}
