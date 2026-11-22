/**
 * Removes tracks from groups of linked track IDs. A group is split where a
 * track was dropped: the tracks around it never played back to back, so they
 * must not stay linked. Empty groups are left out.
 */
export function withoutTracks(groups: readonly string[][], drop: ReadonlySet<string>): string[][] {
  const kept: string[][] = [];

  for (const group of groups) {
    let run: string[] = [];
    for (const trackId of group) {
      if (!drop.has(trackId)) {
        run.push(trackId);
        continue;
      }
      if (run.length > 0) {
        kept.push(run);
      }
      run = [];
    }
    if (run.length > 0) {
      kept.push(run);
    }
  }

  return kept;
}
