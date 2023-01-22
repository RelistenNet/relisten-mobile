import { Collection, Database, Model, TableName } from '@nozbe/watermelondb';
import { CopyableFromApi, database, UpdatableFromApi } from './database';
import { RelistenObject, RelistenUpdatableObject } from '../api/models/relisten';
import { BehaviorSubject, Observable } from 'rxjs';
import { RelistenApiClient } from '../api/client';
import { useEffect, useState } from 'react';
import { useRelistenApi } from '../api/context';
import * as R from 'remeda';
import dayjs from 'dayjs';
import { WriterInterface } from '@nozbe/watermelondb/Database';
import { log } from '../util/logging';

const logger = log.extend('repo_query_hook_debug');
const alwaysLogger = log.extend('repo_query_hook');
log.disable('repo_query_hook_debug');

export enum RepoQueryDataSource {
  Database = 1,
  Network,
}

export async function upsertDbModelsFromNetwork<
  TModel extends Model & CopyableFromApi<TApiModel> & UpdatableFromApi,
  TApiModel extends RelistenObject & RelistenUpdatableObject
>(
  database: Database,
  table: string,
  dbIds: string[],
  networkUuids: string[],
  dbResultsById: Record<string, TModel>,
  networkResultsByUuid: Record<string, TApiModel>,
  writer: WriterInterface
): Promise<TModel[]> {
  const dbIdsToRemove = R.difference(dbIds, networkUuids);
  const newNetworkUuids = R.difference(networkUuids, dbIds);
  const idsToPossiblyUpdate = R.intersection(dbIds, networkUuids);
  const idsToUpdate: string[] = [];

  const preparedOperations: TModel[] = [];
  const netResults: TModel[] = [];

  logger.debug(`${dbIdsToRemove.length} dbIdsToRemove=${dbIdsToRemove}`);

  for (const idToRemove of dbIdsToRemove) {
    preparedOperations.push(dbResultsById[idToRemove].prepareDestroyPermanently());
  }

  logger.debug(`newNetworkUuids=${newNetworkUuids.length}`);

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

  logger.debug(`idsToUpdate.length idsToUpdate=${idsToUpdate}`);

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

  logger.debug(`${table} netResults=${netResults.length}`);
  alwaysLogger.info(
    `${table} new=${newNetworkUuids.length}, updated=${idsToUpdate.length}, deleted=${dbIdsToRemove.length}`
  );

  return netResults;
}

export function upsertNetworkResult<
  TModel extends Model & CopyableFromApi<TApiModel> & UpdatableFromApi,
  TApiModel extends RelistenObject & RelistenUpdatableObject,
  SingleOrArrayApiModel extends TApiModel | TApiModel[]
>(
  database: Database,
  table: string,
  networkResults: SingleOrArrayApiModel,
  dbResultsById: Record<string, TModel>,
  writer: WriterInterface
): Promise<TModel[]> {
  let networkResultsByUuid: Record<string, TApiModel> = {};

  if (R.isArray(networkResults)) {
    networkResultsByUuid = R.flatMapToObj(networkResults, (apiModel) => [
      [apiModel.uuid, apiModel],
    ]);
  } else {
    const model = networkResults as TApiModel;
    networkResultsByUuid = { [model.uuid]: model };
  }

  logger.debug(`${table} networkResults=${networkResults}`);

  const dbIds = Object.keys(dbResultsById);
  const networkUuids = Object.keys(networkResultsByUuid);

  return upsertDbModelsFromNetwork(
    database,
    table,
    dbIds,
    networkUuids,
    dbResultsById,
    networkResultsByUuid,
    writer
  );
}

export function defaultNetworkResultUpsertBehavior<
  TModel extends Model & CopyableFromApi<TApiModel> & UpdatableFromApi,
  TApiModel extends RelistenObject & RelistenUpdatableObject,
  SingleOrArrayApiModel extends TApiModel | TApiModel[]
>(
  database: Database,
  table: string,
  networkResults: SingleOrArrayApiModel,
  dbResultsById: Record<string, TModel>
): Promise<TModel[]> {
  return database.write((writer) =>
    upsertNetworkResult(database, table, networkResults, dbResultsById, writer)
  );
}

export interface RepoQueryHookResult<T> {
  isLoading: boolean;
  isNetworkLoading: boolean;
  showLoadingIndicator: boolean;
  error: any;
  data: T;
}

type RepoQueryResultsMapper<T> = {
  [K in keyof T]: RepoQueryHookResult<T[K]>;
};

export function mergeRepoQueryResults<T>(
  results: RepoQueryResultsMapper<T>
): RepoQueryHookResult<T> {
  const r: RepoQueryHookResult<T> = {
    isLoading: false,
    isNetworkLoading: false,
    showLoadingIndicator: false,
    error: {},
    data: {} as { [K in keyof T]: T[K] },
  };

  for (const key of Object.keys(results) as (keyof T)[]) {
    const result = results[key];
    r.isLoading ||= result.isLoading;
    r.isNetworkLoading ||= result.isNetworkLoading;
    r.showLoadingIndicator ||= result.showLoadingIndicator;
    r.error[key] = result.error;
    r.data[key] = result.data;
  }

  return r;
}

export const createRepoQueryHook = <
  TModel extends Model & CopyableFromApi<TApiModel> & UpdatableFromApi,
  TApiModel extends RelistenObject & RelistenUpdatableObject,
  TNetworkResponse,
  SingleOrArray extends TModel | undefined | TModel[]
>(
  table: TableName<TModel>,
  dbQueryFn: (collection: Collection<TModel>) => Observable<SingleOrArray>,
  apiCallFn: ((apiClient: RelistenApiClient) => Promise<TNetworkResponse>) | undefined,
  doApiCall: (lastNetworkRequestStartedAt: dayjs.Dayjs | undefined) => boolean,
  networkResultUpsertBehavior: (
    database: Database,
    table: string,
    networkResults: TNetworkResponse,
    dbResultsById: Record<string, TModel>
  ) => Promise<TModel[]>,
  postTreatment?: (models: SingleOrArray) => SingleOrArray
): (() => RepoQueryHookResult<Observable<SingleOrArray | undefined>>) => {
  const subject$ = new BehaviorSubject<SingleOrArray | undefined>(undefined);
  let lastNetworkRequestStartedAt: dayjs.Dayjs | undefined = undefined;

  function logObject(obj: SingleOrArray | undefined) {
    if (obj === undefined) {
      return obj;
    }

    if (R.isArray(obj)) {
      return (obj as TModel[]).length;
    }

    return 'not undefined';
  }

  subject$.subscribe((value) => {
    logger.debug(table, 'got observable value', logObject(value));
  });

  return () => {
    const [isLoading, setIsLoading] = useState(true);
    const [isNetworkLoading, setIsNetworkLoading] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [data, setData] = useState<Observable<SingleOrArray | undefined>>(subject$);
    // Because sometimes subject$.value hasn't updated by the same the return statement is executed
    const [lastDataValue, setLastDataValue] = useState<SingleOrArray | undefined>(subject$.value);
    const [error, setError] = useState<any | undefined>(undefined);

    const { apiClient } = useRelistenApi();

    useEffect(() => {
      const logAndSendNext = (value: SingleOrArray | undefined) => {
        setLastDataValue(value);
        subject$.next(value);
      };

      const dbQuery = dbQueryFn(database.get<TModel>(table));

      let receivedFirstResult = false;

      dbQuery.subscribe(async (dbResults) => {
        logger.debug(`${table} dbResults=${logObject(dbResults)}`);

        if (receivedFirstResult) {
          logAndSendNext(postTreatment ? postTreatment(dbResults) : dbResults);
        } else {
          receivedFirstResult = true;

          let dbResultsById: Record<string, TModel> = {};

          if (R.isArray(dbResults)) {
            const modelArr = dbResults as TModel[];
            dbResultsById = R.flatMapToObj(modelArr, (model) => [[model.id, model]]);
          } else if (dbResults !== undefined) {
            const model = dbResults as TModel;
            dbResultsById = { [model.id]: model };
          }

          logAndSendNext(postTreatment ? postTreatment(dbResults) : dbResults);
          setIsLoading(false);

          const doNetwork = doApiCall(lastNetworkRequestStartedAt) && apiCallFn !== undefined;

          if (doNetwork) {
            const requestStartedAt = dayjs();
            setIsNetworkLoading(true);

            let networkResults: TNetworkResponse;
            try {
              networkResults = await apiCallFn(apiClient);
              lastNetworkRequestStartedAt = requestStartedAt;
            } catch (e) {
              setError(e);
              setIsNetworkLoading(false);
              return;
            }

            await networkResultUpsertBehavior(database, table, networkResults, dbResultsById);
            setIsNetworkLoading(false);
          }
        }
      });
    }, []);

    const emptyArray = R.isArray(lastDataValue) ? lastDataValue.length === 0 : false;

    return {
      isLoading,
      isNetworkLoading,
      showLoadingIndicator:
        isLoading || (isNetworkLoading && (lastDataValue === undefined || emptyArray)),
      data,
      error,
    };
  };
};

const MIN_TIME_API_CALLS_MS = 10 * 60 * 1000;

export const createSimpleRepoQueryHook = <
  TModel extends Model & CopyableFromApi<TApiModel> & UpdatableFromApi,
  TApiModel extends RelistenObject & RelistenUpdatableObject,
  SingleOrArrayApiModel extends TApiModel | TApiModel[],
  SingleOrArray extends TModel | undefined | TModel[]
>(
  table: TableName<TModel>,
  dbQueryFn: (collection: Collection<TModel>) => Observable<SingleOrArray>,
  apiCallFn: ((apiClient: RelistenApiClient) => Promise<SingleOrArrayApiModel>) | undefined,
  postTreatment?: (models: SingleOrArray) => SingleOrArray
) => {
  return createRepoQueryHook(
    table,
    dbQueryFn,
    apiCallFn,
    (lastRequestedAt: dayjs.Dayjs | undefined) =>
      lastRequestedAt ? dayjs().diff(lastRequestedAt) >= MIN_TIME_API_CALLS_MS : false,
    defaultNetworkResultUpsertBehavior,
    postTreatment
  );
};
