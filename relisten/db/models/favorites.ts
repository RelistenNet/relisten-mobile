import { Favoritable, Favorited } from '../database';
import { Columns, Tables } from '../schema';
import { Database, Model, Q } from '@nozbe/watermelondb';
import { combineLatest, Observable, of } from 'rxjs';
import { distinctUntilChanged, map as map$, map, switchMap } from 'rxjs/operators';
import { UserList, UserListEntry, UserListSpecialType } from './user_list';

export async function findOrCreateFavoritesList(database: Database): Promise<UserList> {
  const userLists = database.get<UserList>(Tables.userLists);

  const lists = await userLists
    .query(Q.where(Columns.userLists.specialType, UserListSpecialType.Favorites))
    .fetch();
  let userList: UserList;

  if (lists.length === 0) {
    // TODO: make this a migration so this function doesn't need a write block
    userList = await database.write(async () => {
      return await userLists.create((userList) => {
        userList.specialType = UserListSpecialType.Favorites;
        userList.title = 'Favorites';
        userList.description = '';
        userList.isPlaylist = false;
        userList.isPublic = true;
      });
    });
  } else {
    userList = lists[0];
  }

  return userList;
}

export function asFavorited<T extends Favoritable & Model>(
  database: Database,
  models: Observable<T[] | undefined>
): Observable<Favorited<T>[]> {
  const ff$ = combineLatest([findOrCreateFavoritesList(database), models]);

  return ff$.pipe(
    switchMap(([userList, newModels]: [UserList, T[] | undefined]) => {
      if (!newModels || newModels.length === 0) {
        return of([]);
      }

      const favoriteIdProperty = newModels[0].favoriteIdProperty;
      const favoriteIdColumn = Columns.userListEntries[favoriteIdProperty];

      const query$ = database
        .get<UserListEntry>(Tables.userListEntries)
        .query(
          Q.and(
            Q.where(Columns.userListEntries.onUserListId, userList.id),
            Q.where(favoriteIdColumn, Q.oneOf(newModels.map((m) => m.id)))
          )
        )
        .observe();

      return query$.pipe(
        map((favoriteEntries) => {
          const results = [] as Favorited<T>[];
          const favoritesById: { [id: string]: boolean } = {};

          for (const entry of favoriteEntries) {
            // this is the column name instead of the property name.....
            favoritesById[entry[favoriteIdProperty]] = true;
          }

          for (const model of newModels) {
            results.push({
              model,
              isFavorite: favoritesById[model.id] || false,
            });
          }

          return results;
        })
      );
    })
  );
}

export function defaultSetIsFavoriteBehavior(
  model: Favoritable
): (favorite: boolean) => Promise<void> {
  return async (favorite: boolean) => {
    await model.database.write(async (writer) => {
      // const userList: UserList = await writer.callWriter(findOrCreateFavoritesList(model.database));
      const userList: UserList = await findOrCreateFavoritesList(model.database);

      const userListEntries = model.database.collections.get<UserListEntry>(Tables.userListEntries);

      const entries = await userListEntries
        .query(
          Q.and(
            Q.where(Columns.userListEntries.onUserListId, userList.id),
            Q.where(Columns.userListEntries[model.favoriteIdProperty], model.id)
          )
        )
        .fetch();

      const dbIsFavorited = entries.length > 0;

      if (favorite && !dbIsFavorited) {
        await userListEntries.create((entry) => {
          entry[model.favoriteIdProperty] = model.id;
          entry.onUserList.id = userList.id;
        });
      } else if (!favorite && dbIsFavorited) {
        await entries[0].destroyPermanently();
      }
    });
  };
}

export function isFavoriteProperty(model: Favoritable) {
  return model.onLists.observe().pipe(
    map$((lists) => {
      for (const list of lists) {
        if (list.specialType == UserListSpecialType.Favorites) {
          return true;
        }
      }

      return false;
    }),
    distinctUntilChanged()
  );
}
