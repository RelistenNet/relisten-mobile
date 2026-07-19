export * from './anonymous_favorite_import';
export * from './catalog_availability';
export * from './favorite_catalog_type';
export * from './favorite_mutation';
export * from './favorite_sync_state';
export * from './user_favorite';

import { AnonymousFavoriteImport } from './anonymous_favorite_import';
import { CatalogAvailability } from './catalog_availability';
import { FavoriteMutation } from './favorite_mutation';
import { FavoriteSyncState } from './favorite_sync_state';
import { UserFavorite } from './user_favorite';

export const FAVORITE_REALM_MODELS = [
  UserFavorite,
  FavoriteMutation,
  FavoriteSyncState,
  AnonymousFavoriteImport,
  CatalogAvailability,
] as const;
