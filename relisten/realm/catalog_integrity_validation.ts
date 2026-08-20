import type { RetireableCatalogObject } from '@/relisten/realm/catalog_access_monitor';

export const CATALOG_STRUCTURAL_ISSUES = {
  invalidRealmObject: 'invalid-realm-object',
  missingArtist: 'missing-artist',
  mismatchedArtist: 'mismatched-artist',
  retiredArtist: 'retired-artist',
  missingShow: 'missing-show',
  mismatchedShow: 'mismatched-show',
  retiredShow: 'retired-show',
  missingSource: 'missing-source',
  mismatchedSource: 'mismatched-source',
  retiredSource: 'retired-source',
  missingYear: 'missing-year',
  mismatchedYear: 'mismatched-year',
  retiredYear: 'retired-year',
  showArtistMismatch: 'show-artist-mismatch',
  sourceArtistMismatch: 'source-artist-mismatch',
  sourceShowMismatch: 'source-show-mismatch',
} as const;

export type CatalogStructuralIssue =
  (typeof CATALOG_STRUCTURAL_ISSUES)[keyof typeof CATALOG_STRUCTURAL_ISSUES];

interface CatalogLink {
  uuid: string;
  retiredAt?: Date;
}

interface ShowShape extends RetireableCatalogObject {
  artistUuid: string;
  artist?: CatalogLink;
}

interface SourceShape extends RetireableCatalogObject {
  artistUuid: string;
  artist?: CatalogLink;
}

interface SourceTrackShape extends RetireableCatalogObject {
  artistUuid: string;
  showUuid: string;
  sourceUuid: string;
  artist?: CatalogLink;
  show?: CatalogLink & { artistUuid: string; yearUuid: string };
  source?: CatalogLink & { artistUuid: string; showUuid: string };
  year?: CatalogLink;
}

function validateLink(
  issues: CatalogStructuralIssue[],
  link: CatalogLink | null | undefined,
  expectedUuid: string,
  missing: CatalogStructuralIssue,
  mismatched: CatalogStructuralIssue,
  retired: CatalogStructuralIssue,
  ownerIsRetired: boolean
) {
  if (!link) {
    issues.push(missing);
    return;
  }

  if (link.uuid !== expectedUuid) {
    issues.push(mismatched);
  }
  if (!ownerIsRetired && link.retiredAt) {
    issues.push(retired);
  }
}

/**
 * Validates the direct links that consumers dereference without a nullable
 * check. Scalar UUIDs are the repair authority because they survive a Realm
 * target being physically removed by an older build.
 */
export function catalogStructuralIssues(object: RetireableCatalogObject): CatalogStructuralIssue[] {
  if (!object.isValid()) {
    return [CATALOG_STRUCTURAL_ISSUES.invalidRealmObject];
  }

  const issues: CatalogStructuralIssue[] = [];
  const ownerIsRetired = object.retiredAt != null;

  switch (object.objectSchema().name) {
    case 'Show': {
      const show = object as ShowShape;
      validateLink(
        issues,
        show.artist,
        show.artistUuid,
        CATALOG_STRUCTURAL_ISSUES.missingArtist,
        CATALOG_STRUCTURAL_ISSUES.mismatchedArtist,
        CATALOG_STRUCTURAL_ISSUES.retiredArtist,
        ownerIsRetired
      );
      break;
    }
    case 'Source': {
      const source = object as SourceShape;
      validateLink(
        issues,
        source.artist,
        source.artistUuid,
        CATALOG_STRUCTURAL_ISSUES.missingArtist,
        CATALOG_STRUCTURAL_ISSUES.mismatchedArtist,
        CATALOG_STRUCTURAL_ISSUES.retiredArtist,
        ownerIsRetired
      );
      break;
    }
    case 'SourceTrack': {
      const track = object as SourceTrackShape;
      validateLink(
        issues,
        track.artist,
        track.artistUuid,
        CATALOG_STRUCTURAL_ISSUES.missingArtist,
        CATALOG_STRUCTURAL_ISSUES.mismatchedArtist,
        CATALOG_STRUCTURAL_ISSUES.retiredArtist,
        ownerIsRetired
      );
      validateLink(
        issues,
        track.show,
        track.showUuid,
        CATALOG_STRUCTURAL_ISSUES.missingShow,
        CATALOG_STRUCTURAL_ISSUES.mismatchedShow,
        CATALOG_STRUCTURAL_ISSUES.retiredShow,
        ownerIsRetired
      );
      validateLink(
        issues,
        track.source,
        track.sourceUuid,
        CATALOG_STRUCTURAL_ISSUES.missingSource,
        CATALOG_STRUCTURAL_ISSUES.mismatchedSource,
        CATALOG_STRUCTURAL_ISSUES.retiredSource,
        ownerIsRetired
      );

      if (!track.year) {
        issues.push(CATALOG_STRUCTURAL_ISSUES.missingYear);
      } else if (track.show && track.year.uuid !== track.show.yearUuid) {
        issues.push(CATALOG_STRUCTURAL_ISSUES.mismatchedYear);
      } else if (!ownerIsRetired && track.year.retiredAt) {
        issues.push(CATALOG_STRUCTURAL_ISSUES.retiredYear);
      }

      if (track.show && track.show.artistUuid !== track.artistUuid) {
        issues.push(CATALOG_STRUCTURAL_ISSUES.showArtistMismatch);
      }
      if (track.source && track.source.artistUuid !== track.artistUuid) {
        issues.push(CATALOG_STRUCTURAL_ISSUES.sourceArtistMismatch);
      }
      if (track.source && track.source.showUuid !== track.showUuid) {
        issues.push(CATALOG_STRUCTURAL_ISSUES.sourceShowMismatch);
      }
      break;
    }
  }

  return issues;
}
