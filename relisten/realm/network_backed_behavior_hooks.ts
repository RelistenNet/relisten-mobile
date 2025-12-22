import { useCallback, useEffect, useMemo, useState } from 'react';
import Realm, { AnyRealmObject } from 'realm';
import {
  RelistenApiClient,
  RelistenApiClientError,
  RelistenApiResponse,
  RelistenApiResponseType,
} from '../api/client';
import { useRelistenApi } from '../api/context';
import { NetworkBackedBehavior, NetworkBackedBehaviorOptions } from './network_backed_behavior';
import { NetworkBackedResults } from './network_backed_results';
import { RelistenObjectRequiredProperties } from './relisten_object';
import { RelistenApiUpdatableObject, Repository } from './repository';
import { useRealm } from './schema';
import { NetworkBackedModelArrayBehavior } from '@/relisten/realm/network_backed_model_array_behavior';
import { NetworkBackedModelBehavior } from '@/relisten/realm/network_backed_model_behavior';

export function useNetworkOnlyResults<TApiData>(
  fetchFromNetwork: () => Promise<RelistenApiResponse<TApiData | undefined>>
): NetworkBackedResults<TApiData | undefined> {
  // if data doesn't exist, initialize the loading state
  const [isNetworkLoading, setIsNetworkLoading] = useState(true);
  const [data, setData] = useState<TApiData | undefined>(undefined);
  const [error, setError] = useState<RelistenApiClientError | undefined>();

  const refresh = useCallback(
    async (shouldForceLoadingSpinner: boolean) => {
      if (shouldForceLoadingSpinner) {
        setIsNetworkLoading(true);
      }
      const apiData = await fetchFromNetwork();

      if (apiData?.type == RelistenApiResponseType.OnlineRequestCompleted) {
        if (apiData?.data) {
          setData(apiData?.data);
        }

        if (apiData?.error) {
          setError(apiData?.error);
        }
      }

      setIsNetworkLoading(false);
    },
    [setIsNetworkLoading, setData, fetchFromNetwork, setError]
  );

  const results = useMemo<NetworkBackedResults<TApiData | undefined>>(() => {
    return {
      isNetworkLoading,
      data: data,
      // if were pull-to-refreshing, always show the spinner
      refresh: (force = true) => refresh(force),
      errors: error ? [error] : undefined,
    };
  }, [isNetworkLoading, data, refresh, error]);

  useEffect(() => {
    refresh(true);
  }, [fetchFromNetwork, refresh]);

  return results;
}

export function useNetworkBackedBehavior<TLocalData, TApiData>(
  behavior: NetworkBackedBehavior<TLocalData, TApiData>
): NetworkBackedResults<TLocalData> {
  const { apiClient } = useRelistenApi();
  const executor = behavior.sharedExecutor(apiClient);

  const [results, setResults] = useState<NetworkBackedResults<TLocalData>>(
    executor.currentResults()
  );

  useEffect(() => {
    const output = executor.start();
    const tearDownListener = output.addListener((newResults) => {
      setResults(newResults);
    });

    return () => {
      tearDownListener();
      executor.tearDown();
    };
  }, [behavior, apiClient, setResults]);

  return results;
}

export function createNetworkBackedModelArrayHook<
  TModel extends AnyRealmObject & RequiredProperties & RequiredRelationships,
  TApi extends RelistenApiUpdatableObject,
  RequiredProperties extends RelistenObjectRequiredProperties,
  RequiredRelationships extends object,
>(
  repo: Repository<TModel, TApi, RequiredProperties, RequiredRelationships>,
  fetchFromRealm: (realm: Realm.Realm) => Realm.Results<TModel>,
  fetchFromApi: (
    api: RelistenApiClient,
    forcedRefresh: boolean
  ) => Promise<RelistenApiResponse<TApi[]>>
): (options?: NetworkBackedBehaviorOptions) => NetworkBackedResults<Realm.Results<TModel>> {
  return (options) => {
    const realm = useRealm();

    const behavior = useMemo(() => {
      return new NetworkBackedModelArrayBehavior(
        realm,
        repo,
        fetchFromRealm,
        fetchFromApi,
        options
      );
    }, [options]);

    return useNetworkBackedBehavior(behavior);
  };
}

export function createNetworkBackedModelHook<
  TModel extends AnyRealmObject & RequiredProperties & RequiredRelationships,
  TApi extends RelistenApiUpdatableObject,
  RequiredProperties extends RelistenObjectRequiredProperties,
  RequiredRelationships extends object,
>(
  repo: Repository<TModel, TApi, RequiredProperties, RequiredRelationships>,
  fetchFromRealm: () => [
    type: string | (new (...args: unknown[]) => TModel),
    primaryKey: TModel[keyof TModel],
  ],
  fetchFromApi: (
    api: RelistenApiClient,
    forcedRefresh: boolean
  ) => Promise<RelistenApiResponse<TApi>>
): (options?: NetworkBackedBehaviorOptions) => NetworkBackedResults<TModel | null> {
  return (options) => {
    const realm = useRealm();

    const behavior = useMemo(() => {
      return new NetworkBackedModelBehavior(realm, repo, fetchFromRealm, fetchFromApi, options);
    }, [options]);

    return useNetworkBackedBehavior(behavior);
  };
}
