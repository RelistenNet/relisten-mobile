import { Repository } from '../repository';
import { Source } from './source';
import { useNetworkOnlyResults } from '@/relisten/realm/network_backed_behavior_hooks';
import { useCallback } from 'react';
import { useRelistenApi } from '@/relisten/api/context';

export const sourceRepo = new Repository(Source);

export const useSourceReviews = (sourceUuid: string) => {
  const { apiClient } = useRelistenApi();

  const apiCall = useCallback(() => {
    // bypass because we have no local data for reviews and always need the results
    return apiClient.sourceReviews(sourceUuid, { bypassEtagCaching: true, bypassRateLimit: true });
  }, [apiClient, sourceUuid]);

  return useNetworkOnlyResults(apiCall);
};

// TODO: add endpoint to Relisten to fetch a FullShow by the source id
