import { useMemo, type RefObject } from 'react';

type QueueList = {
  scrollToIndex: (options: { index: number; animated: boolean; viewPosition: number }) => void;
  scrollToOffset: (options: { offset: number; animated: boolean }) => void;
};

export function usePlayerQueueAnchor(list: RefObject<QueueList | null>) {
  // The getter reads the ref only from later scroll/layout events, never during construction.
  return useMemo(() => createPlayerQueueAnchor(() => list.current), [list]);
}

/** One anchor request owns its initial attempt, three retries, and pending work. */
export function createPlayerQueueAnchor(getList: () => QueueList | null) {
  let request: { index: number; attempts: number } | undefined;
  let frame: ReturnType<typeof requestAnimationFrame> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    request = undefined;
    if (frame !== undefined) cancelAnimationFrame(frame);
    if (timer !== undefined) clearTimeout(timer);
    frame = undefined;
    timer = undefined;
  };
  const attempt = () => {
    const list = getList();
    if (!request || !list) return;
    if (request.attempts >= 4) {
      cancel();
      return;
    }
    request.attempts += 1;
    list.scrollToIndex({ index: request.index, animated: false, viewPosition: 0 });
  };
  const retry = (delay: number) => {
    if (!request || frame !== undefined || timer !== undefined) return;
    if (request.attempts >= 4) {
      cancel();
      return;
    }
    const owner = request;
    if (delay > 0) {
      timer = setTimeout(() => {
        if (request !== owner) return;
        timer = undefined;
        attempt();
      }, delay);
    } else {
      frame = requestAnimationFrame(() => {
        if (request !== owner) return;
        frame = undefined;
        attempt();
      });
    }
  };

  return {
    start(index: number) {
      cancel();
      request = { index, attempts: 0 };
      attempt();
    },
    retryAfterLayout() {
      retry(0);
    },
    onFailure({ index, averageItemLength }: { index: number; averageItemLength: number }) {
      if (request?.index !== index) return;
      getList()?.scrollToOffset({ offset: averageItemLength * index, animated: false });
      retry(60);
    },
    onVisibleIndex(index: number | null | undefined) {
      if (request?.index === index) cancel();
    },
    cancel,
  };
}
