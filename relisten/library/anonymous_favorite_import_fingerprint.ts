export interface AnonymousFavoriteImportSource {
  catalogType: string;
  catalogUuid: string;
}

/**
 * Returns the exact identity of an anonymous-library snapshot. This is a
 * canonical serialization rather than a short hash so two different favorite
 * sets cannot accidentally share an import receipt.
 */
export function anonymousFavoriteSourceFingerprint(
  favorites: Iterable<AnonymousFavoriteImportSource>
) {
  const targetKeys = new Set<string>();
  for (const favorite of favorites) {
    targetKeys.add(`${favorite.catalogType}:${favorite.catalogUuid}`);
  }

  return JSON.stringify([...targetKeys].sort());
}
