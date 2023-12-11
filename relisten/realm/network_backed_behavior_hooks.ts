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
  const [lastRequestAt, setLastRequestAt] = useState<dayjs.Dayjs | undefined>(undefined);

  const refresh = async () => {
    setIsNetworkLoading(true);
    const apiData = await behavior.fetchFromApi(api.apiClient);
    setLastRequestAt(dayjs());
    setIsNetworkLoading(false);

    const localDataShowable = behavior.isLocalDataShowable(localData);

    setShouldShowLoadingIndicator(!localDataShowable);

    if (apiData?.type == RelistenApiResponseType.OnlineRequestCompleted) {
      if (apiData?.data) {
        behavior.upsert(realm, localData, apiData.data);
        setShouldShowLoadingIndicator(false);
      }
    }
  };

  const { results, setIsNetworkLoading, setShouldShowLoadingIndicator } =
    useNetworkBackedResults<TLocalData>(
      localData,
      !behavior.isLocalDataShowable(localData),
      refresh
    );

  const shouldPerformNetworkRequest = behavior.shouldPerformNetworkRequest(
    lastRequestAt,
    localData
  );

  useEffect(() => {
    if (shouldPerformNetworkRequest) {
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
