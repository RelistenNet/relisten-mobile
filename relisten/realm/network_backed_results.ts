import { useMemo } from 'react';

export interface NetworkBackedResults<T> {
  isNetworkLoading: boolean;
  data: T;

  refresh: () => void;
}

interface NetworkBackedResultsHook<T> {
  results: NetworkBackedResults<T>;
}

export type ExtractDataType<T> = T extends NetworkBackedResults<infer Return> ? Return : T;
export type ExtractHookDataType<T> = T extends NetworkBackedResultsHook<infer Return> ? Return : T;

export function mergeNetworkBackedResults<
  TResults extends {
    [Property in keyof TResults]: NetworkBackedResults<ExtractDataType<TResults[Property]>>;
  },
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
    isNetworkLoading: all.reduce((acc, n) => acc || n.isNetworkLoading, false),
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
  },
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
