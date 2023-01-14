import Artist from './models/artist';
import { Database, Model } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { relistenDbSchema } from './schema';
import { RelistenObject } from '../api/models/relisten';
import { UserList, UserListEntry } from './models/user_list';
import { setGenerator } from '@nozbe/watermelondb/utils/common/randomId';
import { v4 as uuidV4 } from 'uuid';
import logger from '@nozbe/watermelondb/utils/common/logger';
import Show from './models/show';
import Year from './models/year';

logger.log = (...messages) => console.info(...messages);
logger.warn = (...messages) => console.warn(...messages);
logger.error = (...messages) => console.error(...messages);

export interface CopyableFromApi<T extends RelistenObject> {
  copyFromApi(relistenObj: T): void;
}

export interface UpdatableFromApi {
  relistenUpdatedAt: Date;
}

export interface Favoritable {
  favoriteIdColumn: string;
  matchesEntry(entry: UserListEntry): boolean;
  setIsFavorite(favorite: boolean): Promise<void>;
}

export interface Favorited<M extends Model & Favoritable> {
  model: M;
  isFavorite: boolean;
}

setGenerator(() => {
  return uuidV4();
});

const adapter = new SQLiteAdapter({
  schema: relistenDbSchema,

  // (You might want to comment it out for development purposes -- see Migrations documentation)
  // migrations,

  // (optional database name or file system path)
  dbName: 'relisten',

  // (recommended option, should work flawlessly out of the box on iOS. On Android,
  // additional installation steps have to be taken - disable if you run into issues...)
  jsi: true /* Platform.OS === 'ios' */,

  onSetUpError: (error) => {
    // TODO: do something; database failed to load -- offer the user to reload the app or log out
    console.error(error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [Artist, UserList, UserListEntry, Year, Show],
});
