import { useEffect, useState } from 'react';

export function useRenderAfterInteractions(): boolean {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const task = requestIdleCallback(() => {
      if (!cancelled) {
        setShouldRender(true);
      }
    });

    return () => {
      cancelled = true;
      cancelIdleCallback(task);
    };
  }, []);

  return shouldRender;
}
