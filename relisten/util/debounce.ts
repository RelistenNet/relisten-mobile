import { useLayoutEffect, useMemo, useRef } from 'react';

export function useDebounce<T>(callback: (arg: T) => void, delay: number) {
  const callbackRef = useRef(callback);
  const timerRef = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    callbackRef.current = callback;
  });

  const naiveDebounce = (func: (arg: T) => void, delayMs: number, arg: T) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      func(arg);
    }, delayMs) as unknown as number;
  };

  return useMemo(() => (arg: T) => naiveDebounce(callbackRef.current, delay, arg), [delay]);
}
