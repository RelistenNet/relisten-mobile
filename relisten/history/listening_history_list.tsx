import {
  RelistenSectionList,
  type RelistenSectionData,
  type RelistenSectionListProps,
} from '@/relisten/components/relisten_section_list';
import { ListeningHistoryRow } from '@/relisten/history/listening_history_row';
import { type PagedListeningHistory } from '@/relisten/history/use_paged_listening_history';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { type ListRenderItem } from '@shopify/flash-list';
import dayjs from 'dayjs';
import { type ReactElement, useCallback, useMemo } from 'react';

type ListeningHistoryListProps = Omit<
  RelistenSectionListProps<PlaybackHistoryEntry>,
  'data' | 'onEndReached' | 'renderItem'
> & {
  history: PagedListeningHistory;
  onViewShow: (entry: PlaybackHistoryEntry) => void;
};

export function ListeningHistoryList({
  history,
  onViewShow,
  stickySectionHeadersEnabled = true,
  ...props
}: ListeningHistoryListProps) {
  const sections = useMemo<RelistenSectionData<PlaybackHistoryEntry>>(() => {
    const byDate = new Map<string, PlaybackHistoryEntry[]>();

    for (const entry of history.entries) {
      const date = dayjs(entry.playbackStartedAt).format('LL');
      const entries = byDate.get(date);
      if (entries) {
        entries.push(entry);
      } else {
        byDate.set(date, [entry]);
      }
    }

    return [...byDate].map(([date, entries]) => {
      const totalDuration = entries.reduce(
        (total, entry) => total + (entry.sourceTrack.duration || 0),
        0
      );
      return {
        sectionKey: date,
        sectionTitle: `${date} · ${dayjs.duration(totalDuration, 'seconds').humanize()}`,
        data: entries,
      };
    });
  }, [history.entries]);

  const renderItem = useCallback(
    ({ item }: Parameters<ListRenderItem<PlaybackHistoryEntry>>[0]): ReactElement => (
      <ListeningHistoryRow entry={item} onViewShow={onViewShow} />
    ),
    [onViewShow]
  );

  return (
    <RelistenSectionList
      {...props}
      data={sections}
      onEndReached={history.hasMore ? history.loadMore : undefined}
      onEndReachedThreshold={0.4}
      renderItem={renderItem}
      stickySectionHeadersEnabled={stickySectionHeadersEnabled}
    />
  );
}
