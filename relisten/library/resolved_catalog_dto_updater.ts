type ResolvedCatalogDtoGroups = {
  artists: readonly unknown[];
  years: readonly unknown[];
  venues: readonly unknown[];
  tours: readonly unknown[];
  shows: readonly unknown[];
  sources: readonly unknown[];
  source_sets: readonly unknown[];
  source_tracks: readonly unknown[];
  songs: readonly unknown[];
};

type ResolvedCatalogDtoUpserters<Groups extends ResolvedCatalogDtoGroups> = {
  [Key in keyof Groups]: (
    entity: Groups[Key] extends readonly (infer Entity)[] ? Entity : never
  ) => void;
};

const GROUP_ORDER = [
  'artists',
  'years',
  'venues',
  'tours',
  'shows',
  'sources',
  'source_sets',
  'source_tracks',
  'songs',
] as const;

/**
 * Applies the resolver's additive entity sidecar. The interface intentionally
 * has no delete operation because an omitted DTO is not catalog-removal proof.
 */
export function upsertResolvedCatalogDtos<Groups extends ResolvedCatalogDtoGroups>(
  groups: Groups,
  upserters: ResolvedCatalogDtoUpserters<Groups>
) {
  for (const group of GROUP_ORDER) {
    const upsert = upserters[group] as (entity: unknown) => void;
    for (const entity of groups[group]) {
      upsert(entity);
    }
  }
}
