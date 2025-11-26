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
  /** Check if currently in cooldown */
  isInCooldown: () => boolean;
  /** Reset the rate limiter */
  reset: () => void;
}

/**
 * A hook that enforces rate limiting with a sliding window and per-call cooldown.
 * 
 * Example: useRateLimit({ windowMs: 3000, maxCalls: 5, cooldownMs: 1000 })
 * - Allows up to 5 calls within any 3-second window
 * - Enforces at least 1 second between consecutive calls
 * - If either limit is exceeded, tryCall() returns false
 */
export function useRateLimit(options: RateLimitOptions = {}): RateLimitResult {
  const { windowMs = 10000, maxCalls = 5, cooldownMs = 1000 } = options; // 五秒2次，冷却1秒
  
  const timestamps = useRef<number[]>([]);
  const lastCallTime = useRef<number>(0);

  const cleanupOldTimestamps = useCallback(() => {
    const now = Date.now();
    timestamps.current = timestamps.current.filter(t => now - t <= windowMs);
  }, [windowMs]);

  const tryCall = useCallback((): boolean => {
    const now = Date.now();
    
    // Check cooldown first
    if (lastCallTime.current && now - lastCallTime.current < cooldownMs) {
      return false;
    }

    // Clean up old timestamps outside the window
    cleanupOldTimestamps();

    // Check if we've exceeded max calls in window
    if (timestamps.current.length >= maxCalls) {
      return false;
    }

    // Record this call
    timestamps.current.push(now);
    lastCallTime.current = now;
    return true;
  }, [maxCalls, cooldownMs, cleanupOldTimestamps]);

  const getRemainingCalls = useCallback((): number => {
    cleanupOldTimestamps();
    return Math.max(0, maxCalls - timestamps.current.length);
  }, [maxCalls, cleanupOldTimestamps]);

  const isInCooldown = useCallback((): boolean => {
    if (!lastCallTime.current) return false;
    return Date.now() - lastCallTime.current < cooldownMs;
  }, [cooldownMs]);

  const reset = useCallback(() => {
    timestamps.current = [];
    lastCallTime.current = 0;
  }, []);

  return { tryCall, getRemainingCalls, isInCooldown, reset };
}
