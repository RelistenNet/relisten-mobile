import { NetworkBackedResults, useNetworkBackedResults } from './network_backed_results';
import { RelistenApiUpdatableObject, Repository } from './repository';
import { RelistenObjectRequiredProperties } from './relisten_object';
import Realm from 'realm';
import { RelistenApiClient, RelistenApiResponse, RelistenApiResponseType } from '../api/client';
import { useRealm } from './schema';
import { useRelistenApi } from '../api/context';
import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  NetworkBackedBehavior,
  NetworkBackedModelArrayBehavior,
  NetworkBackedModelBehavior,
} from './network_backed_behavior';

export function useNetworkBackedBehavior<TLocalData, TApiData>(
  behavior: NetworkBackedBehavior<TLocalData, TApiData>
): NetworkBackedResults<TLocalData> {
  const realm = useRealm();
  const localData = behavior.fetchFromLocal();
  const api = useRelistenApi();
  const {
    results,
    setIsStale,
    setIsNetworkLoading,
    setShouldShowLoadingIndicator,
    performNetworkRequest: forceNetworkRequest,
    setPerformNetworkRequest,
    setData,
  } = useNetworkBackedResults<TLocalData>(
    localData,
    !behavior.isLocalDataShowable(localData),
    true,
    false
  );
  const [apiData, setApiData] = useState<TApiData | undefined>(undefined);
  const [hasDoneUpsert, setHasDoneUpsert] = useState<boolean>(false);
  const [lastRequestAt, setLastRequestAt] = useState<dayjs.Dayjs | undefined>(undefined);

  const shouldPerformNetworkRequest = behavior.shouldPerformNetworkRequest(
    lastRequestAt,
    localData
  );

  useEffect(() => {
    if (shouldPerformNetworkRequest || forceNetworkRequest) {
      (async () => {
        setIsNetworkLoading(true);
        const apiData = await behavior.fetchFromApi(api.apiClient);
        setLastRequestAt(dayjs());
        setIsNetworkLoading(false);
        setPerformNetworkRequest(false);
        setHasDoneUpsert(false);

        if (apiData?.type == RelistenApiResponseType.OnlineRequestCompleted) {
          setApiData(apiData.data);
        }
      })();
    }
  }, [shouldPerformNetworkRequest, forceNetworkRequest, api.apiClient, setApiData]);

  useEffect(() => {
    const localDataShowable = behavior.isLocalDataShowable(localData);

    setShouldShowLoadingIndicator(!localDataShowable);

    if (apiData && !hasDoneUpsert) {
      behavior.upsert(realm, localData, apiData);
      setHasDoneUpsert(true);
      setIsStale(false);
      setShouldShowLoadingIndicator(false);
    }
  }, [realm, apiData, localData, hasDoneUpsert, setHasDoneUpsert]);

  useEffect(() => {
    setData(localData);
  }, [localData]);

  return results;
}

export interface NetworkBackedHookOptions {
  onlyFetchFromApiIfLocalIsNotShowable?: boolean;
}

export function createNetworkBackedModelArrayHook<
  TModel extends RequiredProperties & RequiredRelationships,
  TApi extends RelistenApiUpdatableObject,
  RequiredProperties extends RelistenObjectRequiredProperties,
  RequiredRelationships extends object
>(
  repo: Repository<TModel, TApi, RequiredProperties, RequiredRelationships>,
  fetchFromRealm: () => Realm.Results<TModel>,
  fetchFromApi: (api: RelistenApiClient) => Promise<RelistenApiResponse<TApi[]>>
): (options?: NetworkBackedHookOptions) => NetworkBackedResults<Realm.Results<TModel>> {
  return (options) => {
    const behavior = useMemo(() => {
      return new NetworkBackedModelArrayBehavior(
        repo,
        fetchFromRealm,
        fetchFromApi,
        undefined,
        options?.onlyFetchFromApiIfLocalIsNotShowable
      );
    }, [options?.onlyFetchFromApiIfLocalIsNotShowable]);

    return useNetworkBackedBehavior(behavior);
  };
}

export function createNetworkBackedModelHook<
  TModel extends RequiredProperties & RequiredRelationships,
  TApi extends RelistenApiUpdatableObject,
  RequiredProperties extends RelistenObjectRequiredProperties,
  RequiredRelationships extends object
>(
  repo: Repository<TModel, TApi, RequiredProperties, RequiredRelationships>,
  fetchFromRealm: () => TModel | null,
  fetchFromApi: (api: RelistenApiClient) => Promise<RelistenApiResponse<TApi>>
): (options?: NetworkBackedHookOptions) => NetworkBackedResults<TModel | null> {
  return (options) => {
    const behavior = useMemo(() => {
      return new NetworkBackedModelBehavior(
        repo,
        fetchFromRealm,
        fetchFromApi,
        undefined,
        options?.onlyFetchFromApiIfLocalIsNotShowable
      );
    }, [options?.onlyFetchFromApiIfLocalIsNotShowable]);

    return useNetworkBackedBehavior(behavior);
  };
}
