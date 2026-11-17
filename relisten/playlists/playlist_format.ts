import plur from 'plur';

/** "6 tracks · 1 hr 21 min". Duration is left out until tracks have loaded. */
export function playlistSizeLine(entryCount: number, durationSeconds: number): string {
  const tracks = `${entryCount.toLocaleString()} ${plur('track', entryCount)}`;
  return durationSeconds > 0 ? `${tracks} · ${humanDuration(durationSeconds)}` : tracks;
}

/** "1 hr 21 min", "58 min", "4 min". */
export function humanDuration(seconds: number): string {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

/** "Grateful Dead", "Grateful Dead, Phish", "Widespread Panic, Phish, and 3 more". */
export function artistLine(artistNames: string[]): string {
  if (artistNames.length <= 2) return artistNames.join(', ');
  return `${artistNames.slice(0, 2).join(', ')}, and ${artistNames.length - 2} more`;
}

/** "Deleted today", "Deleted yesterday", "Deleted 3 days ago". */
export function deletedAgo(deletedAt: Date, now = new Date()): string {
  const days = Math.floor((now.getTime() - deletedAt.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Deleted today';
  if (days === 1) return 'Deleted yesterday';
  return `Deleted ${days} days ago`;
}
