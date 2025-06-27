import { useCallback, useEffect, useMemo, useState } from 'react';
import Realm from 'realm';
import {
  RelistenApiClient,
  RelistenApiClientError,
  RelistenApiResponse,
  RelistenApiResponseType,
} from '../api/client';
import { useRelistenApi } from '../api/context';
import {
  NetworkBackedBehavior,
  NetworkBackedBehaviorFetchStrategy,
  NetworkBackedBehaviorOptions,
  NetworkBackedModelArrayBehavior,
  NetworkBackedModelBehavior,
} from './network_backed_behavior';
import { NetworkBackedResults } from './network_backed_results';
import { RelistenObjectRequiredProperties } from './relisten_object';
import { RelistenApiUpdatableObject, Repository } from './repository';
import { useRealm } from './schema';

const defaultNetworkLoadingValue = (
  fetchStrategy: NetworkBackedBehaviorFetchStrategy,
  dataExists: boolean
) => {
  return fetchStrategy === NetworkBackedBehaviorFetchStrategy.NetworkAlwaysFirst || !dataExists;
};

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

export class NetworkBackedBehaviorExecutor<TLocalData, TApiData> {
  public isNetworkLoading: boolean;

  constructor(
    public readonly behavior: NetworkBackedBehavior<TLocalData, TApiData>,
    private api: RelistenApiClient,
    private realm: Realm
  ) {}
}

export function useNetworkBackedBehavior<TLocalData, TApiData>(
  behavior: NetworkBackedBehavior<TLocalData, TApiData>
): NetworkBackedResults<TLocalData> {
  const realm = useRealm();
  const localData = behavior.useFetchFromLocal();
  const api = useRelistenApi();
  const dataExists = behavior.isLocalDataShowable(localData);
  const [error, setError] = useState<RelistenApiClientError | undefined>();

  // if data doesn't exist, initialize the loading state
  const [isNetworkLoading, setIsNetworkLoading] = useState(
    defaultNetworkLoadingValue(behavior.fetchStrategy, dataExists)
  );

  const refresh = useCallback(
    async (shouldForceLoadingSpinner: boolean) => {
      if (shouldForceLoadingSpinner) {
        setIsNetworkLoading(true);
      }
      const apiData = await behavior.fetchFromApi(api.apiClient, shouldForceLoadingSpinner);

      if (apiData?.type == RelistenApiResponseType.OnlineRequestCompleted) {
        if (apiData?.data) {
          behavior.upsert(realm, localData, apiData.data);
        }

        if (apiData?.error) {
          setError(apiData?.error);
        }
      }

      setIsNetworkLoading(false);
    },
    [setIsNetworkLoading, localData, behavior, setError]
  );

  const results = useMemo<NetworkBackedResults<TLocalData>>(() => {
    return {
      isNetworkLoading,
      data: localData,
      // if were pull-to-refreshing, always show the spinner
      refresh: (force = false) => refresh(force),
      errors: error ? [error] : undefined,
    };
  }, [isNetworkLoading, localData, refresh, error]);

  useEffect(() => {
    // if data doesn't exist, show the loading spinner. purposely not putting dataExists in the deps chart.
    refresh(defaultNetworkLoadingValue(behavior.fetchStrategy, dataExists));
  }, [behavior]);

  return results;
}

export function createNetworkBackedModelArrayHook<
  TModel extends RequiredProperties & RequiredRelationships,
  TApi extends RelistenApiUpdatableObject,
  RequiredProperties extends RelistenObjectRequiredProperties,
  RequiredRelationships extends object,
>(
  repo: Repository<TModel, TApi, RequiredProperties, RequiredRelationships>,
  fetchFromRealm: () => Realm.Results<TModel>,
  fetchFromApi: (
    api: RelistenApiClient,
    forcedRefresh: boolean
  ) => Promise<RelistenApiResponse<TApi[]>>
): (options?: NetworkBackedBehaviorOptions) => NetworkBackedResults<Realm.Results<TModel>> {
  return (options) => {
    const behavior = useMemo(() => {
      return new NetworkBackedModelArrayBehavior(repo, fetchFromRealm, fetchFromApi, options);
    }, [options]);

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
  fetchFromApi: (
    api: RelistenApiClient,
    forcedRefresh: boolean
  ) => Promise<RelistenApiResponse<TApi>>
): (options?: NetworkBackedBehaviorOptions) => NetworkBackedResults<TModel | null> {
  return (options) => {
    const behavior = useMemo(() => {
      return new NetworkBackedModelBehavior(repo, fetchFromRealm, fetchFromApi, options);
    }, [options]);

    return useNetworkBackedBehavior(behavior);
  };
}
