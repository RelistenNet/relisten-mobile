import { Collection, Model, TableName } from '@nozbe/watermelondb';
import { CopyableFromApi, database, UpdatableFromApi } from './database';
import { RelistenObject, RelistenUpdatableObject } from '../api/models/relisten';
import { BehaviorSubject, Observable } from 'rxjs';
import { RelistenApiClient } from '../api/client';
import { useEffect, useState } from 'react';
import { useRelistenApi } from '../api/context';
import * as R from 'remeda';
import dayjs from 'dayjs';

export enum RepoQueryDataSource {
  Database = 1,
  Network,
}

export const createRepoQueryHook = <
  TModel extends Model & CopyableFromApi<TApiModel> & UpdatableFromApi,
  TApiModel extends RelistenObject & RelistenUpdatableObject
>(
  table: TableName<TModel>,
  dbQueryFn: (collection: Collection<TModel>) => Observable<TModel[]>,
  apiCallFn: ((apiClient: RelistenApiClient) => Promise<TApiModel[]>) | undefined,
  postTreatment: (models: TModel[]) => TModel[]
) => {
  const subject$ = new BehaviorSubject<TModel[] | undefined>(undefined);

  subject$.subscribe((value) => {
    console.debug(table, 'got observable value', value?.length);
  });

  const logAndSendNext = (value: TModel[] | undefined) => {
    console.log(table, 'logAndSendNext', !value ? value : value.length);
    subject$.next(value);
  };

  return () => {
    const [isLoading, setIsLoading] = useState(true);
    const [dataSource, setDataSource] = useState<RepoQueryDataSource | null>(null);
    const [data, setData] = useState<Observable<TModel[] | undefined>>(subject$);
    const [error, setError] = useState<any | undefined>(undefined);

    const { apiClient } = useRelistenApi();

    useEffect(() => {
      const dbQuery = dbQueryFn(database.get<TModel>(table));

      let receivedFirstResult = false;

      dbQuery.subscribe(async (dbResults) => {
        console.debug(table, 'dbResults', dbResults.length);

        if (!dbResults) {
          console.error(`Unexpected dbResults: ${dbResults}`);
          return;
        }

        if (receivedFirstResult) {
          logAndSendNext(postTreatment(dbResults));
        } else {
          receivedFirstResult = true;

          const dbResultsById = R.flatMapToObj(dbResults, (model) => [[model.id, model]]);

          logAndSendNext(postTreatment(dbResults));
          setDataSource(RepoQueryDataSource.Database);

          // TODO: do not do this if there's no network connection or if the request was made < 10 mins ago
          const doNetwork = apiCallFn !== undefined;

          if (doNetwork) {
            const networkResults = await apiCallFn(apiClient);
            const networkResultsByUuid = R.flatMapToObj(networkResults, (apiModel) => [
              [apiModel.uuid, apiModel],
            ]);

            console.debug(table, 'networkResults', networkResults.length);

            const dbIds = Object.keys(dbResultsById);
            const networkUuids = Object.keys(networkResultsByUuid);

            // console.debug(table, 'dbIds', dbIds);
            // console.debug(table, 'networkUuids', networkUuids);

            const dbIdsToRemove = R.difference(dbIds, networkUuids);
            const newNetworkUuids = R.difference(networkUuids, dbIds);
            const idsToUpdate = R.intersection(dbIds, networkUuids);

            // console.debug(table, 'To remove', dbIdsToRemove);
            // console.debug(table, 'New', newNetworkUuids);
            // console.debug(table, 'To maybe update', idsToUpdate);

            const netResults = await database.write(async (writer) => {
              const preparedOperations: TModel[] = [];
              const netResults: TModel[] = [];

              for (const idToRemove of dbIdsToRemove) {
                preparedOperations.push(dbResultsById[idToRemove].prepareDestroyPermanently());
              }

              for (const newUuid of newNetworkUuids) {
                const apiModel = networkResultsByUuid[newUuid];

                const newModel = database.get<TModel>(table).prepareCreate((model) => {
                  model._raw.id = apiModel.uuid;
                  model.copyFromApi(apiModel);
                });

                preparedOperations.push(newModel);
                netResults.push(newModel);
              }

              for (const id of idsToUpdate) {
                const dbModel = dbResultsById[id];
                const apiModel = networkResultsByUuid[id];

                if (
                  dayjs(apiModel.updated_at).toDate().getTime() >
                  dbModel.relistenUpdatedAt.getTime()
                ) {
                  const updateModel = dbModel.prepareUpdate((model) => {
                    model.copyFromApi(apiModel);
                  });

                  preparedOperations.push(updateModel);
                  netResults.push(updateModel);
                }
              }

              await writer.batch(...preparedOperations);

              console.debug(table, 'netResults', netResults.length);

              return netResults;
            });

            setDataSource(RepoQueryDataSource.Network);
          }

          setIsLoading(false);
        }
      });
    }, []);

    return { isLoading, dataSource, data, error };
  };
};
