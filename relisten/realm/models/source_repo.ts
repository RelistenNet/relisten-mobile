import { Repository } from '../repository';
import { Source } from './source';
import { useNetworkOnlyResults } from '@/relisten/realm/network_backed_behavior_hooks';
import { useCallback } from 'react';
import { useRelistenApi } from '@/relisten/api/context';
import { NetworkBackedResults } from '@/relisten/realm/network_backed_results';
import { SourceReview } from '@/relisten/api/models/source';
import { RelistenApiResponse } from '@/relisten/api/client';

export const sourceRepo = new Repository(Source);

export function useSourceReviews(
  sourceUuid: string
): NetworkBackedResults<SourceReview[] | undefined> {
  const { apiClient } = useRelistenApi();

  const apiCall = useCallback(() => {
    // bypass because we have no local data for reviews and always need the results
    return apiClient.sourceReviews(sourceUuid, { bypassEtagCaching: true, bypassRateLimit: true });
  }, [apiClient, sourceUuid]);

  return useNetworkOnlyResults(apiCall);
}

// TODO: add endpoint to Relisten to fetch a FullShow by the source id
