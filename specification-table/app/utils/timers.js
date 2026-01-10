/**
 * Timer utilities with automatic cleanup
 * Prevents memory leaks from setTimeout/setInterval
 */

import { useEffect, useRef } from "react";

/**
 * Hook pentru setTimeout cu cleanup automat
 * 
 * @example
 * useTimeout(() => {
 *   console.log('Executed after 1 second');
 * }, 1000);
 */
export function useTimeout(callback, delay) {
  const timeoutRef = useRef(null);
  const callbackRef = useRef(callback);

  // Update callback ref when it changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null || delay === undefined) {
      return;
    }

    timeoutRef.current = setTimeout(() => {
      callbackRef.current();
    }, delay);

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [delay]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
}

/**
 * Hook pentru setInterval cu cleanup automat
 * 
 * @example
 * useInterval(() => {
 *   console.log('Executed every 1 second');
 * }, 1000);
 */
export function useInterval(callback, delay) {
  const intervalRef = useRef(null);
  const callbackRef = useRef(callback);

  // Update callback ref when it changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null || delay === undefined) {
      return;
    }

    intervalRef.current = setInterval(() => {
      callbackRef.current();
    }, delay);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [delay]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);
}

/**
 * Hook pentru multiple timers cu cleanup automat
 * 
 * @example
 * useTimers([
 *   { type: 'timeout', callback: () => console.log('1'), delay: 1000 },
 *   { type: 'interval', callback: () => console.log('2'), delay: 2000 },
 * ]);
 */
export function useTimers(timers) {
  const timerRefs = useRef([]);

  useEffect(() => {
    timerRefs.current = timers.map(({ type, callback, delay }) => {
      if (delay === null || delay === undefined) {
        return null;
      }

      if (type === 'timeout') {
        return setTimeout(callback, delay);
      } else if (type === 'interval') {
        return setInterval(callback, delay);
      }
      return null;
    }).filter(Boolean);

    // Cleanup
    return () => {
      timerRefs.current.forEach(timer => {
        if (timer) {
          if (typeof timer === 'number') {
            clearTimeout(timer);
            clearInterval(timer);
          }
        }
      });
      timerRefs.current = [];
    };
  }, [timers]);
}

/**
 * Server-side timer utility (pentru Node.js)
 * Returnează o funcție de cleanup
 * 
 * @example
 * const cleanup = createServerTimeout(() => {
 *   console.log('Executed after 1 second');
 * }, 1000);
 * // ... later
 * cleanup();
 */
export function createServerTimeout(callback, delay) {
  const timeout = setTimeout(callback, delay);
  return () => {
    clearTimeout(timeout);
  };
}

/**
 * Server-side interval utility (pentru Node.js)
 * Returnează o funcție de cleanup
 * 
 * @example
 * const cleanup = createServerInterval(() => {
 *   console.log('Executed every 1 second');
 * }, 1000);
 * // ... later
 * cleanup();
 */
export function createServerInterval(callback, delay) {
  const interval = setInterval(callback, delay);
  return () => {
    clearInterval(interval);
  };
}

