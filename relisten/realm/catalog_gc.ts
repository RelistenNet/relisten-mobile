import Realm, { AnyRealmObject } from 'realm';

import { reportCatalogMaintenance } from '@/relisten/realm/catalog_access_monitor';
import {
  auditCatalogRetirementGraph,
  CatalogGraphAuditResult,
  CatalogModelCounts,
  CatalogModelName,
  CatalogObject,
  CATALOG_MODEL_NAMES,
  emptyCatalogModelCounts,
} from '@/relisten/realm/catalog_retirement_graph';
import { Artist } from '@/relisten/realm/models/artist';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { PlayerState } from '@/relisten/realm/models/player_state';
import { Show } from '@/relisten/realm/models/show';
import { Song } from '@/relisten/realm/models/song';
import { Source } from '@/relisten/realm/models/source';
import { SourceSet } from '@/relisten/realm/models/source_set';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { SourceTrackOfflineInfo } from '@/relisten/realm/models/source_track_offline_info';
import { Tour } from '@/relisten/realm/models/tour';
import { Venue } from '@/relisten/realm/models/venue';
import { Year } from '@/relisten/realm/models/year';

export { auditCatalogRetirementGraph } from '@/relisten/realm/catalog_retirement_graph';

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_CATALOG_GC_GRACE_PERIOD_MS = 30 * DAY_MS;
export const DEFAULT_CATALOG_GC_BATCH_LIMIT = 250;
export const DEFAULT_CATALOG_GC_SCAN_MULTIPLIER = 4;

export interface CatalogGarbageCollectionOptions {
  now?: Date;
  gracePeriodMs?: number;
  batchLimit?: number;
  scanLimitPerModel?: number;
  auditGraph?: boolean;
}

export interface CatalogGcModelResult {
  mature: number;
  scanOffset: number;
  scanned: number;
  collected: number;
  skipped: number;
  deferred: number;
  blockers: Record<string, number>;
}

export interface CatalogGarbageCollectionResult {
  now: Date;
  cutoff: Date;
  gracePeriodMs: number;
  batchLimit: number;
  scanLimitPerModel: number;
  collected: CatalogModelCounts;
  totalCollected: number;
  totalScanned: number;
  totalSkipped: number;
  models: Record<CatalogModelName, CatalogGcModelResult>;
  graphAudit?: CatalogGraphAuditResult;
}

interface GcContext {
  realm: Realm;
  queuedSourceTrackUuids: Set<string>;
  favoriteClosure: Map<string, boolean>;
}

interface ModelSweepState {
  modelName: CatalogModelName;
  result: CatalogGcModelResult;
  candidates: CatalogObject[];
  nextCandidateIndex: number;
}

function emptyModelResult(): CatalogGcModelResult {
  return {
    mature: 0,
    scanOffset: 0,
    scanned: 0,
    collected: 0,
    skipped: 0,
    deferred: 0,
    blockers: {},
  };
}

function emptyModelResults(): Record<CatalogModelName, CatalogGcModelResult> {
  return {
    SourceTrack: emptyModelResult(),
    SourceSet: emptyModelResult(),
    Source: emptyModelResult(),
    Show: emptyModelResult(),
    Year: emptyModelResult(),
    Venue: emptyModelResult(),
    Tour: emptyModelResult(),
    Song: emptyModelResult(),
    Artist: emptyModelResult(),
  };
}

function requireNonNegativeNumber(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative finite number`);
  }
  return value;
}

function requireNonNegativeInteger(value: number, name: string) {
  requireNonNegativeNumber(value, name);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
  return value;
}

function collectQueuedSourceTrackUuids(realm: Realm) {
  const queuedUuids = new Set<string>();
  const playerStates = realm.objects(PlayerState).filtered('deletedAt == nil').snapshot();

  for (let index = 0; index < playerStates.length; index += 1) {
    const playerState = playerStates[index];
    for (const uuid of playerState.queueSourceTrackUuids) queuedUuids.add(uuid);
    for (const uuid of playerState.queueSourceTrackShuffledUuids) queuedUuids.add(uuid);
  }

  return queuedUuids;
}

function hasRows<T extends AnyRealmObject>(
  realm: Realm,
  type: Realm.RealmObjectConstructor<T>,
  query: string,
  ...args: unknown[]
) {
  return !realm
    .objects(type)
    .filtered(query, ...args)
    .isEmpty();
}

function isDirectFavorite(object: CatalogObject) {
  switch (object.objectSchema().name as CatalogModelName) {
    case 'Artist':
    case 'Show':
    case 'Venue':
    case 'Tour':
    case 'Song':
    case 'Source':
    case 'SourceTrack':
      return (object as Artist | Show | Venue | Tour | Song | Source | SourceTrack).isFavorite;
    case 'Year':
    case 'SourceSet':
      return false;
  }
}

function isInFavoriteClosure(context: GcContext, object: CatalogObject): boolean {
  const modelName = object.objectSchema().name as CatalogModelName;
  const key = `${modelName}:${object.uuid}`;
  const cached = context.favoriteClosure.get(key);
  if (cached !== undefined) return cached;

  const { realm } = context;
  const artistIsFavorite = (artistUuid: string) =>
    realm.objectForPrimaryKey(Artist, artistUuid)?.isFavorite ?? false;
  const source = (uuid: string) => realm.objectForPrimaryKey(Source, uuid);
  const sourceSet = (uuid: string) => realm.objectForPrimaryKey(SourceSet, uuid);
  const show = (uuid: string) => realm.objectForPrimaryKey(Show, uuid);

  let protectedByFavorite = isDirectFavorite(object);
  if (!protectedByFavorite) {
    switch (modelName) {
      case 'Artist':
        break;
      case 'Year':
        protectedByFavorite = artistIsFavorite((object as Year).artistUuid);
        break;
      case 'Venue':
        protectedByFavorite = artistIsFavorite((object as Venue).artistUuid);
        break;
      case 'Tour':
        protectedByFavorite = artistIsFavorite((object as Tour).artistUuid);
        break;
      case 'Song':
        protectedByFavorite = artistIsFavorite((object as Song).artistUuid);
        break;
      case 'Show': {
        const candidate = object as Show;
        protectedByFavorite =
          artistIsFavorite(candidate.artistUuid) ||
          (candidate.venueUuid
            ? (realm.objectForPrimaryKey(Venue, candidate.venueUuid)?.isFavorite ?? false)
            : false) ||
          (candidate.tourUuid
            ? (realm.objectForPrimaryKey(Tour, candidate.tourUuid)?.isFavorite ?? false)
            : false) ||
          !candidate.linkingObjects(Song, 'shows').filtered('isFavorite == true').isEmpty();
        break;
      }
      case 'Source': {
        const candidate = object as Source;
        const parentShow = show(candidate.showUuid);
        protectedByFavorite =
          artistIsFavorite(candidate.artistUuid) ||
          (parentShow ? isInFavoriteClosure(context, parentShow) : false) ||
          (candidate.venueUuid
            ? (realm.objectForPrimaryKey(Venue, candidate.venueUuid)?.isFavorite ?? false)
            : false);
        break;
      }
      case 'SourceSet': {
        const candidate = object as SourceSet;
        const parentSource = source(candidate.sourceUuid);
        protectedByFavorite =
          artistIsFavorite(candidate.artistUuid) ||
          (parentSource ? isInFavoriteClosure(context, parentSource) : false) ||
          candidate
            .linkingObjects(Source, 'sourceSets')
            .some((sourceWithMembership) => isInFavoriteClosure(context, sourceWithMembership));
        break;
      }
      case 'SourceTrack': {
        const candidate = object as SourceTrack;
        const parentSource = source(candidate.sourceUuid);
        const parentSourceSet = sourceSet(candidate.sourceSetUuid);
        const parentShow = show(candidate.showUuid);
        protectedByFavorite =
          artistIsFavorite(candidate.artistUuid) ||
          (parentShow ? isInFavoriteClosure(context, parentShow) : false) ||
          (parentSource ? isInFavoriteClosure(context, parentSource) : false) ||
          (parentSourceSet ? isInFavoriteClosure(context, parentSourceSet) : false) ||
          candidate
            .linkingObjects(SourceSet, 'sourceTracks')
            .some((sourceSetWithMembership) =>
              isInFavoriteClosure(context, sourceSetWithMembership)
            );
        break;
      }
    }
  }

  context.favoriteClosure.set(key, protectedByFavorite);
  return protectedByFavorite;
}

function sourceTrackRootBlocker(context: GcContext, sourceTrack: SourceTrack) {
  if (sourceTrack.offlineInfo && !sourceTrack.offlineInfo.deletedAt) return 'offline-info-link';
  const offlineInfo = context.realm.objectForPrimaryKey(SourceTrackOfflineInfo, sourceTrack.uuid);
  if (offlineInfo && !offlineInfo.deletedAt) {
    return 'offline-info-row';
  }
  if (context.queuedSourceTrackUuids.has(sourceTrack.uuid)) return 'player-state-queue';
  if (!sourceTrack.linkingObjects(PlaybackHistoryEntry, 'sourceTrack').isEmpty()) {
    return 'playback-history';
  }
  return undefined;
}

function removeUuidFromList<T extends { uuid: string }>(list: Realm.List<T>, uuid: string) {
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (list[index].uuid === uuid) list.splice(index, 1);
  }
}

function prepareSourceTrackForCollection(context: GcContext, sourceTrack: SourceTrack) {
  const retainedRoot = sourceTrackRootBlocker(context, sourceTrack);
  if (retainedRoot) return retainedRoot;

  const sourceSets = sourceTrack.linkingObjects(SourceSet, 'sourceTracks').snapshot();
  if (sourceTrack.linkingObjectsCount() !== sourceSets.length) return 'realm-backlinks';

  for (const sourceSet of sourceSets) {
    if (isInFavoriteClosure(context, sourceSet)) return 'favorite-root-closure';
  }
  for (const sourceSet of sourceSets) {
    removeUuidFromList(sourceSet.sourceTracks, sourceTrack.uuid);
  }

  return sourceTrack.linkingObjectsCount() === 0 ? undefined : 'realm-backlinks';
}

function prepareSourceSetForCollection(context: GcContext, sourceSet: SourceSet) {
  if (sourceSet.sourceTracks.length !== 0) return 'SourceSet.sourceTracks';

  const sources = sourceSet.linkingObjects(Source, 'sourceSets').snapshot();
  if (sourceSet.linkingObjectsCount() !== sources.length) return 'realm-backlinks';

  for (const source of sources) {
    if (isInFavoriteClosure(context, source)) return 'favorite-root-closure';
  }
  for (const source of sources) {
    removeUuidFromList(source.sourceSets, sourceSet.uuid);
  }

  return sourceSet.linkingObjectsCount() === 0 ? undefined : 'realm-backlinks';
}

function prepareShowForCollection(context: GcContext, show: Show) {
  const scalarBlocker = scalarReferenceBlocker(context.realm, show);
  if (scalarBlocker) return scalarBlocker;

  const historyEntries = show.linkingObjects(PlaybackHistoryEntry, 'show');
  if (!historyEntries.isEmpty()) return 'playback-history';

  const sourceTracks = show.linkingObjects(SourceTrack, 'show');
  if (!sourceTracks.isEmpty()) return 'SourceTrack.show';

  const songs = show.linkingObjects(Song, 'shows').snapshot();
  if (show.linkingObjectsCount() !== songs.length) return 'realm-backlinks';

  for (const song of songs) {
    if (isInFavoriteClosure(context, song)) return 'favorite-root-closure';
  }
  for (const song of songs) song.shows.delete(show);

  return show.linkingObjectsCount() === 0 ? undefined : 'realm-backlinks';
}

function scalarReferenceBlocker(realm: Realm, object: CatalogObject): string | undefined {
  const uuid = object.uuid;

  switch (object.objectSchema().name as CatalogModelName) {
    case 'SourceTrack':
    case 'Song':
      return undefined;
    case 'SourceSet':
      return hasRows(realm, SourceTrack, 'sourceSetUuid == $0', uuid)
        ? 'SourceTrack.sourceSetUuid'
        : undefined;
    case 'Source':
      if (hasRows(realm, SourceSet, 'sourceUuid == $0', uuid)) return 'SourceSet.sourceUuid';
      if (hasRows(realm, SourceTrack, 'sourceUuid == $0', uuid)) {
        return 'SourceTrack.sourceUuid';
      }
      return undefined;
    case 'Show':
      if (hasRows(realm, Source, 'showUuid == $0', uuid)) return 'Source.showUuid';
      if (hasRows(realm, SourceTrack, 'showUuid == $0', uuid)) return 'SourceTrack.showUuid';
      return undefined;
    case 'Year':
      return hasRows(realm, Show, 'yearUuid == $0', uuid) ? 'Show.yearUuid' : undefined;
    case 'Venue':
      if (hasRows(realm, Show, 'venueUuid == $0', uuid)) return 'Show.venueUuid';
      return hasRows(realm, Source, 'venueUuid == $0', uuid) ? 'Source.venueUuid' : undefined;
    case 'Tour':
      return hasRows(realm, Show, 'tourUuid == $0', uuid) ? 'Show.tourUuid' : undefined;
    case 'Artist':
      if (hasRows(realm, Year, 'artistUuid == $0', uuid)) return 'Year.artistUuid';
      if (hasRows(realm, Show, 'artistUuid == $0', uuid)) return 'Show.artistUuid';
      if (hasRows(realm, Venue, 'artistUuid == $0', uuid)) return 'Venue.artistUuid';
      if (hasRows(realm, Tour, 'artistUuid == $0', uuid)) return 'Tour.artistUuid';
      if (hasRows(realm, Song, 'artistUuid == $0', uuid)) return 'Song.artistUuid';
      if (hasRows(realm, Source, 'artistUuid == $0', uuid)) return 'Source.artistUuid';
      if (hasRows(realm, SourceSet, 'artistUuid == $0', uuid)) return 'SourceSet.artistUuid';
      return hasRows(realm, SourceTrack, 'artistUuid == $0', uuid)
        ? 'SourceTrack.artistUuid'
        : undefined;
  }
}

function collectionBlocker(context: GcContext, object: CatalogObject) {
  if (isInFavoriteClosure(context, object)) return 'favorite-root-closure';

  switch (object.objectSchema().name as CatalogModelName) {
    case 'SourceTrack':
      return prepareSourceTrackForCollection(context, object as SourceTrack);
    case 'SourceSet': {
      const scalarBlocker = scalarReferenceBlocker(context.realm, object);
      return scalarBlocker ?? prepareSourceSetForCollection(context, object as SourceSet);
    }
    case 'Show':
      return prepareShowForCollection(context, object as Show);
    case 'Source':
      if ((object as Source).sourceSets.length !== 0) return 'Source.sourceSets';
      break;
    case 'Song': {
      const song = object as Song;
      if (song.linkingObjectsCount() !== 0) return 'realm-backlinks';
      song.shows.clear();
      return undefined;
    }
    case 'Artist':
    case 'Year':
    case 'Venue':
    case 'Tour':
      break;
  }

  if (object.linkingObjectsCount() !== 0) return 'realm-backlinks';
  return scalarReferenceBlocker(context.realm, object);
}

function matureCatalogObjects(
  realm: Realm,
  modelName: CatalogModelName,
  cutoff: Date
): Realm.Results<CatalogObject> {
  return realm
    .objects<CatalogObject>(modelName)
    .filtered('retiredAt != nil AND retiredAt <= $0', cutoff)
    .sorted('retiredAt') as Realm.Results<CatalogObject>;
}

function boundedCandidateWindow(
  objects: Realm.Results<CatalogObject>,
  scanLimit: number,
  now: Date,
  modelIndex: number
) {
  if (scanLimit === 0) return { candidates: [], offset: 0 };

  if (objects.length <= scanLimit) {
    return { candidates: objects.snapshot().slice(0, scanLimit), offset: 0 };
  }

  // A fixed "oldest N" window can be pinned forever by favorites or retained history. Rotate one
  // bounded native window per UTC day so every mature tombstone is eventually reconsidered without
  // materializing the table in JavaScript.
  const windowCount = Math.ceil(objects.length / scanLimit);
  const epochDay = Math.floor(now.getTime() / DAY_MS);
  const windowIndex = (epochDay + modelIndex) % windowCount;
  const start = windowIndex * scanLimit;
  return {
    candidates: objects.snapshot().slice(start, Math.min(start + scanLimit, objects.length)),
    offset: start,
  };
}

function reservedDeleteQuotas(batchLimit: number) {
  const modelCount = CATALOG_MODEL_NAMES.length;
  const quotaPerModel = Math.floor(batchLimit / modelCount);
  const extraSlots = batchLimit % modelCount;

  return CATALOG_MODEL_NAMES.map((_, modelIndex) =>
    modelIndex < extraSlots ? quotaPerModel + 1 : quotaPerModel
  );
}

function incrementBlocker(result: CatalogGcModelResult, blocker: string) {
  result.blockers[blocker] = (result.blockers[blocker] ?? 0) + 1;
  result.skipped += 1;
}

function reportGcResult(result: CatalogGarbageCollectionResult) {
  for (const modelName of CATALOG_MODEL_NAMES) {
    const modelResult = result.models[modelName];
    reportCatalogMaintenance('collected', modelName, modelResult.collected, {
      cutoff: result.cutoff.toISOString(),
      scanned: modelResult.scanned,
    });
    reportCatalogMaintenance('collection-skipped', modelName, modelResult.skipped, {
      blockers: modelResult.blockers,
      cutoff: result.cutoff.toISOString(),
      deferred: modelResult.deferred,
      mature: modelResult.mature,
      scanOffset: modelResult.scanOffset,
      scanned: modelResult.scanned,
    });
  }
}

/**
 * Physically deletes eligible catalog tombstones.
 *
 * Cold-start contract: call this exactly once after Realm.open() and before publishing that Realm
 * to React, CarPlay, the player, LibraryIndex, or any other consumer. No physical collection should
 * run while a session is live; PlayerState is the durable root for the queue at this boundary.
 */
export function runColdStartCatalogGarbageCollection(
  realm: Realm,
  options: CatalogGarbageCollectionOptions = {}
): CatalogGarbageCollectionResult {
  if (realm.isClosed) throw new Error('Cannot collect a closed Realm');

  const now = options.now ?? new Date();
  const gracePeriodMs = requireNonNegativeNumber(
    options.gracePeriodMs ?? DEFAULT_CATALOG_GC_GRACE_PERIOD_MS,
    'gracePeriodMs'
  );
  const batchLimit = requireNonNegativeInteger(
    options.batchLimit ?? DEFAULT_CATALOG_GC_BATCH_LIMIT,
    'batchLimit'
  );
  if (batchLimit > 0 && batchLimit < CATALOG_MODEL_NAMES.length) {
    throw new Error(
      `batchLimit must be 0 or at least ${CATALOG_MODEL_NAMES.length} so every catalog model has a reserved GC slot`
    );
  }
  const scanLimitPerModel = requireNonNegativeInteger(
    options.scanLimitPerModel ?? batchLimit * DEFAULT_CATALOG_GC_SCAN_MULTIPLIER,
    'scanLimitPerModel'
  );
  const cutoff = new Date(now.getTime() - gracePeriodMs);
  const collected = emptyCatalogModelCounts();
  const models = emptyModelResults();
  const context: GcContext = {
    realm,
    queuedSourceTrackUuids: collectQueuedSourceTrackUuids(realm),
    favoriteClosure: new Map(),
  };

  const sweep = () => {
    const states: ModelSweepState[] = [];
    for (let modelIndex = 0; modelIndex < CATALOG_MODEL_NAMES.length; modelIndex += 1) {
      const modelName = CATALOG_MODEL_NAMES[modelIndex];
      const modelResult = models[modelName];
      const matureObjects = matureCatalogObjects(realm, modelName, cutoff);
      modelResult.mature = matureObjects.length;

      const candidateWindow = boundedCandidateWindow(
        matureObjects,
        scanLimitPerModel,
        now,
        modelIndex
      );
      modelResult.scanOffset = candidateWindow.offset;
      states.push({
        modelName,
        result: modelResult,
        candidates: candidateWindow.candidates,
        nextCandidateIndex: 0,
      });
    }

    const collectFromState = (state: ModelSweepState, deleteLimit: number) => {
      let deleted = 0;

      while (deleted < deleteLimit && state.nextCandidateIndex < state.candidates.length) {
        const object = state.candidates[state.nextCandidateIndex];
        state.nextCandidateIndex += 1;

        state.result.scanned += 1;
        const blocker = collectionBlocker(context, object);
        if (blocker) {
          incrementBlocker(state.result, blocker);
          continue;
        }

        realm.delete(object);
        state.result.collected += 1;
        collected[state.modelName] += 1;
        deleted += 1;
      }

      return deleted;
    };

    // The first child-to-parent pass reserves a fair slice for every model. This prevents a large
    // SourceTrack backlog from consuming the whole batch before later catalog classes are visited.
    const reservedQuotas = reservedDeleteQuotas(batchLimit);
    let remainingDeletes = batchLimit;
    for (let modelIndex = 0; modelIndex < states.length; modelIndex += 1) {
      remainingDeletes -= collectFromState(states[modelIndex], reservedQuotas[modelIndex]);
    }

    // Recycle empty or blocked reservations. Resuming each bounded snapshot avoids rescanning
    // blockers, and a second child-to-parent pass preserves collection ordering.
    for (const state of states) {
      if (remainingDeletes === 0) break;
      remainingDeletes -= collectFromState(state, remainingDeletes);
    }

    for (const state of states) {
      state.result.deferred = Math.max(0, state.result.mature - state.result.scanned);
    }
  };

  if (realm.isInTransaction) {
    sweep();
  } else {
    realm.write(sweep);
  }

  const result: CatalogGarbageCollectionResult = {
    now,
    cutoff,
    gracePeriodMs,
    batchLimit,
    scanLimitPerModel,
    collected,
    totalCollected: CATALOG_MODEL_NAMES.reduce((sum, modelName) => sum + collected[modelName], 0),
    totalScanned: CATALOG_MODEL_NAMES.reduce(
      (sum, modelName) => sum + models[modelName].scanned,
      0
    ),
    totalSkipped: CATALOG_MODEL_NAMES.reduce(
      (sum, modelName) => sum + models[modelName].skipped,
      0
    ),
    models,
  };

  reportGcResult(result);
  if (options.auditGraph ?? true) {
    result.graphAudit = auditCatalogRetirementGraph(realm);
  }

  return result;
}
