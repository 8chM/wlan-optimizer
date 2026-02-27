/**
 * Debounce utility - delays function execution until after
 * a specified wait time has elapsed since the last invocation.
 *
 * @param fn - The function to debounce
 * @param waitMs - Delay in milliseconds
 * @returns A debounced wrapper with a cancel() method
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  waitMs: number,
): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const debounced = ((...args: Parameters<T>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
    }, waitMs);
  }) as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced;
}

/**
 * Throttle utility - ensures a function is called at most once
 * per specified interval.
 *
 * @param fn - The function to throttle
 * @param intervalMs - Minimum interval between calls
 * @returns A throttled wrapper
 */
export function throttle<T extends (...args: Parameters<T>) => void>(
  fn: T,
  intervalMs: number,
): T {
  let lastCallTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return ((...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;

    if (timeSinceLastCall >= intervalMs) {
      lastCallTime = now;
      fn(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCallTime = Date.now();
        timeoutId = null;
        fn(...args);
      }, intervalMs - timeSinceLastCall);
    }
  }) as T;
}
