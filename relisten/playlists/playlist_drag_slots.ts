import type { TrackDrop } from '@/relisten/playlists/playlist_actions';
import type { PlaylistRowEntry, PlaylistRowGroup } from '@/relisten/playlists/playlist_hooks';

/**
 * Edit-mode list items and drag targets.
 *
 * Edit mode is one list. Linked tracks sit under a slim "Linked · N tracks"
 * line, joined by a rail. While a track is dragged, the list offers drop
 * slots, and a placeholder opens at the chosen one. Where a link starts or
 * ends there are two slots at the same seam, one inside the link and one
 * outside it, a short finger move apart. Holding a track partly over a single
 * track arms a third kind of slot that links the two.
 *
 * Everything here is plain data in content coordinates (0 is the first item,
 * below the list header), so the drag gesture can pick a slot with arithmetic
 * on the UI thread.
 */

export type LinkPosition = 'first' | 'middle' | 'last';

export type EditItem =
  | { kind: 'link'; key: string; group: PlaylistRowGroup }
  | {
      kind: 'track';
      key: string;
      group: PlaylistRowGroup;
      row: PlaylistRowEntry;
      /** Set for tracks in a link; the link line above is always `first`. */
      link?: Exclude<LinkPosition, 'first'>;
      showShowLine: boolean;
    }
  /** A whole link or single track as one row, while a link is being dragged. */
  | { kind: 'collapsed'; key: string; group: PlaylistRowGroup };

export interface EditMetrics {
  trackHeight: number;
  linkHeight: number;
}

/** Fixed heights keep slot positions simple arithmetic. They scale with Dynamic Type. */
export function editMetrics(fontScale: number): EditMetrics {
  return {
    trackHeight: Math.max(56, Math.round(12 + 46 * fontScale)),
    linkHeight: Math.max(36, Math.round(16 + 20 * fontScale)),
  };
}

export function itemHeight(item: EditItem, metrics: EditMetrics): number {
  return item.kind === 'link' ? metrics.linkHeight : metrics.trackHeight;
}

export type DragDrop =
  | { kind: 'track'; drop: TrackDrop }
  | { kind: 'segment'; afterSegmentId?: string; beforeSegmentId?: string };

export interface DropSlot {
  /** Where the dragged row's top edge selects this slot, in gapless content coordinates. */
  y: number;
  /** The item index the placeholder is inserted before. */
  gapIndex: number;
  /** Whether the placeholder sits inside a link, on its rail. */
  inLink: boolean;
  /** Shown in the placeholder where the meaning isn't obvious from position alone. */
  label?: string;
  /** Chosen only by holding over a single track, never by position. */
  linkTarget?: boolean;
  drop: DragDrop;
}

/** A single track that a held drag can link onto. */
export interface HoverTarget {
  top: number;
  bottom: number;
  slotIndex: number;
}

export interface DragPlan {
  items: EditItem[];
  slots: DropSlot[];
  hoverTargets: HoverTarget[];
  initialSlot: number;
  /** Height of the placeholder and of the row under the finger. */
  gapHeight: number;
}

/**
 * How far the inside and outside slots at a link's end sit from the seam. A
 * finger move of about half a row switches between them, with a haptic tick.
 */
const EDGE_OFFSET = 14;

/** The list in edit mode, with nothing being dragged. */
export function editItems(groups: PlaylistRowGroup[]): EditItem[] {
  return groups.flatMap((group) => itemsForGroup(group, group.entries));
}

function itemsForGroup(
  group: PlaylistRowGroup,
  entries: PlaylistRowEntry[],
  linked = group.entries.length > 1
): EditItem[] {
  if (!linked) {
    return entries.map((row) => trackItem(group, row, undefined, true));
  }
  const oneShow = sameRecording(entries);
  return [
    { kind: 'link', key: `link:${group.segment.segmentId}`, group },
    ...entries.map((row, index) =>
      trackItem(
        group,
        row,
        index === entries.length - 1 ? 'last' : 'middle',
        !oneShow || index === 0
      )
    ),
  ];
}

function trackItem(
  group: PlaylistRowGroup,
  row: PlaylistRowEntry,
  link: 'middle' | 'last' | undefined,
  showShowLine: boolean
): EditItem {
  return {
    kind: 'track',
    key: row.entry.entryId,
    group,
    row,
    link,
    showShowLine,
  };
}

function sameRecording(entries: PlaylistRowEntry[]) {
  const first = entries[0]?.sourceTrack?.sourceUuid;
  return first !== undefined && entries.every((r) => r.sourceTrack?.sourceUuid === first);
}

const titleOf = (row: PlaylistRowEntry | undefined) => row?.sourceTrack?.title ?? 'track';

/**
 * Drag plan for one track. The track leaves the list and a placeholder takes
 * its place. A link it leaves keeps its line and rail until the drop, so the
 * list doesn't reshape under the finger.
 */
export function planTrackDrag(
  groups: PlaylistRowGroup[],
  entryId: string,
  metrics: EditMetrics
): DragPlan {
  const remaining = groups
    .map((group) => ({
      group,
      linked: group.entries.length > 1,
      entries: group.entries.filter((r) => r.entry.entryId !== entryId),
    }))
    .filter((g) => g.entries.length > 0);
  const origin = locateEntry(groups, entryId);

  const items: EditItem[] = [];
  const slots: DropSlot[] = [];
  const hoverTargets: HoverTarget[] = [];
  let y = 0;
  let initialSlot = 0;

  const addSlot = (slot: DropSlot, isOrigin: boolean) => {
    if (isOrigin) initialSlot = slots.length;
    slots.push(slot);
  };

  remaining.forEach((current, index) => {
    const previous = remaining[index - 1];
    const segmentId = current.group.segment.segmentId;
    const seam = y;
    const firstItem = items.length;

    if (previous?.linked) {
      const last = previous.entries[previous.entries.length - 1];
      addSlot(
        {
          y: seam - EDGE_OFFSET,
          gapIndex: firstItem,
          inLink: true,
          label: `Linked with ${titleOf(last)}`,
          drop: {
            kind: 'track',
            drop: {
              kind: 'in_group',
              segmentId: previous.group.segment.segmentId,
              afterEntryId: last.entry.entryId,
            },
          },
        },
        origin?.single === false &&
          origin.segmentId === previous.group.segment.segmentId &&
          origin.afterEntryId === last.entry.entryId &&
          origin.beforeEntryId === undefined
      );
    }

    addSlot(
      {
        y: previous?.linked ? seam + EDGE_OFFSET : seam,
        gapIndex: firstItem,
        inLink: false,
        label: previous?.linked || current.linked ? 'Not linked' : undefined,
        drop: {
          kind: 'track',
          drop: {
            kind: 'not_in_group',
            afterSegmentId: previous?.group.segment.segmentId,
            beforeSegmentId: segmentId,
          },
        },
      },
      origin?.single === true && origin.beforeSegmentId === segmentId
    );

    const groupItems = itemsForGroup(current.group, current.entries, current.linked);
    if (current.linked) {
      items.push(groupItems[0]);
      y += metrics.linkHeight;
    }

    current.entries.forEach((row, entryIndex) => {
      if (current.linked) {
        const before = current.entries[entryIndex - 1];
        addSlot(
          {
            y,
            gapIndex: items.length,
            inLink: true,
            label: entryIndex === 0 ? `Linked with ${titleOf(row)}` : undefined,
            drop: {
              kind: 'track',
              drop: {
                kind: 'in_group',
                segmentId,
                afterEntryId: before?.entry.entryId,
                beforeEntryId: row.entry.entryId,
              },
            },
          },
          origin?.single === false &&
            origin.segmentId === segmentId &&
            origin.beforeEntryId === row.entry.entryId
        );
      }

      const top = y;
      items.push(groupItems[current.linked ? entryIndex + 1 : entryIndex]);
      y += metrics.trackHeight;

      if (!current.linked) {
        hoverTargets.push({ top, bottom: y, slotIndex: slots.length });
        slots.push({
          y,
          gapIndex: items.length,
          inLink: true,
          linkTarget: true,
          label: `Linked with ${titleOf(row)}`,
          drop: {
            kind: 'track',
            drop: {
              kind: 'in_group',
              segmentId,
              afterEntryId: row.entry.entryId,
            },
          },
        });
      }
    });
  });

  const last = remaining[remaining.length - 1];
  if (last?.linked) {
    const lastEntry = last.entries[last.entries.length - 1];
    addSlot(
      {
        y: y - EDGE_OFFSET,
        gapIndex: items.length,
        inLink: true,
        label: `Linked with ${titleOf(lastEntry)}`,
        drop: {
          kind: 'track',
          drop: {
            kind: 'in_group',
            segmentId: last.group.segment.segmentId,
            afterEntryId: lastEntry.entry.entryId,
          },
        },
      },
      origin?.single === false &&
        origin.segmentId === last.group.segment.segmentId &&
        origin.beforeEntryId === undefined
    );
  }
  addSlot(
    {
      y: last?.linked ? y + EDGE_OFFSET : y,
      gapIndex: items.length,
      inLink: false,
      label: last?.linked ? 'Not linked' : undefined,
      drop: {
        kind: 'track',
        drop: {
          kind: 'not_in_group',
          afterSegmentId: last?.group.segment.segmentId,
        },
      },
    },
    origin?.single === true && origin.beforeSegmentId === undefined
  );

  return {
    items,
    slots,
    hoverTargets,
    initialSlot,
    gapHeight: metrics.trackHeight,
  };
}

/** Where a track sat, described the way slots describe places, so its own slot can be found. */
function locateEntry(groups: PlaylistRowGroup[], entryId: string) {
  for (let g = 0; g < groups.length; g++) {
    const entries = groups[g].entries;
    const index = entries.findIndex((r) => r.entry.entryId === entryId);
    if (index < 0) continue;
    if (entries.length === 1) {
      return {
        single: true as const,
        beforeSegmentId: groups[g + 1]?.segment.segmentId,
      };
    }
    return {
      single: false as const,
      segmentId: groups[g].segment.segmentId,
      // The neighbor after it, or, for the last track, the one before it.
      beforeEntryId: entries[index + 1]?.entry.entryId,
      afterEntryId: entries[index - 1]?.entry.entryId,
    };
  }
  return undefined;
}

/**
 * Drag plan for a whole link. Every other link folds to one row so the list is
 * short enough to move across, and links only land between other items.
 */
export function planLinkDrag(
  groups: PlaylistRowGroup[],
  segmentId: string,
  metrics: EditMetrics
): DragPlan {
  const origin = groups.findIndex((g) => g.segment.segmentId === segmentId);
  const remaining = groups.filter((g) => g.segment.segmentId !== segmentId);
  const items: EditItem[] = remaining.map((group) => ({
    kind: 'collapsed',
    key: `collapsed:${group.segment.segmentId}`,
    group,
  }));
  const slots: DropSlot[] = [];

  for (let index = 0; index <= remaining.length; index++) {
    slots.push({
      y: index * metrics.trackHeight,
      gapIndex: index,
      inLink: false,
      drop: {
        kind: 'segment',
        afterSegmentId: remaining[index - 1]?.segment.segmentId,
        beforeSegmentId: remaining[index]?.segment.segmentId,
      },
    });
  }

  return {
    items,
    slots,
    hoverTargets: [],
    initialSlot: Math.max(0, origin),
    gapHeight: metrics.trackHeight,
  };
}

/** Item tops in content coordinates, for laying out and measuring the list. */
export function itemTops(items: EditItem[], metrics: EditMetrics): number[] {
  const tops: number[] = [];
  let y = 0;
  for (const item of items) {
    tops.push(y);
    y += itemHeight(item, metrics);
  }
  return tops;
}

/**
 * Maps a position on the dragged row to gapless coordinates: the open
 * placeholder pushes everything below it down, so positions past it are
 * shifted back.
 */
export function gaplessY(y: number, gapTop: number, gapHeight: number): number {
  'worklet';
  if (y <= gapTop) {
    return y;
  }
  return y >= gapTop + gapHeight ? y - gapHeight : gapTop;
}

/** Switching slots needs a little extra distance, so a finger resting on a boundary doesn't flicker. */
const HYSTERESIS = 6;

/** The positional slot nearest `y`, keeping `current` unless another is clearly closer. */
export function nearestSlot(
  slotYs: number[],
  linkTargets: boolean[],
  y: number,
  current: number
): number {
  'worklet';
  let best = current;
  let bestDistance =
    current >= 0 && !linkTargets[current] ? Math.abs(slotYs[current] - y) - HYSTERESIS : Infinity;
  for (let i = 0; i < slotYs.length; i++) {
    if (linkTargets[i]) continue;
    const distance = Math.abs(slotYs[i] - y);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}
