import { useCallback, useEffect, useRef } from "react";

/**
 * Returns a stable debounced version of `fn`. The latest `fn` is always used,
 * so callers don't need to memoize it. Cancels on unmount.
 */
export function useDebouncedCallback(fn, delay = 350) {
  const fnRef = useRef(fn);
  const timer = useRef(null);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return useCallback(
    (...args) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => fnRef.current(...args), delay);
    },
    [delay]
  );
}
