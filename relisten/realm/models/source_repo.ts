import { useRelistenApi } from '@/relisten/api/context';
import { SourceReviewResource } from '@/relisten/api/catalog/resources';
import { useNetworkOnlyResults } from '@/relisten/realm/network_backed_behavior_hooks';
import { NetworkBackedResults } from '@/relisten/realm/network_backed_results';
import { useCallback } from 'react';

export function useSourceReviews(
  sourceUuid: string
): NetworkBackedResults<SourceReviewResource[] | undefined> {
  const { apiClient } = useRelistenApi();

  const apiCall = useCallback(() => {
    return apiClient.sourceReviews(sourceUuid);
  }, [apiClient, sourceUuid]);

  return useNetworkOnlyResults(apiCall);
}
