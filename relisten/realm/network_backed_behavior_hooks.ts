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
import { log } from '../util/logging';

export function useNetworkBackedBehavior<TLocalData, TApiData>(
  behavior: NetworkBackedBehavior<TLocalData, TApiData>
): NetworkBackedResults<TLocalData> {
  const realm = useRealm();
  const localData = behavior.fetchFromLocal();
  const api = useRelistenApi();
  const shouldPerformNetworkRequest = !behavior.isLocalDataShowable(localData);

  const [isNetworkLoading, setIsNetworkLoading] = useState(shouldPerformNetworkRequest);

  const refresh = async () => {
    const localDataShowable = behavior.isLocalDataShowable(localData);
    const shouldShowLoading = !localDataShowable;

    setIsNetworkLoading(shouldShowLoading);
    const apiData = await behavior.fetchFromApi(api.apiClient);

    if (apiData?.type == RelistenApiResponseType.OnlineRequestCompleted) {
      if (apiData?.data) {
        behavior.upsert(realm, localData, apiData.data);
      }
    }

    setIsNetworkLoading(false);
  };

  const results = useMemo<NetworkBackedResults<TLocalData>>(() => {
    return {
      isNetworkLoading,
      data: localData,
      refresh,
    };
  }, [isNetworkLoading, localData]);

  useEffect(() => {
    if (shouldPerformNetworkRequest) {
      log.info('Trying to perform network request on mount');
      refresh();
    }
  }, [shouldPerformNetworkRequest]);

  return results;
}

export interface NetworkBackedHookOptions {
  onlyFetchFromApiIfLocalIsNotShowable?: boolean;
}

export function createNetworkBackedModelArrayHook<
  TModel extends RequiredProperties & RequiredRelationships,
  TApi extends RelistenApiUpdatableObject,
  RequiredProperties extends RelistenObjectRequiredProperties,
  RequiredRelationships extends object,
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
  RequiredRelationships extends object,
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
