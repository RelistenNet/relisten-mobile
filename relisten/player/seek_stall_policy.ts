export function shouldStartStalledTimerForSeek(playbackState: string): boolean {
  return playbackState === 'Playing' || playbackState === 'Stalled';
}
