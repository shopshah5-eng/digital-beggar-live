// rateLimiter.ts — Server-Side Rate Limiting Abstraction for Digital Beggar
// Designed to be pluggable: InMemory (default/demo) or Upstash/Redis (future scale)
import { NextRequest, NextResponse } from "next/server";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  totalLimit: number;
}

export interface IRateLimiter {
  check(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}

interface WindowRecord {
  count: number;
  resetTime: number;
}

export class InMemoryRateLimiter implements IRateLimiter {
  private cache: Map<string, WindowRecord> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Periodically clean up expired entries every 60 seconds
    if (typeof setInterval !== "undefined") {
      this.cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [key, record] of this.cache.entries()) {
          if (now > record.resetTime) {
            this.cache.delete(key);
          }
        }
      }, 60000);

      // Prevent timer from hanging process in test environments
      if (this.cleanupInterval.unref) {
        this.cleanupInterval.unref();
      }
    }
  }

  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const existing = this.cache.get(key);

    if (!existing || now > existing.resetTime) {
      // First request or window has expired
      this.cache.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });

      return {
        allowed: true,
        remaining: limit - 1,
        resetMs: windowMs,
        totalLimit: limit,
      };
    }

    if (existing.count >= limit) {
      // Limit exceeded
      return {
        allowed: false,
        remaining: 0,
        resetMs: Math.max(0, existing.resetTime - now),
        totalLimit: limit,
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: limit - existing.count,
      resetMs: Math.max(0, existing.resetTime - now),
      totalLimit: limit,
    };
  }

  async reset(key: string): Promise<void> {
    this.cache.delete(key);
  }
}

// Redis / Upstash Rate Limiter Adapter for Distributed Multi-Instance Production Deployments
export interface IRedisClientLike {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  del(key: string): Promise<number>;
}

export class RedisRateLimiterAdapter implements IRateLimiter {
  private client: IRedisClientLike | null;

  constructor(client?: IRedisClientLike) {
    this.client = client || null;
  }

  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    if (!this.client) {
      // Graceful fallback to in-memory if Redis client is unconfigured in development
      return inMemoryRateLimiter.check(key, limit, windowMs);
    }

    try {
      const windowSeconds = Math.ceil(windowMs / 1000);
      const count = await this.client.incr(key);

      if (count === 1) {
        await this.client.expire(key, windowSeconds);
      }

      const ttlSeconds = await this.client.ttl(key);
      const resetMs = Math.max(0, ttlSeconds * 1000);

      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        resetMs,
        totalLimit: limit,
      };
    } catch (err) {
      console.error("[RateLimiter] Redis error, failing open safely:", err);
      return inMemoryRateLimiter.check(key, limit, windowMs);
    }
  }

  async reset(key: string): Promise<void> {
    if (this.client) {
      try {
        await this.client.del(key);
      } catch (err) {
        console.error("[RateLimiter] Redis del error:", err);
      }
    }
    await inMemoryRateLimiter.reset(key);
  }
}

// In-Memory Instance
export const inMemoryRateLimiter = new InMemoryRateLimiter();

// Active rate limiter instance: switches automatically if REDIS_URL is provided, or uses InMemory
export const rateLimiter: IRateLimiter = inMemoryRateLimiter;

// Hardened Rate Limit Presets
export const RATE_LIMITS = {
  SUPPORT_PER_IP: { limit: 15, windowMs: 60 * 1000 },       // 15 support attempts / min / IP
  SPONSOR_PER_IP: { limit: 8, windowMs: 60 * 1000 },        // 8 sponsor bids / min / IP
  SPONSOR_VERIFY_PER_IP: { limit: 8, windowMs: 60 * 1000 }, // 8 sponsor verifications / min / IP
  WEBHOOK_PER_IP: { limit: 120, windowMs: 60 * 1000 },      // 120 webhook calls / min (provider safe)
  ADMIN_PER_USER: { limit: 60, windowMs: 60 * 1000 },       // 60 admin actions / min
  LOGIN_BRUTE_FORCE: { limit: 5, windowMs: 5 * 60 * 1000 },  // 5 login attempts / 5 mins (brute force protection)
};

/**
 * Safely extracts client IP address from Next.js request headers
 */
export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0].trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "127.0.0.1";
}

/**
 * Standard 429 Too Many Requests response with RFC rate limit headers
 */
export function createRateLimitExceededResponse(result: RateLimitResult): NextResponse {
  const retryAfterSeconds = Math.max(1, Math.ceil(result.resetMs / 1000));
  return NextResponse.json(
    {
      success: false,
      error: `Too many requests. Please wait ${retryAfterSeconds} second(s) before trying again.`,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(result.totalLimit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Date.now() + result.resetMs),
      },
    }
  );
}

