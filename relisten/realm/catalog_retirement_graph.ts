import * as Sentry from '@sentry/react-native';
import Realm from 'realm';

import {
  reportCatalogMaintenance,
  RetireableCatalogObject,
} from '@/relisten/realm/catalog_access_monitor';
import { retireCatalogObject } from '@/relisten/realm/catalog_retirement';
import { Artist } from '@/relisten/realm/models/artist';
import { Show } from '@/relisten/realm/models/show';
import { Song } from '@/relisten/realm/models/song';
import { Source } from '@/relisten/realm/models/source';
import { SourceSet } from '@/relisten/realm/models/source_set';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { Tour } from '@/relisten/realm/models/tour';
import { Venue } from '@/relisten/realm/models/venue';
import { Year } from '@/relisten/realm/models/year';

export const CATALOG_MODEL_NAMES = [
  'SourceTrack',
  'SourceSet',
  'Source',
  'Show',
  'Year',
  'Venue',
  'Tour',
  'Song',
  'Artist',
] as const;

export type CatalogModelName = (typeof CATALOG_MODEL_NAMES)[number];

export type CatalogObject = RetireableCatalogObject;

export type CatalogModelCounts = Record<CatalogModelName, number>;

export interface CatalogRetirementResult {
  counts: CatalogModelCounts;
  total: number;
}

export interface RetireCatalogGraphOptions {
  reason: string;
  retiredAt?: Date;
  report?: boolean;
}

const DIRECT_LINK_EDGE_NAMES = [
  'Show.artist',
  'Show.tour',
  'Show.venue',
  'Source.artist',
  'SourceTrack.artist',
  'SourceTrack.show',
  'SourceTrack.source',
  'SourceTrack.year',
] as const;

const MEMBERSHIP_EDGE_NAMES = [
  'Song.shows',
  'Source.sourceSets',
  'SourceSet.sourceTracks',
] as const;

type DirectLinkEdgeName = (typeof DIRECT_LINK_EDGE_NAMES)[number];
type MembershipEdgeName = (typeof MEMBERSHIP_EDGE_NAMES)[number];

export interface CatalogGraphAuditResult {
  directLinks: Record<DirectLinkEdgeName, number>;
  membershipLinks: Record<MembershipEdgeName, number>;
  totalRetainedMemberships: number;
  totalViolations: number;
}

interface RetirementContext {
  realm: Realm;
  reason: string;
  retiredAt: Date;
  counts: CatalogModelCounts;
  visited: Set<string>;
}

export function emptyCatalogModelCounts(): CatalogModelCounts {
  return {
    SourceTrack: 0,
    SourceSet: 0,
    Source: 0,
    Show: 0,
    Year: 0,
    Venue: 0,
    Tour: 0,
    Song: 0,
    Artist: 0,
  };
}

function forEachSnapshot<T>(collection: Realm.OrderedCollection<T>, visit: (object: T) => void) {
  const snapshot = collection.snapshot();

  for (let index = 0; index < snapshot.length; index += 1) {
    visit(snapshot[index]);
  }
}

function visitSnapshot<T extends CatalogObject>(
  context: RetirementContext,
  collection: Realm.OrderedCollection<T>
) {
  forEachSnapshot(collection, (object) => visitCatalogObject(context, object));
}

function retireArtistDescendants(context: RetirementContext, artist: Artist) {
  const { realm } = context;
  const artistUuid = artist.uuid;

  // Shows must retire before Venue and Tour. Those parents are shared catalog records and are
  // protected while any active Show still refers to them, including through a scalar UUID when
  // the direct Realm link has not been attached yet.
  visitSnapshot(context, realm.objects(Show).filtered('artistUuid == $0', artistUuid));
  visitSnapshot(context, realm.objects(Year).filtered('artistUuid == $0', artistUuid));
  visitSnapshot(context, realm.objects(Venue).filtered('artistUuid == $0', artistUuid));
  visitSnapshot(context, realm.objects(Tour).filtered('artistUuid == $0', artistUuid));
  visitSnapshot(context, realm.objects(Song).filtered('artistUuid == $0', artistUuid));
  visitSnapshot(context, realm.objects(Source).filtered('artistUuid == $0', artistUuid));
  visitSnapshot(context, realm.objects(SourceSet).filtered('artistUuid == $0', artistUuid));
  visitSnapshot(context, realm.objects(SourceTrack).filtered('artistUuid == $0', artistUuid));
}

function hasActiveShowReference(context: RetirementContext, object: Venue | Tour) {
  const shows = context.realm.objects<Show>('Show');

  if (object.objectSchema().name === 'Venue') {
    return (
      shows.filtered('retiredAt == nil AND venueUuid == $0', object.uuid).length > 0 ||
      shows.filtered('retiredAt == nil AND venue.uuid == $0', object.uuid).length > 0
    );
  }

  return (
    shows.filtered('retiredAt == nil AND tourUuid == $0', object.uuid).length > 0 ||
    shows.filtered('retiredAt == nil AND tour.uuid == $0', object.uuid).length > 0
  );
}

function retireYearDescendants(context: RetirementContext, year: Year) {
  visitSnapshot(context, context.realm.objects(Show).filtered('yearUuid == $0', year.uuid));

  // This catches an old or partially-reconciled track whose Show relationship is absent.
  visitSnapshot(context, context.realm.objects(SourceTrack).filtered('year.uuid == $0', year.uuid));
}

function retireShowDescendants(context: RetirementContext, show: Show) {
  visitSnapshot(context, context.realm.objects(Source).filtered('showUuid == $0', show.uuid));

  // The scalar association is authoritative when a parent collection or direct link is damaged.
  visitSnapshot(context, context.realm.objects(SourceTrack).filtered('showUuid == $0', show.uuid));
}

function retireSourceDescendants(context: RetirementContext, source: Source) {
  visitSnapshot(context, source.sourceSets);
  visitSnapshot(
    context,
    context.realm.objects(SourceSet).filtered('sourceUuid == $0', source.uuid)
  );
  visitSnapshot(
    context,
    context.realm.objects(SourceTrack).filtered('sourceUuid == $0', source.uuid)
  );
}

function retireSourceSetDescendants(context: RetirementContext, sourceSet: SourceSet) {
  visitSnapshot(context, sourceSet.sourceTracks);
  visitSnapshot(
    context,
    context.realm.objects(SourceTrack).filtered('sourceSetUuid == $0', sourceSet.uuid)
  );
}

function visitCatalogObject(context: RetirementContext, object: CatalogObject) {
  if (!object.isValid()) return;

  const modelName = object.objectSchema().name as CatalogModelName;
  const visitKey = `${modelName}:${object.uuid}`;
  if (context.visited.has(visitKey)) return;
  context.visited.add(visitKey);

  if (
    (modelName === 'Venue' || modelName === 'Tour') &&
    hasActiveShowReference(context, object as Venue | Tour)
  ) {
    return;
  }

  if (retireCatalogObject(object, context.reason, context.retiredAt)) {
    context.counts[modelName] += 1;
  }

  switch (modelName) {
    case 'Artist':
      retireArtistDescendants(context, object as Artist);
      break;
    case 'Year':
      retireYearDescendants(context, object as Year);
      break;
    case 'Show':
      retireShowDescendants(context, object as Show);
      break;
    case 'Source':
      retireSourceDescendants(context, object as Source);
      break;
    case 'SourceSet':
      retireSourceSetDescendants(context, object as SourceSet);
      break;
    case 'SourceTrack':
    case 'Song':
    case 'Venue':
    case 'Tour':
      break;
  }
}

/**
 * Retires a catalog object and the descendants whose identity depends on it.
 *
 * The operation is idempotent. All Realm links and memberships are deliberately retained here so
 * history, downloads, favorites, and player queue entries keep a complete browseable graph. The
 * cold-start collector removes a derived membership only when its target tombstone is mature and
 * no retained root depends on that membership.
 */
export function retireCatalogGraph(
  realm: Realm,
  root: CatalogObject,
  { reason, retiredAt = new Date(), report = true }: RetireCatalogGraphOptions
): CatalogRetirementResult {
  const context: RetirementContext = {
    realm,
    reason,
    retiredAt,
    counts: emptyCatalogModelCounts(),
    visited: new Set(),
  };

  const retire = () => visitCatalogObject(context, root);
  if (realm.isInTransaction) {
    retire();
  } else {
    realm.write(retire);
  }

  const total = CATALOG_MODEL_NAMES.reduce((sum, modelName) => sum + context.counts[modelName], 0);
  if (report) {
    for (const modelName of CATALOG_MODEL_NAMES) {
      reportCatalogMaintenance('retired', modelName, context.counts[modelName], {
        reason,
        rootModel: root.objectSchema().name,
      });
    }
  }

  return { counts: context.counts, total };
}

function emptyDirectLinkCounts(): Record<DirectLinkEdgeName, number> {
  return {
    'Show.artist': 0,
    'Show.tour': 0,
    'Show.venue': 0,
    'Source.artist': 0,
    'SourceTrack.artist': 0,
    'SourceTrack.show': 0,
    'SourceTrack.source': 0,
    'SourceTrack.year': 0,
  };
}

function emptyMembershipLinkCounts(): Record<MembershipEdgeName, number> {
  return {
    'Song.shows': 0,
    'Source.sourceSets': 0,
    'SourceSet.sourceTracks': 0,
  };
}

function countRetiredMembers<T extends { retiredAt?: Date }>(collection: Iterable<T>) {
  let count = 0;
  for (const object of collection) {
    if (object.retiredAt) count += 1;
  }
  return count;
}

/**
 * Reports active catalog rows that still point at retired catalog rows. Direct links are integrity
 * violations. Parent memberships retain retired children deliberately so offline, favorite, and
 * history graphs remain browseable; those edges are counted separately at info level.
 */
export function auditCatalogRetirementGraph(
  realm: Realm,
  { report = true }: { report?: boolean } = {}
): CatalogGraphAuditResult {
  const directLinks = emptyDirectLinkCounts();
  const membershipLinks = emptyMembershipLinkCounts();

  directLinks['Show.artist'] = realm
    .objects(Show)
    .filtered('retiredAt == nil AND artist.retiredAt != nil').length;
  directLinks['Show.tour'] = realm
    .objects(Show)
    .filtered('retiredAt == nil AND tour.retiredAt != nil').length;
  directLinks['Show.venue'] = realm
    .objects(Show)
    .filtered('retiredAt == nil AND venue.retiredAt != nil').length;
  directLinks['Source.artist'] = realm
    .objects(Source)
    .filtered('retiredAt == nil AND artist.retiredAt != nil').length;
  directLinks['SourceTrack.artist'] = realm
    .objects(SourceTrack)
    .filtered('retiredAt == nil AND artist.retiredAt != nil').length;
  directLinks['SourceTrack.show'] = realm
    .objects(SourceTrack)
    .filtered('retiredAt == nil AND show.retiredAt != nil').length;
  directLinks['SourceTrack.source'] = realm
    .objects(SourceTrack)
    .filtered('retiredAt == nil AND source.retiredAt != nil').length;
  directLinks['SourceTrack.year'] = realm
    .objects(SourceTrack)
    .filtered('retiredAt == nil AND year.retiredAt != nil').length;

  forEachSnapshot(
    realm.objects(Source).filtered('retiredAt == nil AND ANY sourceSets.retiredAt != nil'),
    (source) => {
      membershipLinks['Source.sourceSets'] += countRetiredMembers(source.sourceSets);
    }
  );
  forEachSnapshot(
    realm.objects(SourceSet).filtered('retiredAt == nil AND ANY sourceTracks.retiredAt != nil'),
    (sourceSet) => {
      membershipLinks['SourceSet.sourceTracks'] += countRetiredMembers(sourceSet.sourceTracks);
    }
  );
  forEachSnapshot(
    realm.objects(Song).filtered('retiredAt == nil AND ANY shows.retiredAt != nil'),
    (song) => {
      membershipLinks['Song.shows'] += countRetiredMembers(song.shows);
    }
  );

  const totalViolations = DIRECT_LINK_EDGE_NAMES.reduce((sum, edge) => sum + directLinks[edge], 0);
  const totalRetainedMemberships = MEMBERSHIP_EDGE_NAMES.reduce(
    (sum, edge) => sum + membershipLinks[edge],
    0
  );

  if (report) {
    reportCatalogMaintenance('collection-skipped', 'CatalogGraph', totalViolations, {
      directLinks,
      reason: 'active-to-retired-link',
    });
    if (totalRetainedMemberships > 0) {
      Sentry.addBreadcrumb({
        category: 'realm.catalog-retirement',
        level: 'info',
        message: 'Retained catalog memberships observed',
        data: {
          count: totalRetainedMemberships,
          membershipLinks,
          reason: 'intentional-retained-membership',
        },
      });
    }
  }

  return { directLinks, membershipLinks, totalRetainedMemberships, totalViolations };
}
