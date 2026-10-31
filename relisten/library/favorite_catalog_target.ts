import {
  FavoriteTargetKind,
  isFavoriteTargetKind,
} from '@/relisten/realm/models/library/favorite_catalog_type';
import { isPostgresUuid } from '@/relisten/util/postgres_uuid';
import { formatUuidTypedId, parseUuidTypedId } from '@/relisten/util/typed_uuid_id';

export interface FavoriteTarget {
  kind: FavoriteTargetKind;
  id: string;
}

export const CATALOG_FAVORITE_TARGET_KINDS = [
  'artist',
  'show',
  'source',
  'track',
  'imported_song',
  'imported_venue',
  'tour',
] as const satisfies readonly FavoriteTargetKind[];

export type CatalogFavoriteTargetKind = (typeof CATALOG_FAVORITE_TARGET_KINDS)[number];

export type V3FavoriteCatalogType =
  | 'artist'
  | 'show'
  | 'source'
  | 'source_track'
  | 'song'
  | 'tour'
  | 'venue';

export interface V3FavoriteCatalogReference {
  catalog_type: V3FavoriteCatalogType;
  catalog_uuid: string;
}

const V3_TYPE_BY_TARGET_KIND: Record<CatalogFavoriteTargetKind, V3FavoriteCatalogType> = {
  artist: 'artist',
  show: 'show',
  source: 'source',
  track: 'source_track',
  imported_song: 'song',
  imported_venue: 'venue',
  tour: 'tour',
};

const TARGET_KIND_BY_V3_TYPE: Record<V3FavoriteCatalogType, CatalogFavoriteTargetKind> = {
  artist: 'artist',
  show: 'show',
  source: 'source',
  source_track: 'track',
  song: 'imported_song',
  venue: 'imported_venue',
  tour: 'tour',
};

export function favoriteTargetForCatalogUuid(
  kind: CatalogFavoriteTargetKind,
  catalogUuid: string
): FavoriteTarget {
  return { kind, id: formatUuidTypedId(kind, catalogUuid) };
}

export function favoriteTargetForCatalogReference(
  reference: V3FavoriteCatalogReference
): FavoriteTarget {
  return favoriteTargetForCatalogUuid(
    TARGET_KIND_BY_V3_TYPE[reference.catalog_type],
    reference.catalog_uuid
  );
}

/** Returns null for normalized song_/venue_ targets and malformed imported IDs. */
export function catalogReferenceForFavoriteTarget(
  target: FavoriteTarget
): V3FavoriteCatalogReference | null {
  if (!isCatalogFavoriteTargetKind(target.kind)) {
    return null;
  }

  const catalogUuid = parseUuidTypedId(target.id, target.kind);
  if (!catalogUuid || !isPostgresUuid(catalogUuid)) {
    return null;
  }

  return {
    catalog_type: V3_TYPE_BY_TARGET_KIND[target.kind],
    catalog_uuid: catalogUuid,
  };
}

export function isFavoriteTarget(value: unknown): value is FavoriteTarget {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { kind?: unknown; id?: unknown };
  if (
    typeof candidate.kind !== 'string' ||
    !isFavoriteTargetKind(candidate.kind) ||
    typeof candidate.id !== 'string'
  ) {
    return false;
  }

  if (candidate.kind === 'song' || candidate.kind === 'venue') {
    return isShortTargetId(candidate.id, candidate.kind);
  }

  return catalogReferenceForFavoriteTarget({ kind: candidate.kind, id: candidate.id }) !== null;
}

export function favoriteTargetKey(target: FavoriteTarget) {
  return `${target.kind}:${target.id}`;
}

function isCatalogFavoriteTargetKind(kind: FavoriteTargetKind): kind is CatalogFavoriteTargetKind {
  return CATALOG_FAVORITE_TARGET_KINDS.includes(kind as CatalogFavoriteTargetKind);
}

function isShortTargetId(value: string, expectedKind: 'song' | 'venue') {
  const suffix = value.startsWith(`${expectedKind}_`) ? value.slice(expectedKind.length + 1) : '';
  return suffix.length === 8 && /^[0-9a-hjkmnp-tv-z]+$/.test(suffix);
}
