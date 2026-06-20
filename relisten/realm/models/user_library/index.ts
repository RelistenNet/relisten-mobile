import { UserAuthSessionMetadata } from './auth';
import { ScopedPlaybackHistoryEntry } from './history';
import { ScopedUserSettings, UserFavorite } from './library';
import { UserMobileAccessGrant, UserPlaylist, UserPlaylistEntry } from './playlists';
import { ActiveUserDataScope } from './scope';
import { PendingUserOperation, UserDataMigrationMarker, UserSyncCursor } from './sync';

// Register user-owned Realm models together so schema/migration changes stay
// visibly scoped away from the shared catalog cache models.
export const USER_LIBRARY_REALM_MODELS = [
  ActiveUserDataScope,
  UserAuthSessionMetadata,
  UserPlaylist,
  UserPlaylistEntry,
  UserMobileAccessGrant,
  UserFavorite,
  ScopedUserSettings,
  PendingUserOperation,
  UserSyncCursor,
  UserDataMigrationMarker,
  ScopedPlaybackHistoryEntry,
] as const;

export * from './auth';
export * from './history';
export * from './library';
export * from './migrations';
export * from './playlists';
export * from './scope';
export * from './sync';
