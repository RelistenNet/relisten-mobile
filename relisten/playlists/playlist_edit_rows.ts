import type { TrackDrop } from '@/relisten/playlists/playlist_actions';
import type { PlaylistRowEntry, PlaylistRowGroup } from '@/relisten/playlists/playlist_hooks';

export type ArrangeMode = 'tracks' | 'groups';

/**
 * Edit-mode rows. In Tracks mode a group is bracketed by a header and a footer
 * row, so where a dragged track lands is unambiguous: after a header or before a
 * footer is inside the group; anywhere else is not in a group. In Groups mode
 * every group is one row and drags as a unit.
 */
export type EditRow =
  | { key: string; kind: 'header'; group: PlaylistRowGroup }
  | { key: string; kind: 'entry'; group: PlaylistRowGroup; row: PlaylistRowEntry; inGroup: boolean }
  | { key: string; kind: 'footer'; group: PlaylistRowGroup }
  | { key: string; kind: 'group'; group: PlaylistRowGroup };

export function trackRows(groups: PlaylistRowGroup[]): EditRow[] {
  const rows: EditRow[] = [];
  for (const group of groups) {
    const inGroup = group.entries.length > 1;
    const id = group.segment.segmentId;
    if (inGroup) rows.push({ key: `h:${id}`, kind: 'header', group });
    for (const row of group.entries) {
      rows.push({ key: row.entry.entryId, kind: 'entry', group, row, inGroup });
    }
    if (inGroup) rows.push({ key: `f:${id}`, kind: 'footer', group });
  }
  return rows;
}

/** Reads the drop from the rows around where the track landed. */
export function trackDropAt(rows: EditRow[], index: number): TrackDrop {
  const prev = rows[index - 1];
  const next = rows[index + 1];

  if (prev?.kind === 'header') {
    return {
      kind: 'in_group',
      segmentId: prev.group.segment.segmentId,
      beforeEntryId: next?.kind === 'entry' ? next.row.entry.entryId : undefined,
    };
  }
  if (
    prev?.kind === 'entry' &&
    prev.inGroup &&
    (next?.kind === 'footer' || (next?.kind === 'entry' && next.group === prev.group))
  ) {
    return {
      kind: 'in_group',
      segmentId: prev.group.segment.segmentId,
      afterEntryId: prev.row.entry.entryId,
    };
  }
  return {
    kind: 'not_in_group',
    afterSegmentId: prev ? prev.group.segment.segmentId : undefined,
    beforeSegmentId: next ? next.group.segment.segmentId : undefined,
  };
}
