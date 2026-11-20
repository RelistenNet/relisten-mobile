/**
 * Narrowing what a playlist shows without changing the playlist: Play,
 * Shuffle and Download still use every group. Each filter keeps groups in
 * order and drops the ones it leaves with nothing to show.
 */
import { markdownPreview, showLine } from '@/relisten/playlists/playlist_format';
import type { PlaylistRowEntry, PlaylistRowGroup } from '@/relisten/playlists/playlist_hooks';

/** Downloaded tracks only; the guide text around them is dropped too. */
export function downloadedGroups(groups: PlaylistRowGroup[]): PlaylistRowGroup[] {
  return groups
    .map((group) => ({
      ...group,
      entries: group.entries.filter(
        (row) => row.sourceTrack?.offlineInfo?.isPlayableOffline() === true
      ),
      descriptionMarkdown: undefined,
    }))
    .filter((group) => group.entries.length > 0);
}

/**
 * Entries matching every word of `query`, case-insensitively. A track matches
 * on its title, artist, date, venue or note; a text block on its text. Guide
 * text matches only as it is shown: sanitized, and not at all once another
 * filter has hidden it (Show Downloaded Only drops intros). When a
 * group's intro matches, the whole group shows, since the intro is about all
 * of it, including a group that is only prose. Otherwise the intro stays
 * above the entries that matched, as their context. A blank query keeps
 * everything.
 */
export function searchedGroups(groups: PlaylistRowGroup[], query: string): PlaylistRowGroup[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return groups;
  }

  const matches = (text: string) => words.every((word) => text.includes(word));

  return groups.flatMap((group) => {
    if (matches(guideText(group.descriptionMarkdown))) {
      return [group];
    }
    const entries = group.entries.filter((row) => matches(entryText(row)));
    return entries.length > 0 ? [{ ...group, entries }] : [];
  });
}

function entryText(row: PlaylistRowEntry): string {
  const track = row.sourceTrack;
  const details = track ? `${track.title} ${showLine(row)}`.toLowerCase() : '';
  return `${details} ${guideText(row.descriptionMarkdown)}`;
}

/** Lowercased plain text of rendered guide Markdown, so syntax and link targets never match. */
function guideText(markdown: string | undefined): string {
  return markdownPreview(markdown).toLowerCase();
}
