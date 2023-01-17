import Artist from './models/artist';
import { Database, Model, Query } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { ColumnPropertyNames, relistenDbSchema } from './schema';
import { RelistenObject } from '../api/models/relisten';
import { UserList, UserListEntry } from './models/user_list';
import { setGenerator } from '@nozbe/watermelondb/utils/common/randomId';
import { v4 as uuidV4 } from 'uuid';
import logger from '@nozbe/watermelondb/utils/common/logger';
import Show from './models/show';
import Year from './models/year';
import { Observable } from 'rxjs';
import Source from './models/source';
import SourceSet from './models/source_set';
import SourceTrack from './models/source_track';
import Tour from './models/tour';
import Venue from './models/venue';
import SetlistSong from './models/setlist_song';

logger.log = (...messages) => console.info(...messages);
logger.warn = (...messages) => console.warn(...messages);
logger.error = (...messages) => console.error(...messages);

export interface CopyableFromApi<T extends RelistenObject> {
  copyFromApi(relistenObj: T): void;
}

export interface UpdatableFromApi {
  relistenUpdatedAt: Date;
}

export interface Favoritable extends Model {
  favoriteIdProperty: ColumnPropertyNames<'userListEntries'>;
  setIsFavorite(favorite: boolean): Promise<void>;
  onLists: Query<UserList>;
  isFavorite: Observable<boolean>;
}

export interface Favorited<M extends Favoritable> {
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
  modelClasses: [
    Artist,
    UserList,
    UserListEntry,
    Year,
    Show,
    Source,
    SourceSet,
    SourceTrack,
    Tour,
    Venue,
    Year,
    SetlistSong,
  ],
});

// database.write(async () => {
//   database.unsafeResetDatabase();
// });
