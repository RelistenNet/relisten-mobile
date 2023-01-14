import { Collection, Database, Model, TableName } from '@nozbe/watermelondb';
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

export function upsertDbModelsFromNetwork<
  TModel extends Model & CopyableFromApi<TApiModel> & UpdatableFromApi,
  TApiModel extends RelistenObject & RelistenUpdatableObject
>(
  database: Database,
  table: string,
  dbIds: string[],
  networkUuids: string[],
  dbResultsById: Record<string, TModel>,
  networkResultsByUuid: Record<string, TApiModel>
): Promise<TModel[]> {
  const dbIdsToRemove = R.difference(dbIds, networkUuids);
  const newNetworkUuids = R.difference(networkUuids, dbIds);
  const idsToPossiblyUpdate = R.intersection(dbIds, networkUuids);
  const idsToUpdate: string[] = [];

  return database.write(async (writer) => {
    const preparedOperations: TModel[] = [];
    const netResults: TModel[] = [];

    console.debug(dbIdsToRemove.length, 'dbIdsToRemove=', dbIdsToRemove);

    for (const idToRemove of dbIdsToRemove) {
      preparedOperations.push(dbResultsById[idToRemove].prepareDestroyPermanently());
    }

    console.debug(newNetworkUuids.length, 'newNetworkUuids=', newNetworkUuids);

    for (const newUuid of newNetworkUuids) {
      const apiModel = networkResultsByUuid[newUuid];

      const newModel = database.get<TModel>(table).prepareCreate((model) => {
        model._raw.id = apiModel.uuid;
        model.copyFromApi(apiModel);
      });

      preparedOperations.push(newModel);
      netResults.push(newModel);
    }

    for (const id of idsToPossiblyUpdate) {
      const dbModel = dbResultsById[id];
      const apiModel = networkResultsByUuid[id];

      if (dayjs(apiModel.updated_at).toDate().getTime() > dbModel.relistenUpdatedAt.getTime()) {
        idsToUpdate.push(id);
      }
    }

    console.debug(idsToUpdate.length, 'idsToUpdate=', idsToUpdate);

    for (const id of idsToUpdate) {
      const dbModel = dbResultsById[id];
      const apiModel = networkResultsByUuid[id];

      const updateModel = dbModel.prepareUpdate((model) => {
        model.copyFromApi(apiModel);
      });

      preparedOperations.push(updateModel);
      netResults.push(updateModel);
    }

    await writer.batch(...preparedOperations);

    console.debug(table, 'netResults', netResults.length);

    return netResults;
  });
}

export function defaultNetworkResultUpsertBehavior<
  TModel extends Model & CopyableFromApi<TApiModel> & UpdatableFromApi,
  TApiModel extends RelistenObject & RelistenUpdatableObject
>(
  database: Database,
  table: string,
  networkResults: TApiModel[],
  dbResultsById: Record<string, TModel>
): Promise<TModel[]> {
  const networkResultsByUuid = R.flatMapToObj(networkResults, (apiModel) => [
    [apiModel.uuid, apiModel],
  ]);

  console.debug(table, 'networkResults', networkResults.length);

  const dbIds = Object.keys(dbResultsById);
  const networkUuids = Object.keys(networkResultsByUuid);

  return upsertDbModelsFromNetwork(
    database,
    table,
    dbIds,
    networkUuids,
    dbResultsById,
    networkResultsByUuid
  );
}

export const createRepoQueryHook = <
  TModel extends Model & CopyableFromApi<TApiModel> & UpdatableFromApi,
  TApiModel extends RelistenObject & RelistenUpdatableObject,
  TNetworkResponse
>(
  table: TableName<TModel>,
  dbQueryFn: (collection: Collection<TModel>) => Observable<TModel[]>,
  apiCallFn: ((apiClient: RelistenApiClient) => Promise<TNetworkResponse>) | undefined,
  doApiCall: (lastNetworkRequestStartedAt: dayjs.Dayjs | undefined) => boolean,
  networkResultUpsertBehavior: (
    database: Database,
    table: string,
    networkResults: TNetworkResponse,
    dbResultsById: Record<string, TModel>
  ) => Promise<TModel[]>,
  postTreatment: (models: TModel[]) => TModel[]
) => {
  const subject$ = new BehaviorSubject<TModel[] | undefined>(undefined);
  let lastNetworkRequestStartedAt: dayjs.Dayjs | undefined = undefined;

  subject$.subscribe((value) => {
    console.debug(table, 'got observable value', value?.length);
  });

  const logAndSendNext = (value: TModel[] | undefined) => {
    console.log(table, 'logAndSendNext', !value ? value : value.length);
    subject$.next(value);
  };

  return () => {
    const [isLoading, setIsLoading] = useState(true);
    const [isNetworkLoading, setIsNetworkLoading] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
          setIsLoading(false);

          // TODO: do not do this if there's no network connection or if the request was made < 10 mins ago
          const doNetwork = doApiCall(lastNetworkRequestStartedAt) && apiCallFn !== undefined;

          if (doNetwork) {
            setIsNetworkLoading(true);

            try {
              const requestStartedAt = dayjs();
              const networkResults = await apiCallFn(apiClient);
              await networkResultUpsertBehavior(database, table, networkResults, dbResultsById);
              lastNetworkRequestStartedAt = requestStartedAt;
            } catch (e) {
              setError(e);
            }

            setIsNetworkLoading(false);
          }
        }
      });
    }, []);

    return { isLoading, isNetworkLoading, data, error };
  };
};

export const createSimpleRepoQueryHook = <
  TModel extends Model & CopyableFromApi<TApiModel> & UpdatableFromApi,
  TApiModel extends RelistenObject & RelistenUpdatableObject
>(
  table: TableName<TModel>,
  dbQueryFn: (collection: Collection<TModel>) => Observable<TModel[]>,
  apiCallFn: ((apiClient: RelistenApiClient) => Promise<TApiModel[]>) | undefined,
  postTreatment: (models: TModel[]) => TModel[]
) => {
  return createRepoQueryHook(
    table,
    dbQueryFn,
    apiCallFn,
    () => true,
    defaultNetworkResultUpsertBehavior,
    postTreatment
  );
};
