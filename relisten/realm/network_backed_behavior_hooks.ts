import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RelistenApiClientError, RelistenApiResponse } from '../api/client';
import { useRelistenApi } from '../api/context';
import { NetworkBackedBehavior } from './network_backed_behavior';
import { NetworkBackedResults } from './network_backed_results';

/** Network-only data is scoped to the current request and never reconstructed from Realm. */
export function useNetworkOnlyResults<TApiData>(
  fetchFromNetwork: (force?: boolean) => Promise<RelistenApiResponse<TApiData | undefined>>
): NetworkBackedResults<TApiData | undefined> {
  const generation = useRef(0);
  const [state, setState] = useState<{
    request: typeof fetchFromNetwork;
    data?: TApiData;
    errors?: RelistenApiClientError[];
    isNetworkLoading: boolean;
  }>({ request: fetchFromNetwork, isNetworkLoading: true });

  const refresh = useCallback(
    (force = true) => {
      const current = ++generation.current;
      setState((state) => ({
        ...state,
        request: fetchFromNetwork,
        data: state.request === fetchFromNetwork ? state.data : undefined,
        isNetworkLoading: true,
      }));
      return Promise.resolve()
        .then(async () => {
          let response = await fetchFromNetwork(force);
          // Another screen can force a newer request for this same resource.
          // Join that request so this screen also receives its online selection.
          while (response.superseded && generation.current === current) {
            response = await fetchFromNetwork(false);
          }
          return response;
        })
        .then(
          (response) => {
            if (generation.current !== current || response.superseded) return;
            setState({
              request: fetchFromNetwork,
              data: response.data,
              errors: response.error ? [response.error] : undefined,
              isNetworkLoading: false,
            });
          },
          (error: unknown) => {
            if (generation.current !== current) return;
            const cause = error instanceof Error ? error : new Error(String(error));
            setState({
              request: fetchFromNetwork,
              errors: [{ error: cause, message: cause.message }],
              isNetworkLoading: false,
            });
          }
        );
    },
    [fetchFromNetwork]
  );

  useEffect(() => {
    void refresh(false);
    return () => {
      generation.current += 1;
    };
  }, [refresh]);

  if (state.request !== fetchFromNetwork)
    return { data: undefined, isNetworkLoading: true, refresh };
  return {
    data: state.data,
    errors: state.errors,
    isNetworkLoading: state.isNetworkLoading,
    refresh,
  };
}

export function useNetworkBackedBehavior<TLocalData, TApiData>(
  behavior: NetworkBackedBehavior<TLocalData, TApiData>
): NetworkBackedResults<TLocalData> {
  const { apiClient } = useRelistenApi();
  const executor = useMemo(() => behavior.sharedExecutor(apiClient), [behavior, apiClient]);
  // This state is intentionally keyed by executor identity, not just by results.
  // When a route param changes we can build a new behavior/executor immediately,
  // but React will otherwise keep rendering the previous executor's Realm-backed
  // results until the new effect subscribes and emits. Under Fabric/Hermes that
  // stale handoff window was enough to diff invalid managed objects from the
  // previous screen while the next query/upsert was already running.
  const [state, setState] = useState(() => ({
    executor,
    results: executor.currentResults(),
  }));

  // If render has already moved to a different executor, prefer its current
  // snapshot immediately instead of waiting for the effect below to commit.
  const results = state.executor === executor ? state.results : executor.currentResults();

  useEffect(() => {
    // This setState is deliberate: it closes the executor transition window as
    // soon as the new executor becomes active so React stops rendering Realm
    // objects owned by the previous behavior.
    setState({
      executor,
      results: executor.currentResults(),
    });

    const output = executor.start();
    const tearDownListener = output.addListener((newResults) => {
      setState((currentState) => {
        // Ignore late emissions from an executor that has already been replaced.
        if (currentState.executor !== executor) {
          return currentState;
        }

        return {
          executor,
          results: newResults,
        };
      });
    });

    return () => {
      tearDownListener();
      executor.tearDown();
    };
  }, [executor]);

  return results;
}
