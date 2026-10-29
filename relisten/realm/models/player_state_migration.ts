import Realm from 'realm';
import { PlayerRepeatState, PlayerShuffleState } from '@/relisten/player/player_modes';
import {
  PlayerCheckpointProps,
  PlayerQueueEntryProps,
  PlayerShuffleOrderProps,
  PlayerState,
  PlayerStateProps,
} from './player_state';

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
  // Main and accounts builds used different player formats at schema 14.
  const oldPlayerSchema = oldRealm.schema.find((schema) => schema.name === 'PlayerState');
  if (!oldPlayerSchema?.properties.queueSourceTrackUuids) {
    return;
  }

  for (const legacy of oldRealm.objects<LegacyPlayerState>('PlayerState')) {
    const entries: PlayerQueueEntryProps[] = legacy.queueSourceTrackUuids.map(
      (sourceTrackUuid, index) => ({ id: `${legacy.id}:${index}`, sourceTrackUuid })
    );
    let playbackOrder = entries;
    let activeIndex = legacy.activeSourceTrackIndex;
    let shuffleOrder: PlayerShuffleOrderProps | null = null;
    if (legacy.queueShuffleState === PlayerShuffleState.SHUFFLE_ON) {
      playbackOrder = migrateShuffleOrder(legacy, entries);
      activeIndex = legacy.activeSourceTrackShuffledIndex;
      shuffleOrder = { entryIds: playbackOrder.map((entry) => entry.id) };
    }
    const activeEntry = playbackOrder[activeIndex ?? -1];
    const props: PlayerStateProps = {
      queueEntries: entries,
      shuffleOrder,
      repeatMode: legacy.queueRepeatState,
      checkpoint: migrateCheckpoint(oldRealm, legacy, activeEntry),
      lastUpdatedAt: legacy.lastUpdatedAt,
    };
    newRealm.create(
      PlayerState,
      { id: legacy.id, ...props } as Realm.Unmanaged<PlayerState>,
      Realm.UpdateMode.Modified
    );
  }
}

function migrateCheckpoint(
  oldRealm: Realm,
  legacy: LegacyPlayerState,
  activeEntry: PlayerQueueEntryProps | undefined
): PlayerCheckpointProps | null {
  if (!activeEntry) {
    return null;
  }

  let catalogDuration: number | null | undefined;
  const hasSourceTracks = oldRealm.schema.some((schema) => schema.name === 'SourceTrack');
  if (hasSourceTracks) {
    catalogDuration = oldRealm.objectForPrimaryKey<LegacySourceTrack>(
      'SourceTrack',
      activeEntry.sourceTrackUuid
    )?.duration;
  }
  // Legacy timing did not identify its entry. Keep its catalog-first clamp policy.
  const duration = positiveDuration(catalogDuration) ?? positiveDuration(legacy.duration);
  let elapsed = 0;
  if (Number.isFinite(legacy.elapsed)) {
    elapsed = Math.max(0, legacy.elapsed ?? 0);
  }
  if (duration !== null) {
    elapsed = Math.min(elapsed, duration);
  }
  return {
    entryId: activeEntry.id,
    elapsedSeconds: elapsed,
    durationSeconds: duration,
  };
}

function positiveDuration(duration: number | null | undefined): number | null {
  if (duration == null || !Number.isFinite(duration) || duration <= 0) {
    return null;
  }
  return duration;
}

function migrateShuffleOrder(
  legacy: LegacyPlayerState,
  entries: PlayerQueueEntryProps[]
): PlayerQueueEntryProps[] {
  const available = new Set(entries);
  const active = entries[legacy.activeSourceTrackIndex ?? -1];
  const activeShuffleIndex = legacy.activeSourceTrackShuffledIndex;
  const knownActivePair =
    active !== undefined &&
    activeShuffleIndex !== null &&
    legacy.queueSourceTrackShuffledUuids[activeShuffleIndex] === active.sourceTrackUuid;
  if (knownActivePair) {
    available.delete(active);
  }

  // UUIDs cannot recover every duplicate's historical identity. Reserve the known
  // active pair, then assign remaining occurrences in original queue order.
  const order: PlayerQueueEntryProps[] = [];
  legacy.queueSourceTrackShuffledUuids.forEach((uuid, index) => {
    let entry: PlayerQueueEntryProps | undefined;
    if (knownActivePair && index === activeShuffleIndex) {
      entry = active;
    } else {
      entry = entries.find(
        (candidate) => available.has(candidate) && candidate.sourceTrackUuid === uuid
      );
    }
    if (entry) {
      order.push(entry);
      available.delete(entry);
    }
  });
  order.push(...available);
  return order;
}
