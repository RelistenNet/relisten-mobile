import {Favoritable, Favorited} from "../database";
import {Columns, Tables} from "../schema";
import {Database, Model, Q} from "@nozbe/watermelondb";
import {combineLatest, Observable, of} from "rxjs";
import {map, switchMap} from "rxjs/operators";
import {UserList, UserListEntry, UserListSpecialType} from "./user_list";

export async function findOrCreateFavoritesList(database: Database): Promise<UserList> {
    const userLists = database.get<UserList>(Tables.userLists);

    const lists = await userLists
        .query(Q.where(Columns.userLists.specialType, UserListSpecialType.Favorites))
        .fetch();
    let userList: UserList;

    if (lists.length === 0) {
        userList = await database.write(async () => {
            return await userLists.create(userList => {
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

export function asFavorited<T extends Favoritable & Model>(database: Database, models: Observable<T[] | undefined>): Observable<Favorited<T>[]> {
    const ff$ = combineLatest([findOrCreateFavoritesList(database), models]);

    return ff$.pipe(switchMap(([userList, newModels]: [UserList, T[] | undefined]) => {
        if (!newModels || newModels.length === 0) {
            return of([]);
        }

        const favoriteIdColumn = newModels[0].favoriteIdColumn;

        const query$ = database.get<UserListEntry>(Tables.userListEntries)
            .query(
                Q.and(
                    Q.where(Columns.userListEntries.onUserListId, userList.id),
                    Q.where(favoriteIdColumn, Q.oneOf(newModels.map(m => m.id)))
                )
            )
            .observe();

        return query$.pipe(map(favoriteEntries => {
            const results = [] as Favorited<T>[];

            for (const model of newModels) {
                let isFavorite = false;
                for (const entry of favoriteEntries) {
                    isFavorite = model.matchesEntry(entry);

                    if (isFavorite) {
                        break;
                    }
                }

                results.push({
                    model,
                    isFavorite
                });
            }

            return results;
        }));
    }));
}
