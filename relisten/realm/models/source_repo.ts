import { useRelistenApi } from '@/relisten/api/context';
import { V4SourceReviewResource } from '@/relisten/api/v4/wire_types';
import { useNetworkOnlyResults } from '@/relisten/realm/network_backed_behavior_hooks';
import { NetworkBackedResults } from '@/relisten/realm/network_backed_results';
import { useCallback } from 'react';
import { Repository } from '../repository';
import { Source } from './source';

export const sourceRepo = new Repository(Source);

export function useSourceReviews(
  sourceUuid: string
): NetworkBackedResults<V4SourceReviewResource[] | undefined> {
  const { apiClient } = useRelistenApi();

  const apiCall = useCallback(() => {
    return apiClient.sourceReviews(sourceUuid);
  }, [apiClient, sourceUuid]);

  return useNetworkOnlyResults(apiCall);
}
