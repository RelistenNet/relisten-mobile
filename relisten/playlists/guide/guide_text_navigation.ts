import type { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

/**
 * What the guide text editor edits. The author never picks a storage type:
 * where they start writing decides it.
 *
 * - `segment`: a group's description, shown at the top of the group.
 * - `entry`: a track's note, or a text block's text.
 * - `text`: a new text block inside a group, after `afterEntryId` (or first).
 * - `section`: a new group with only text, after `afterSegmentId` (or first).
 */
export type GuideTextTarget =
  | { kind: 'segment'; playlistId: string; segmentId: string }
  | { kind: 'entry'; playlistId: string; entryId: string }
  | { kind: 'text'; playlistId: string; segmentId: string; afterEntryId?: string }
  | { kind: 'section'; playlistId: string; afterSegmentId?: string };

/** A target without its playlist, for code that already knows which playlist it is in. */
export type GuideTextPlace = GuideTextTarget extends infer T
  ? T extends GuideTextTarget
    ? Omit<T, 'playlistId'>
    : never
  : never;

/** Opens the guide text editor as a modal over the playlist. */
export function openGuideTextEditor(router: Router, target: GuideTextTarget) {
  router.push({ pathname: '/relisten/guide-text', params: toParams(target) });
}

/** Route params are strings; absent anchors are left out. */
function toParams(target: GuideTextTarget): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(target)) {
    if (value !== undefined) {
      params[key] = value;
    }
  }
  return params;
}

/** Reads a target back from route params, or null when they don't describe one. */
export function guideTextTargetFromParams(
  params: Partial<Record<string, string | string[]>>
): GuideTextTarget | null {
  const value = (key: string) => {
    const raw = params[key];
    return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
  };
  const playlistId = value('playlistId');
  if (!playlistId) {
    return null;
  }

  switch (value('kind')) {
    case 'segment': {
      const segmentId = value('segmentId');
      return segmentId ? { kind: 'segment', playlistId, segmentId } : null;
    }
    case 'entry': {
      const entryId = value('entryId');
      return entryId ? { kind: 'entry', playlistId, entryId } : null;
    }
    case 'text': {
      const segmentId = value('segmentId');
      return segmentId
        ? { kind: 'text', playlistId, segmentId, afterEntryId: value('afterEntryId') }
        : null;
    }
    case 'section':
      return { kind: 'section', playlistId, afterSegmentId: value('afterSegmentId') };
    default:
      return null;
  }
}
