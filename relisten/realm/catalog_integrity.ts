import * as Sentry from '@sentry/react-native';
import Realm from 'realm';

import { reportCatalogMaintenance } from '@/relisten/realm/catalog_access_monitor';
import {
  CatalogModelCounts,
  CATALOG_MODEL_NAMES,
  emptyCatalogModelCounts,
  retireCatalogGraph,
} from '@/relisten/realm/catalog_retirement_graph';
import {
  catalogStructuralIssues,
  CatalogStructuralIssue,
} from '@/relisten/realm/catalog_integrity_validation';
import { Artist } from '@/relisten/realm/models/artist';
import { Show } from '@/relisten/realm/models/show';
import { Source } from '@/relisten/realm/models/source';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { Year } from '@/relisten/realm/models/year';
import { log } from '@/relisten/util/logging';

const logger = log.extend('catalog-integrity');

const ARTIST_LINK_REPAIR_QUERY =
  'artist == nil OR artist.uuid != artistUuid OR (retiredAt == nil AND artist.retiredAt != nil)';
const SOURCE_TRACK_REPAIR_QUERY = [
  'artist == nil',
  'artist.uuid != artistUuid',
  'show == nil',
  'show.uuid != showUuid',
  'source == nil',
  'source.uuid != sourceUuid',
  'year == nil',
  'year.uuid != show.yearUuid',
  'show.artistUuid != artistUuid',
  'source.artistUuid != artistUuid',
  'source.showUuid != showUuid',
  '(retiredAt == nil AND artist.retiredAt != nil)',
  '(retiredAt == nil AND show.retiredAt != nil)',
  '(retiredAt == nil AND source.retiredAt != nil)',
  '(retiredAt == nil AND year.retiredAt != nil)',
].join(' OR ');

export const CATALOG_INTEGRITY_QUARANTINE_REASON_PREFIX = 'catalog-integrity';

export const CATALOG_INTEGRITY_RELINK_NAMES = [
  'Show.artist',
  'Source.artist',
  'SourceTrack.artist',
  'SourceTrack.show',
  'SourceTrack.source',
  'SourceTrack.year',
] as const;

type CatalogIntegrityRelinkName = (typeof CATALOG_INTEGRITY_RELINK_NAMES)[number];
type RepairableCatalogModelName = 'Show' | 'Source' | 'SourceTrack';

export interface CatalogIntegrityRepairResult {
  context: string;
  candidates: Record<RepairableCatalogModelName, number>;
  relinked: Record<CatalogIntegrityRelinkName, number>;
  quarantinedRoots: Record<RepairableCatalogModelName, number>;
  newlyQuarantinedRoots: Record<RepairableCatalogModelName, number>;
  retired: CatalogModelCounts;
  issues: Partial<Record<CatalogStructuralIssue, number>>;
  totalRelinked: number;
  totalQuarantinedRoots: number;
  totalNewlyQuarantinedRoots: number;
  totalRetired: number;
}

export interface CatalogIntegrityRepairScope {
  shows?: Iterable<Show>;
  sources?: Iterable<Source>;
  sourceTracks?: Iterable<SourceTrack>;
}

function emptyRepairResult(context: string): CatalogIntegrityRepairResult {
  return {
    context,
    candidates: { Show: 0, Source: 0, SourceTrack: 0 },
    relinked: {
      'Show.artist': 0,
      'Source.artist': 0,
      'SourceTrack.artist': 0,
      'SourceTrack.show': 0,
      'SourceTrack.source': 0,
      'SourceTrack.year': 0,
    },
    quarantinedRoots: { Show: 0, Source: 0, SourceTrack: 0 },
    newlyQuarantinedRoots: { Show: 0, Source: 0, SourceTrack: 0 },
    retired: emptyCatalogModelCounts(),
    issues: {},
    totalRelinked: 0,
    totalQuarantinedRoots: 0,
    totalNewlyQuarantinedRoots: 0,
    totalRetired: 0,
  };
}

function uniqueValidObjects<T extends { uuid: string; isValid(): boolean }>(objects: Iterable<T>) {
  const byUuid = new Map<string, T>();
  for (const object of objects) {
    if (object.isValid()) byUuid.set(object.uuid, object);
  }
  return [...byUuid.values()];
}

function countIssue(result: CatalogIntegrityRepairResult, issue: CatalogStructuralIssue) {
  result.issues[issue] = (result.issues[issue] ?? 0) + 1;
}

function addRetirementCounts(result: CatalogIntegrityRepairResult, counts: CatalogModelCounts) {
  for (const modelName of CATALOG_MODEL_NAMES) {
    result.retired[modelName] += counts[modelName];
    result.totalRetired += counts[modelName];
  }
}

function quarantine(
  realm: Realm,
  result: CatalogIntegrityRepairResult,
  root: Show | Source | SourceTrack,
  issue: CatalogStructuralIssue
) {
  const modelName = root.objectSchema().name as RepairableCatalogModelName;
  const wasActive = root.retiredAt == null;
  result.quarantinedRoots[modelName] += 1;
  result.totalQuarantinedRoots += 1;
  countIssue(result, issue);

  const retirement = retireCatalogGraph(realm, root, {
    reason: `${CATALOG_INTEGRITY_QUARANTINE_REASON_PREFIX}:${issue}`,
    report: false,
  });
  addRetirementCounts(result, retirement.counts);

  if (wasActive && root.retiredAt != null) {
    result.newlyQuarantinedRoots[modelName] += 1;
    result.totalNewlyQuarantinedRoots += 1;
  }
}

function canLinkActiveOwner(owner: Show | Source | SourceTrack, target: { retiredAt?: Date }) {
  return owner.retiredAt != null || target.retiredAt == null;
}

function relinkShow(realm: Realm, result: CatalogIntegrityRepairResult, show: Show) {
  result.candidates.Show += 1;
  const artist = realm.objectForPrimaryKey(Artist, show.artistUuid);

  if (!artist) {
    quarantine(realm, result, show, 'missing-artist');
    return;
  }
  if (!canLinkActiveOwner(show, artist)) {
    quarantine(realm, result, show, 'retired-artist');
    return;
  }

  if (!show.artist || show.artist.uuid !== artist.uuid) {
    show.artist = artist;
    result.relinked['Show.artist'] += 1;
    result.totalRelinked += 1;
  }
}

function relinkSource(realm: Realm, result: CatalogIntegrityRepairResult, source: Source) {
  result.candidates.Source += 1;
  const artist = realm.objectForPrimaryKey(Artist, source.artistUuid);

  if (!artist) {
    quarantine(realm, result, source, 'missing-artist');
    return;
  }
  if (!canLinkActiveOwner(source, artist)) {
    quarantine(realm, result, source, 'retired-artist');
    return;
  }

  if (!source.artist || source.artist.uuid !== artist.uuid) {
    source.artist = artist;
    result.relinked['Source.artist'] += 1;
    result.totalRelinked += 1;
  }
}

function relinkSourceTrack(realm: Realm, result: CatalogIntegrityRepairResult, track: SourceTrack) {
  result.candidates.SourceTrack += 1;
  const artist = realm.objectForPrimaryKey(Artist, track.artistUuid);
  const show = realm.objectForPrimaryKey(Show, track.showUuid);
  const source = realm.objectForPrimaryKey(Source, track.sourceUuid);
  const year = show ? realm.objectForPrimaryKey(Year, show.yearUuid) : undefined;

  let quarantineIssue: CatalogStructuralIssue | undefined;
  if (!artist) quarantineIssue = 'missing-artist';
  else if (!show) quarantineIssue = 'missing-show';
  else if (!source) quarantineIssue = 'missing-source';
  else if (!year) quarantineIssue = 'missing-year';
  else if (show.artistUuid !== track.artistUuid) quarantineIssue = 'show-artist-mismatch';
  else if (source.artistUuid !== track.artistUuid) quarantineIssue = 'source-artist-mismatch';
  else if (source.showUuid !== track.showUuid) quarantineIssue = 'source-show-mismatch';
  else if (!canLinkActiveOwner(track, artist)) quarantineIssue = 'retired-artist';
  else if (!canLinkActiveOwner(track, show)) quarantineIssue = 'retired-show';
  else if (!canLinkActiveOwner(track, source)) quarantineIssue = 'retired-source';
  else if (!canLinkActiveOwner(track, year)) quarantineIssue = 'retired-year';

  const links: Array<
    [
      CatalogIntegrityRelinkName,
      'artist' | 'show' | 'source' | 'year',
      Artist | Show | Source | Year | null | undefined,
    ]
  > = [
    ['SourceTrack.artist', 'artist', artist],
    ['SourceTrack.show', 'show', show],
    ['SourceTrack.source', 'source', source],
    ['SourceTrack.year', 'year', year],
  ];

  for (const [edge, property, target] of links) {
    if (
      target &&
      canLinkActiveOwner(track, target) &&
      (!track[property] || track[property].uuid !== target.uuid)
    ) {
      track[property] = target as never;
      result.relinked[edge] += 1;
      result.totalRelinked += 1;
    }
  }

  if (quarantineIssue) {
    quarantine(realm, result, track, quarantineIssue);
    return;
  }

  const unresolvedIssue = catalogStructuralIssues(track)[0];
  if (unresolvedIssue) quarantine(realm, result, track, unresolvedIssue);
}

export function reportCatalogIntegrityRepair(result: CatalogIntegrityRepairResult) {
  if (result.totalRelinked === 0 && result.totalQuarantinedRoots === 0) return;

  const hasNewQuarantine = result.totalNewlyQuarantinedRoots > 0;
  Sentry.addBreadcrumb({
    category: 'realm.catalog-integrity',
    level: hasNewQuarantine ? 'warning' : 'info',
    message: 'Realm catalog integrity maintenance completed',
    data: result,
  });
  if (hasNewQuarantine) logger.warn('Realm catalog integrity maintenance completed', result);
  else logger.info('Realm catalog integrity maintenance completed', result);

  for (const modelName of CATALOG_MODEL_NAMES) {
    reportCatalogMaintenance('retired', modelName, result.retired[modelName], {
      reason: CATALOG_INTEGRITY_QUARANTINE_REASON_PREFIX,
      context: result.context,
    });
  }

  if (hasNewQuarantine) {
    Sentry.captureMessage('Unrecoverable Realm catalog graphs were quarantined', {
      level: 'warning',
      fingerprint: ['realm-catalog-integrity-quarantine', result.context],
      tags: { realm_catalog_integrity_context: result.context },
      extra: { ...result },
    });
  }
}

export function repairCatalogIntegrity(
  realm: Realm,
  scope: CatalogIntegrityRepairScope,
  { context = 'scoped-reconciliation', report = true }: { context?: string; report?: boolean } = {}
): CatalogIntegrityRepairResult {
  const result = emptyRepairResult(context);
  const shows = uniqueValidObjects(scope.shows ?? []);
  const sources = uniqueValidObjects(scope.sources ?? []);
  const sourceTracks = uniqueValidObjects(scope.sourceTracks ?? []);

  const repair = () => {
    for (const show of shows) relinkShow(realm, result, show);
    for (const source of sources) relinkSource(realm, result, source);
    for (const track of sourceTracks) relinkSourceTrack(realm, result, track);
  };

  if (realm.isInTransaction) repair();
  else realm.write(repair);

  if (report) reportCatalogIntegrityRepair(result);
  return result;
}

/**
 * Runs before consumers acquire managed objects. Native Realm predicates keep
 * the scan limited to rows whose required direct links are missing,
 * mismatched, or point from an active row into a tombstone.
 */
export function repairCatalogIntegrityAtStartup(realm: Realm): CatalogIntegrityRepairResult {
  return repairCatalogIntegrity(
    realm,
    {
      shows: realm.objects(Show).filtered(ARTIST_LINK_REPAIR_QUERY).snapshot(),
      sources: realm.objects(Source).filtered(ARTIST_LINK_REPAIR_QUERY).snapshot(),
      sourceTracks: realm.objects(SourceTrack).filtered(SOURCE_TRACK_REPAIR_QUERY).snapshot(),
    },
    { context: 'cold-start' }
  );
}

export function ensureShowResponseCatalogIntegrity(
  realm: Realm,
  show: Show | null | undefined,
  sources: Iterable<Source>,
  sourceTracks: Iterable<SourceTrack>
) {
  return repairCatalogIntegrity(
    realm,
    {
      shows: show ? [show] : [],
      sources,
      sourceTracks,
    },
    { context: 'show-api-reconciliation' }
  );
}
