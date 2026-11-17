import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A callback whose identity never changes but which always runs the latest
 * version of `fn`. Native header items (Stack.Toolbar) are set again whenever
 * a handler's identity changes, and on iOS 26 that redraws the whole bar,
 * back button included; stable handlers leave the header alone.
 */
export function useStableCallback<Args extends unknown[], Result>(
  fn: (...args: Args) => Result
): (...args: Args) => Result {
  const latest = useRef(fn);
  useLayoutEffect(() => {
    latest.current = fn;
  });
  return useCallback((...args: Args) => latest.current(...args), []);
}
