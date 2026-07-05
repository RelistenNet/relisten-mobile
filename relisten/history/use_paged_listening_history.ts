import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { useQuery } from '@/relisten/realm/schema';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const LISTENING_HISTORY_PAGE_SIZE = 100;

export type PagedListeningHistory = {
  entries: readonly PlaybackHistoryEntry[];
  hasMore: boolean;
  loadMore: () => void;
  totalCount: number;
};

export function usePagedListeningHistory(
  pageSize = LISTENING_HISTORY_PAGE_SIZE
): PagedListeningHistory {
  const results = useQuery(
    {
      type: PlaybackHistoryEntry,
      query: (query) => query.sorted('playbackStartedAt', true),
    },
    []
  );
  const [visibleLimit, setVisibleLimit] = useState(pageSize);
  const loadRequested = useRef(false);
  const totalCount = results.length;
  const visibleCount = Math.min(visibleLimit, totalCount);

  useEffect(() => {
    loadRequested.current = false;
  }, [totalCount, visibleCount]);

  const loadMore = useCallback(() => {
    if (loadRequested.current || visibleLimit >= totalCount) {
      return;
    }

    loadRequested.current = true;
    setVisibleLimit((current) => Math.min(current + pageSize, totalCount));
  }, [pageSize, totalCount, visibleLimit]);

  const entries = useMemo(
    () => results.slice(0, visibleCount),
    [results, totalCount, visibleCount]
  );

  return {
    entries,
    hasMore: visibleCount < totalCount,
    loadMore,
    totalCount,
  };
}
