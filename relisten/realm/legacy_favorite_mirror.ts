/**
 * @deprecated Catalog models retain this field only as a compatibility mirror
 * for legacy anonymous favorites. Current membership lives in `UserFavorite`;
 * read it through `useFavorite` or `LibraryIndex` and write it through
 * `FavoriteRepository`.
 */
export interface LegacyFavoriteMirror {
  /**
   * @deprecated Do not use this value for current favorite membership. It can
   * differ from the active account's canonical `UserFavorite` state.
   */
  isFavorite: boolean;
}
