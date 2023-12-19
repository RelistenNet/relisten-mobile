import { useEffect, useMemo, useState } from 'react';
import Realm from 'realm';
import { RelistenApiClient, RelistenApiResponse, RelistenApiResponseType } from '../api/client';
import { useRelistenApi } from '../api/context';
import { log } from '../util/logging';
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

export function useNetworkBackedBehavior<TLocalData, TApiData>(
  behavior: NetworkBackedBehavior<TLocalData, TApiData>
): NetworkBackedResults<TLocalData> {
  const realm = useRealm();
  const localData = behavior.fetchFromLocal();
  const api = useRelistenApi();
  const dataExists = behavior.isLocalDataShowable(localData);

  // if data doesn't exist, initialize the loading state
  const [isNetworkLoading, setIsNetworkLoading] = useState(
    behavior.fetchStrategy === NetworkBackedBehaviorFetchStrategy.NetworkAlwaysFirst || !dataExists
  );

  const refresh = async (shouldForceLoadingSpinner: boolean) => {
    if (shouldForceLoadingSpinner) {
      setIsNetworkLoading(true);
    }
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
      // if were pull-to-refreshing, always show the spinner
      refresh: (force = true) => refresh(force),
    };
  }, [isNetworkLoading, localData]);

  useEffect(() => {
    log.info('Trying to perform network request on mount');
    // if data doesnt exist, show the loading spinner
    refresh(false);
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
  fetchFromApi: (api: RelistenApiClient) => Promise<RelistenApiResponse<TApi[]>>
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
  fetchFromApi: (api: RelistenApiClient) => Promise<RelistenApiResponse<TApi>>
): (options?: NetworkBackedBehaviorOptions) => NetworkBackedResults<TModel | null> {
  return (options) => {
    const behavior = useMemo(() => {
      return new NetworkBackedModelBehavior(repo, fetchFromRealm, fetchFromApi, options);
    }, [options]);

    return useNetworkBackedBehavior(behavior);
  };
}
