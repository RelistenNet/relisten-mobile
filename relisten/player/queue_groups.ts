/**
 * Group-aware queue ordering. Occurrences enqueued from one playlist segment share
 * a segment instance ID; shuffle and Play Next treat each such run as one block.
 */
export interface GroupedOccurrence {
  playlistContext?: { segmentInstanceId: string };
}

/**
 * Runs of consecutive occurrences that share a playlist segment instance; every
 * other occurrence is its own run. Shuffle moves runs, never splitting a group.
 */
function groupRuns<T extends GroupedOccurrence>(tracks: T[]): T[][] {
  const runs: T[][] = [];
  for (const track of tracks) {
    const groupId = track.playlistContext?.segmentInstanceId;
    const last = runs[runs.length - 1];
    if (groupId && last && last[0].playlistContext?.segmentInstanceId === groupId) {
      last.push(track);
    } else {
      runs.push([track]);
    }
  }
  return runs;
}

/**
 * Shuffles while keeping playlist groups together. When a track is playing, it
 * stays first, followed by the rest of its group in order; the group's earlier
 * tracks become a run of their own.
 */
export function shuffleKeepingGroups<T extends GroupedOccurrence>(tracks: T[], current?: T) {
  const runs = groupRuns(tracks);
  if (!current) {
    return shuffleArray(runs).flat();
  }

  const currentRunIndex = runs.findIndex((run) => run.includes(current));
  const [currentRun] = runs.splice(currentRunIndex, 1);
  const split = currentRun.indexOf(current);
  if (split > 0) {
    runs.push(currentRun.slice(0, split));
  }
  return [...currentRun.slice(split), ...shuffleArray(runs).flat()];
}

function shuffleArray<T>(arr: T[]) {
  // ye old fisher-yates
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    // swap
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

/** The index of the last occurrence in the group that `index` belongs to. */
export function endOfGroupIndex<T extends GroupedOccurrence>(
  tracks: T[],
  index: number | undefined
) {
  if (index === undefined) {
    return undefined;
  }
  const groupId = tracks[index]?.playlistContext?.segmentInstanceId;
  let end = index;
  while (groupId && tracks[end + 1]?.playlistContext?.segmentInstanceId === groupId) {
    end++;
  }
  return end;
}
