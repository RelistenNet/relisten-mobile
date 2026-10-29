import Realm from 'realm';
import { PlayerRepeatState, PlayerShuffleState } from '@/relisten/player/player_modes';
import { PlayerQueueEntryProps, PlayerState, PlayerStateProps } from './player_state';

interface LegacyPlayerState {
  id: string;
  queueShuffleState: PlayerShuffleState;
  queueRepeatState: PlayerRepeatState;
  queueSourceTrackUuids: Realm.List<string>;
  queueSourceTrackShuffledUuids: Realm.List<string>;
  activeSourceTrackIndex: number | null;
  activeSourceTrackShuffledIndex: number | null;
  lastUpdatedAt: Date;
  elapsed: number | null;
  duration: number | null;
}

interface LegacySourceTrack {
  uuid: string;
  duration: number | null;
}

/** Convert the shipped UUID/index format to stable queue occurrence IDs. */
export function migratePlayerState(oldRealm: Realm, newRealm: Realm): void {
  if (oldRealm.schemaVersion >= 14) return;

  const hasSourceTracks = oldRealm.schema.some((schema) => schema.name === 'SourceTrack');
  for (const legacy of oldRealm.objects<LegacyPlayerState>('PlayerState')) {
    const entries: PlayerQueueEntryProps[] = legacy.queueSourceTrackUuids.map(
      (sourceTrackUuid, index) => ({
        id: `${legacy.id}:${index}`,
        sourceTrackUuid,
      })
    );
    const originalActive = entries[legacy.activeSourceTrackIndex ?? -1];
    const shuffled = legacy.queueShuffleState === PlayerShuffleState.SHUFFLE_ON;
    const shuffleEntries = shuffled ? migrateShuffleOrder(legacy, entries) : null;
    const activeEntry = shuffled
      ? shuffleEntries?.[legacy.activeSourceTrackShuffledIndex ?? -1]
      : originalActive;

    const catalogDuration =
      activeEntry && hasSourceTracks
        ? oldRealm.objectForPrimaryKey<LegacySourceTrack>(
            'SourceTrack',
            activeEntry.sourceTrackUuid
          )?.duration
        : null;
    const duration = positiveDuration(catalogDuration) ?? positiveDuration(legacy.duration);
    const elapsed = Number.isFinite(legacy.elapsed) ? Math.max(0, legacy.elapsed ?? 0) : 0;
    const props: PlayerStateProps = {
      queueEntries: entries,
      shuffleOrder: shuffleEntries ? { entryIds: shuffleEntries.map((entry) => entry.id) } : null,
      repeatMode: legacy.queueRepeatState,
      checkpoint: activeEntry
        ? {
            entryId: activeEntry.id,
            elapsedSeconds: duration === null ? elapsed : Math.min(elapsed, duration),
            durationSeconds: duration,
          }
        : null,
      lastUpdatedAt: legacy.lastUpdatedAt,
    };
    newRealm.create(
      PlayerState,
      { id: legacy.id, ...props } as Realm.Unmanaged<PlayerState>,
      Realm.UpdateMode.Modified
    );
  }
}

function positiveDuration(duration: number | null | undefined): number | null {
  return duration !== null && duration !== undefined && Number.isFinite(duration) && duration > 0
    ? duration
    : null;
}

function migrateShuffleOrder(
  legacy: LegacyPlayerState,
  entries: PlayerQueueEntryProps[]
): PlayerQueueEntryProps[] {
  const available = new Set(entries);
  const active = entries[legacy.activeSourceTrackIndex ?? -1];
  const activeShuffleIndex = legacy.activeSourceTrackShuffledIndex;
  const knownActivePair =
    active &&
    activeShuffleIndex !== null &&
    legacy.queueSourceTrackShuffledUuids[activeShuffleIndex] === active.sourceTrackUuid;
  if (knownActivePair) available.delete(active);

  // UUIDs cannot recover every duplicate's historical identity. Preserve the known
  // active pair, then assign the remaining occurrences in original queue order.
  const order: PlayerQueueEntryProps[] = [];
  legacy.queueSourceTrackShuffledUuids.forEach((uuid, index) => {
    const entry =
      knownActivePair && index === activeShuffleIndex
        ? active
        : entries.find(
            (candidate) => available.has(candidate) && candidate.sourceTrackUuid === uuid
          );
    if (entry) {
      order.push(entry);
      available.delete(entry);
    }
  });
  order.push(...available);
  return order;
}
