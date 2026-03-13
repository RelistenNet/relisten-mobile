import { useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';

export function useRenderAfterInteractions(): boolean {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const task = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) {
        setShouldRender(true);
      }
    });

    return () => {
      cancelled = true;
      if (typeof task?.cancel === 'function') {
        task.cancel();
      }
    };
  }, []);

  return shouldRender;
}
