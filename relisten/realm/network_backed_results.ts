import React, { useCallback, useMemo, useState } from 'react';

export interface NetworkBackedResults<T> {
  shouldShowLoadingIndicator: boolean;
  isNetworkLoading: boolean;
  isStale: boolean | null;

  data: T;

  refresh: () => void;
}

export interface NetworkBackedResultsHook<T> {
  results: NetworkBackedResults<T>;
  setShouldShowLoadingIndicator: React.Dispatch<React.SetStateAction<boolean>>;
  setIsNetworkLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setIsStale: React.Dispatch<React.SetStateAction<boolean | null>>;
  setData: React.Dispatch<React.SetStateAction<T>>;

  performNetworkRequest: boolean;
  setPerformNetworkRequest: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useNetworkBackedResults<T>(
  initialData: T,
  shouldShowLoadingIndicatorDefault = false,
  isStaleDefault: boolean | null = null,
  performNetworkRequestDefault = true
): NetworkBackedResultsHook<T> {
  const [shouldShowLoadingIndicator, setShouldShowLoadingIndicator] = useState<boolean>(
    shouldShowLoadingIndicatorDefault
  );
  const [isNetworkLoading, setIsNetworkLoading] = useState(false);
  const [performNetworkRequest, setPerformNetworkRequest] = useState(performNetworkRequestDefault);
  const [isStale, setIsStale] = useState<boolean | null>(isStaleDefault);
  const [data, setData] = useState<T>(initialData);

  const refresh = useCallback(() => {
    if (!performNetworkRequest) {
      setPerformNetworkRequest(true);
    }
  }, [setPerformNetworkRequest]);

  const results = useMemo<NetworkBackedResults<T>>(() => {
    return {
      shouldShowLoadingIndicator,
      isNetworkLoading,
      isStale,
      data,
      refresh,
    };
  }, [shouldShowLoadingIndicator, isNetworkLoading, isStale, data]);

  return {
    results,
    performNetworkRequest,
    setShouldShowLoadingIndicator,
    setIsNetworkLoading,
    setIsStale,
    setData,
    setPerformNetworkRequest,
  };
}

export type ExtractDataType<T> = T extends NetworkBackedResults<infer Return> ? Return : T;
export type ExtractHookDataType<T> = T extends NetworkBackedResultsHook<infer Return> ? Return : T;

export function mergeNetworkBackedResults<
  TResults extends {
    [Property in keyof TResults]: NetworkBackedResults<ExtractDataType<TResults[Property]>>;
  }
>(
  results: TResults
): NetworkBackedResults<{
  [Property in keyof TResults]: ExtractDataType<TResults[Property]>;
}> {
  const all: Array<NetworkBackedResults<unknown>> = [];
  const r: { [Property in keyof TResults]?: ExtractDataType<TResults[Property]> } = {};

  for (const key of Object.keys(results) as Array<keyof TResults>) {
    all.push(results[key]);

    r[key] = results[key].data as ExtractDataType<TResults[typeof key]>;
  }

  return {
    shouldShowLoadingIndicator: all.reduce((acc, n) => acc || n.shouldShowLoadingIndicator, false),
    isNetworkLoading: all.reduce((acc, n) => acc || n.isNetworkLoading, false),
    isStale: all.reduce<boolean | null>((acc, n) => {
      if (n.isNetworkLoading !== null) {
        return acc || n.isNetworkLoading;
      }

      return null;
    }, null),
    data: r as {
      [Property in keyof TResults]: ExtractDataType<TResults[Property]>;
    },
    refresh() {
      for (const a of all) {
        a.refresh();
      }
    },
  };
}

export function useMergedNetworkBackedResults<
  TResults extends {
    [Property in keyof TResults]: NetworkBackedResultsHook<ExtractHookDataType<TResults[Property]>>;
  }
>(
  results: TResults
): NetworkBackedResults<{
  [Property in keyof TResults]: ExtractHookDataType<TResults[Property]>;
}> {
  const all: Array<NetworkBackedResults<unknown>> = [];
  const r: {
    [Property in keyof TResults]?: NetworkBackedResults<ExtractHookDataType<TResults[Property]>>;
  } = {};

  for (const key of Object.keys(results) as Array<keyof TResults>) {
    all.push(results[key].results);
    r[key] = results[key].results as NetworkBackedResults<
      ExtractHookDataType<TResults[typeof key]>
    >;
  }

  const merged: NetworkBackedResults<{
    [Property in keyof TResults]: Exclude<ExtractHookDataType<TResults[Property]>, unknown>;
  }> = useMemo(() => {
    return mergeNetworkBackedResults(
      r as unknown as {
        [Property in keyof TResults]: NetworkBackedResults<
          Exclude<ExtractHookDataType<TResults[Property]>, unknown>
        >;
      }
    );
  }, all);

  return merged;
}
