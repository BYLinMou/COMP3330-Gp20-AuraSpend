import { useRef, useCallback } from 'react';

interface RateLimitOptions {
  /** Time window in milliseconds (default: 3000ms) */
  windowMs?: number;
  /** Maximum calls allowed within the window (default: 5) */
  maxCalls?: number;
  /** Minimum time between calls in milliseconds (default: 1000ms) */
  cooldownMs?: number;
}

interface RateLimitResult {
  /** Attempt to make a call. Returns true if allowed, false if rate-limited. */
  tryCall: () => boolean;
  /** Get remaining calls available in current window */
  getRemainingCalls: () => number;
  /** Get milliseconds remaining until the limit resets */
  getRemainingTime: () => number;
  /** Check if currently in cooldown */
  isInCooldown: () => boolean;
  /** Reset the rate limiter */
  reset: () => void;
}

/**
 * A hook that enforces rate limiting with a fixed window strategy.
 * The window starts when the first call is made.
 * 
 * Example: useRateLimit({ windowMs: 10000, maxCalls: 5 })
 * - Allows 5 calls. The window of 10s starts at the 1st call.
 * - If 5 calls are made in 4s, the user must wait the remaining 6s.
 * - After 10s from the 1st call, the window resets.
 */
export function useRateLimit(options: RateLimitOptions = {}): RateLimitResult {
  const { windowMs = 10000, maxCalls = 5, cooldownMs = 0 } = options;
  
  const windowStart = useRef<number>(0);
  const count = useRef<number>(0);
  const lastCallTime = useRef<number>(0);

  const tryCall = useCallback((): boolean => {
    const now = Date.now();
    
    // Check cooldown (inter-call delay)
    if (cooldownMs > 0 && lastCallTime.current && now - lastCallTime.current < cooldownMs) {
      return false;
    }

    // Check if window has expired, reset if so
    if (now - windowStart.current > windowMs) {
      windowStart.current = now;
      count.current = 0;
    }

    // Check if max calls reached in current window
    if (count.current >= maxCalls) {
      return false;
    }

    // Record this call
    count.current++;
    lastCallTime.current = now;
    return true;
  }, [windowMs, maxCalls, cooldownMs]);

  const getRemainingCalls = useCallback((): number => {
    const now = Date.now();
    if (now - windowStart.current > windowMs) {
      return maxCalls;
    }
    return Math.max(0, maxCalls - count.current);
  }, [windowMs, maxCalls]);

  const getRemainingTime = useCallback((): number => {
    const now = Date.now();
    if (now - windowStart.current > windowMs) {
      return 0;
    }
    return Math.max(0, windowMs - (now - windowStart.current));
  }, [windowMs]);

  const isInCooldown = useCallback((): boolean => {
    if (!lastCallTime.current) return false;
    return Date.now() - lastCallTime.current < cooldownMs;
  }, [cooldownMs]);

  const reset = useCallback(() => {
    windowStart.current = 0;
    count.current = 0;
    lastCallTime.current = 0;
  }, []);

  return { tryCall, getRemainingCalls, getRemainingTime, isInCooldown, reset };
}
