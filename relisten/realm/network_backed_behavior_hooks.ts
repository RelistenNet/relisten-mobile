import { useMemo } from 'react';
import Realm from 'realm';
import useSWR from 'swr';
import { RelistenApiClient, RelistenApiResponse, RelistenApiResponseType } from '../api/client';
import { useRelistenApi } from '../api/context';
import {
  NetworkBackedBehavior,
  NetworkBackedModelArrayBehavior,
  NetworkBackedModelBehavior,
} from './network_backed_behavior';
import { NetworkBackedResults } from './network_backed_results';
import { RelistenObjectRequiredProperties } from './relisten_object';
import { RelistenApiUpdatableObject, Repository } from './repository';
import { useRealm } from './schema';

export function useNetworkBackedBehavior<TLocalData, TApiData>(
  behavior: NetworkBackedBehavior<TLocalData, TApiData>
): NetworkBackedResults<TLocalData> {
  const localData = behavior.fetchFromLocal();
  const shouldFetch = behavior.shouldPerformNetworkRequest(localData);
  const api = useRelistenApi();
  console.log(shouldFetch, behavior.cacheKey);
  const { data, isLoading, mutate, isValidating } = useSWR(
    shouldFetch ? behavior.cacheKey : undefined,
    () => {
      console.log('hi');
      return behavior.fetchFromApi(api.apiClient);
    },

    {
      onSuccess: (apiData) => {
        console.log('onSuccess', apiData);
        if (apiData?.type == RelistenApiResponseType.OnlineRequestCompleted) {
          if (apiData?.data) {
            behavior.upsert(realm, localData, apiData.data);
          }
        }
      },
    }
  );
  const realm = useRealm();

  const results = useMemo(() => {
    return {
      data: localData satisfies TLocalData,
      isNetworkLoading: isLoading || isValidating,
      refresh: mutate,
    };
  }, [data, localData, mutate]);

  console.log('dataaaaaa', behavior.cacheKey, isLoading, isValidating, !!data, !!localData);

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
  cacheKey: string | Array<string | number | undefined>,
  repo: Repository<TModel, TApi, RequiredProperties, RequiredRelationships>,
  fetchFromRealm: () => Realm.Results<TModel>,
  fetchFromApi: (api: RelistenApiClient) => Promise<RelistenApiResponse<TApi[]>>
): (options?: NetworkBackedHookOptions) => NetworkBackedResults<Realm.Results<TModel>> {
  return (options) => {
    const behavior = useMemo(() => {
      return new NetworkBackedModelArrayBehavior(
        cacheKey,
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
  cacheKey: string | Array<string | number | undefined>,
  repo: Repository<TModel, TApi, RequiredProperties, RequiredRelationships>,
  fetchFromRealm: () => TModel | null,
  fetchFromApi: (api: RelistenApiClient) => Promise<RelistenApiResponse<TApi>>
): (options?: NetworkBackedHookOptions) => NetworkBackedResults<TModel | null> {
  return (options) => {
    const behavior = useMemo(() => {
      return new NetworkBackedModelBehavior(
        cacheKey,
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
