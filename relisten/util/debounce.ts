import { useLayoutEffect, useMemo, useRef } from 'react';

export function useDebounce<T>(callback: (arg: T) => void, delay: number) {
  const callbackRef = useRef(callback);

  useLayoutEffect(() => {
    callbackRef.current = callback;
  });

  let timer: number;

  const naiveDebounce = (func: (arg: T) => void, delayMs: number, arg: T) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func(arg);
    }, delayMs) as unknown as number;
  };

  return useMemo(() => (arg: T) => naiveDebounce(callbackRef.current, delay, arg), [delay]);
}
