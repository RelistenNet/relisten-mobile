import type { TrackDrop } from '@/relisten/playlists/playlist_actions';
import { entryTitle } from '@/relisten/playlists/playlist_format';
import type { PlaylistRowEntry, PlaylistRowGroup } from '@/relisten/playlists/playlist_hooks';

/**
 * Edit-mode list items and drag targets.
 *
 * Edit mode is one list. A group that is more than one plain track is drawn
 * as a frame: its rows are joined by a rail, under a slim "Linked · N tracks"
 * line when it has several entries and a description row when it has one.
 * Entries are tracks or text blocks; both are rows of the same height and drag
 * the same way. A group with only a description (prose-only) is one row.
 *
 * While an entry is dragged, the list offers drop slots, and a placeholder
 * opens at the chosen one. Where a frame starts or ends there are two slots at
 * the same seam, one inside the frame and one outside it, a short finger move
 * apart. Holding an entry partly over a single track arms a third kind of slot
 * that links the two.
 *
 * Everything here is plain data in content coordinates (0 is the first item,
 * below the list header), so the drag gesture can pick a slot with arithmetic
 * on the UI thread. Every item has a fixed height from `EditMetrics`.
 */

/**
 * Where a row sits in a frame, which decides how its rail is drawn: `only` is
 * a short rail for a frame shown as one row.
 */
export type LinkPosition = 'first' | 'middle' | 'last' | 'only';

export type EditItem =
  /** The "Linked · N" line over a group of several entries; its handle drags the group. */
  | { kind: 'link'; key: string; group: PlaylistRowGroup }
  /** A framed group's description. Tapping edits it; it has no handle of its own. */
  | {
      kind: 'description';
      key: string;
      group: PlaylistRowGroup;
      startsFrame: boolean;
    }
  /** A group with only a description, as one row; its handle drags the group. */
  | { kind: 'prose'; key: string; group: PlaylistRowGroup }
  | {
      /** A track or a text block (`row.status === 'text'`). */
      kind: 'track';
      key: string;
      group: PlaylistRowGroup;
      row: PlaylistRowEntry;
      /** Set for entries inside a frame, which never start it. */
      inFrame: boolean;
    }
  /** A whole group as one row, while a group is being dragged. */
  | { kind: 'collapsed'; key: string; group: PlaylistRowGroup };

export interface EditMetrics {
  trackHeight: number;
  linkHeight: number;
  descriptionHeight: number;
}

/** Fixed heights keep slot positions simple arithmetic. They scale with Dynamic Type. */
export function editMetrics(fontScale: number): EditMetrics {
  return {
    trackHeight: Math.max(56, Math.round(12 + 46 * fontScale)),
    linkHeight: Math.max(36, Math.round(16 + 20 * fontScale)),
    descriptionHeight: Math.max(40, Math.round(18 + 22 * fontScale)),
  };
}

export function itemHeight(item: EditItem, metrics: EditMetrics): number {
  switch (item.kind) {
    case 'link':
      return metrics.linkHeight;
    case 'description':
      return metrics.descriptionHeight;
    case 'prose':
    case 'track':
    case 'collapsed':
      return metrics.trackHeight;
  }
}

/** Whether a group has a description, which frames it and keeps it alive with no entries. */
export function hasDescription(group: PlaylistRowGroup): boolean {
  return !!group.segment.description;
}

/**
 * Whether a group is drawn as a frame and offers slots inside it: several
 * entries, or any description. A single plain track is not framed; dragging
 * onto it links by holding instead.
 */
export function isFramed(group: PlaylistRowGroup): boolean {
  return group.entries.length > 1 || hasDescription(group);
}

/** What a row's handle drags, or undefined for rows without a handle. */
export type DragSource = { kind: 'track' | 'group'; id: string };

export function dragSource(item: EditItem): DragSource | undefined {
  switch (item.kind) {
    case 'track':
      return { kind: 'track', id: item.row.entry.entryId };
    case 'link':
    case 'prose':
      return { kind: 'group', id: item.group.segment.segmentId };
    default:
      return undefined;
  }
}

export type DragDrop =
  | { kind: 'track'; drop: TrackDrop }
  | { kind: 'segment'; afterSegmentId?: string; beforeSegmentId?: string };

export interface DropSlot {
  /** Where the dragged row's top edge selects this slot, in gapless content coordinates. */
  y: number;
  /** The item index the placeholder is inserted before. */
  gapIndex: number;
  /** Whether the placeholder sits inside a frame, on its rail. */
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
 * How far the inside and outside slots at a frame's end sit from the seam, as
 * a share of a row. Moving about half a row switches between them. Relative to
 * the row so it holds at large text sizes.
 */
const EDGE_OFFSET_ROWS = 0.25;

// region Resting list

/**
 * The list in edit mode, with nothing being dragged: every group's rows.
 * Text is added from menus and the Add Text button rather than from rows in
 * the gaps, which would make the list much taller; a new block is then
 * dragged into place.
 */
export function editItems(groups: PlaylistRowGroup[]): EditItem[] {
  return groups.flatMap((group) => {
    const framed = isFramed(group);
    return [...headerItems(group), ...group.entries.map((row) => entryItem(group, row, framed))];
  });
}

/**
 * The rows a group shows above its entries. They come from the group as it
 * is, so a group keeps its header while a drag takes one of its entries away.
 */
function headerItems(group: PlaylistRowGroup): EditItem[] {
  const segmentId = group.segment.segmentId;
  if (group.entries.length === 0) {
    return [{ kind: 'prose', key: `prose:${segmentId}`, group }];
  }

  const items: EditItem[] = [];
  if (group.entries.length > 1) {
    items.push({ kind: 'link', key: `link:${segmentId}`, group });
  }
  if (hasDescription(group)) {
    items.push({
      kind: 'description',
      key: `description:${segmentId}`,
      group,
      startsFrame: items.length === 0,
    });
  }
  return items;
}

function entryItem(group: PlaylistRowGroup, row: PlaylistRowEntry, inFrame: boolean): EditItem {
  return { kind: 'track', key: row.entry.entryId, group, row, inFrame };
}

// endregion

// region Entry drags

interface RemainingGroup {
  group: PlaylistRowGroup;
  /** The group's entries without the dragged one. */
  entries: PlaylistRowEntry[];
  /** Judged before the drag, so the frame doesn't reshape under the finger. */
  framed: boolean;
}

/** Accumulates a plan's items and slots top to bottom, tracking the running content `y`. */
class PlanBuilder {
  readonly items: EditItem[] = [];
  readonly slots: DropSlot[] = [];
  readonly hoverTargets: HoverTarget[] = [];
  y = 0;

  constructor(readonly metrics: EditMetrics) {}

  pushItem(item: EditItem) {
    this.items.push(item);
    this.y += itemHeight(item, this.metrics);
  }

  pushSlot(slot: Omit<DropSlot, 'gapIndex'>) {
    this.slots.push({ ...slot, gapIndex: this.items.length });
  }
}

/**
 * Drag plan for one entry: a track or a text block. The entry leaves the list
 * and a placeholder takes its place. A frame it leaves keeps its header and
 * rail until the drop, so the list doesn't reshape under the finger; a framed
 * group it empties stays too, since a description keeps a group alive.
 *
 * Slot `y`s follow the items top to bottom:
 * - at each seam between groups, an outside slot at the seam, and when the
 *   group above is framed, an inside slot just above the seam and the outside
 *   one just below it (`EDGE_OFFSET_ROWS`);
 * - inside a framed group, a slot at the top of each entry, below the header;
 * - after each single track, a link slot chosen only by holding over it.
 */
export function planTrackDrag(
  groups: PlaylistRowGroup[],
  entryId: string,
  metrics: EditMetrics
): DragPlan {
  const remaining = remainingGroups(groups, entryId);
  const plan = new PlanBuilder(metrics);
  const edgeOffset = metrics.trackHeight * EDGE_OFFSET_ROWS;

  remaining.forEach((current, index) => {
    addSeamSlots(plan, remaining[index - 1], current, edgeOffset);
    addGroupRows(plan, current);
  });
  addSeamSlots(plan, remaining[remaining.length - 1], undefined, edgeOffset);

  return {
    items: plan.items,
    slots: plan.slots,
    hoverTargets: plan.hoverTargets,
    initialSlot: originSlot(plan.slots, groups, entryId),
    gapHeight: metrics.trackHeight,
  };
}

/** The groups left while an entry is dragged. A group with nothing left to show goes. */
function remainingGroups(groups: PlaylistRowGroup[], entryId: string): RemainingGroup[] {
  return groups.flatMap((group) => {
    const entries = group.entries.filter((r) => r.entry.entryId !== entryId);
    if (entries.length === 0 && !hasDescription(group)) {
      return [];
    }
    return [{ group, entries, framed: isFramed(group) }];
  });
}

/** The slots where `above` ends and `below` starts; either is absent at the list's ends. */
function addSeamSlots(
  plan: PlanBuilder,
  above: RemainingGroup | undefined,
  below: RemainingGroup | undefined,
  edgeOffset: number
) {
  const seam = plan.y;

  if (above?.framed) {
    const last = above.entries[above.entries.length - 1];
    plan.pushSlot({
      y: seam - edgeOffset,
      inLink: true,
      // A framed group with no entries left is its description alone.
      label: last ? `Linked with ${entryTitle(last)}` : 'With the text above',
      drop: {
        kind: 'track',
        drop: {
          kind: 'in_group',
          segmentId: above.group.segment.segmentId,
          afterEntryId: last?.entry.entryId,
        },
      },
    });
  }

  plan.pushSlot({
    y: above?.framed ? seam + edgeOffset : seam,
    inLink: false,
    label: above?.framed || below?.framed ? 'Not linked' : undefined,
    drop: {
      kind: 'track',
      drop: {
        kind: 'not_in_group',
        afterSegmentId: above?.group.segment.segmentId,
        beforeSegmentId: below?.group.segment.segmentId,
      },
    },
  });
}

/** A group's header and entries, with the slots inside a frame or after a single track. */
function addGroupRows(plan: PlanBuilder, current: RemainingGroup) {
  const segmentId = current.group.segment.segmentId;
  headerItems(current.group).forEach((item) => plan.pushItem(item));

  current.entries.forEach((row, index) => {
    if (current.framed) {
      plan.pushSlot({
        y: plan.y,
        inLink: true,
        label: index === 0 ? `Linked with ${entryTitle(row)}` : undefined,
        drop: {
          kind: 'track',
          drop: {
            kind: 'in_group',
            segmentId,
            afterEntryId: current.entries[index - 1]?.entry.entryId,
            beforeEntryId: row.entry.entryId,
          },
        },
      });
    }

    const top = plan.y;
    plan.pushItem(entryItem(current.group, row, current.framed));

    if (!current.framed) {
      plan.hoverTargets.push({ top, slotIndex: plan.slots.length });
      plan.pushSlot({
        y: plan.y,
        inLink: true,
        linkTarget: true,
        label: `Linked with ${entryTitle(row)}`,
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
}

/**
 * The slot that puts the entry back where it was, so a drag starts there and
 * dropping in place changes nothing. Inside a frame that is the slot before
 * its next neighbor, or the frame's inside end; a single entry sits between
 * its neighboring groups.
 */
function originSlot(slots: DropSlot[], groups: PlaylistRowGroup[], entryId: string): number {
  const origin = originDrop(groups, entryId);
  const index = origin
    ? slots.findIndex(
        (slot) => !slot.linkTarget && slot.drop.kind === 'track' && sameDrop(slot.drop.drop, origin)
      )
    : -1;
  return Math.max(0, index);
}

function originDrop(groups: PlaylistRowGroup[], entryId: string): TrackDrop | undefined {
  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    const index = group.entries.findIndex((r) => r.entry.entryId === entryId);
    if (index < 0) {
      continue;
    }

    if (isFramed(group)) {
      return {
        kind: 'in_group',
        segmentId: group.segment.segmentId,
        afterEntryId: group.entries[index - 1]?.entry.entryId,
        beforeEntryId: group.entries[index + 1]?.entry.entryId,
      };
    }
    return {
      kind: 'not_in_group',
      afterSegmentId: groups[g - 1]?.segment.segmentId,
      beforeSegmentId: groups[g + 1]?.segment.segmentId,
    };
  }
  return undefined;
}

function sameDrop(a: TrackDrop, b: TrackDrop): boolean {
  if (a.kind === 'in_group' && b.kind === 'in_group') {
    return (
      a.segmentId === b.segmentId &&
      a.afterEntryId === b.afterEntryId &&
      a.beforeEntryId === b.beforeEntryId
    );
  }
  if (a.kind === 'not_in_group' && b.kind === 'not_in_group') {
    return a.afterSegmentId === b.afterSegmentId && a.beforeSegmentId === b.beforeSegmentId;
  }
  return false;
}

/**
 * How much shorter the list above the dragged row gets when the drag plan
 * replaces the resting list: for a group drag, the rows above it that fold.
 * An entry drag keeps every row above it, so its lead is zero. The edit list puts a spacer this tall above the
 * plan's rows and measures the finger below it.
 *
 * Invariant: the dragged row's resting top minus the lead is the top of the
 * plan's starting placeholder. So on the first frame the row sits exactly on
 * its own slot, the placeholder opens under the finger, and letting go
 * without moving changes nothing.
 */
export function dragLead(
  restingItems: EditItem[],
  draggedKey: string,
  plan: DragPlan,
  metrics: EditMetrics
): number {
  const index = restingItems.findIndex((item) => item.key === draggedKey);
  const slot = plan.slots[plan.initialSlot];
  if (index < 0 || !slot) {
    return 0;
  }
  const restingTop = itemTops(restingItems, metrics)[index];
  const planTop = itemTops(plan.items, metrics)[slot.gapIndex] ?? totalHeight(plan.items, metrics);
  return Math.max(0, restingTop - planTop);
}

// endregion

// region Group drags

/**
 * Drag plan for a whole group: a link, or a prose-only group. Every other
 * group folds to one row so the list is short enough to move across, and
 * groups only land between other groups.
 */
export function planGroupDrag(
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

  // Collapsed rows are all one track tall, so slot `index` sits at its top.
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

// endregion

// region Geometry

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

export function totalHeight(items: EditItem[], metrics: EditMetrics): number {
  return items.reduce((sum, item) => sum + itemHeight(item, metrics), 0);
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

/** Switching slots needs a little extra distance (a tenth of a row), so a finger resting on a boundary doesn't flicker. */
const HYSTERESIS_ROWS = 0.1;

/** The positional slot nearest `y`, keeping `current` unless another is clearly closer. */
export function nearestSlot(
  slotYs: number[],
  linkTargets: boolean[],
  y: number,
  current: number,
  rowHeight: number
): number {
  'worklet';
  let best = current;
  let bestDistance =
    current >= 0 && !linkTargets[current]
      ? Math.abs(slotYs[current] - y) - rowHeight * HYSTERESIS_ROWS
      : Infinity;
  for (let i = 0; i < slotYs.length; i++) {
    if (linkTargets[i]) {
      continue;
    }
    const distance = Math.abs(slotYs[i] - y);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

// endregion
