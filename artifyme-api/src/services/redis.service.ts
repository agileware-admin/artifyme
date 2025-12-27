import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Main Redis client for general operations
export const redisClient = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    // backoff simples (ms)
    const delay = Math.min(times * 200, 2000);
    return delay;
  },
});

// Separate client for subscriptions (Redis requires separate connections for pub/sub)
export const redisSubscriber = new Redis(REDIS_URL);

// Publisher client
export const redisPublisher = new Redis(REDIS_URL);

// ===========================================
// Connection Management
// ===========================================
export async function connectRedis(): Promise<void> {
  const optional = process.env.REDIS_OPTIONAL === "true" || process.env.NODE_ENV !== "production";

  // não deixar o boot travar pra sempre
  const timeoutMs = Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 3000);

  return new Promise((resolve, reject) => {
    let done = false;

    const finishOk = () => {
      if (done) return;
      done = true;
      cleanup();
      resolve();
    };

    const finishFail = (err: any) => {
      if (done) return;
      done = true;
      cleanup();
      if (optional) {
        console.warn("⚠️ Redis indisponível. Subindo API sem Redis (dev).", err?.message || err);
        resolve();
      } else {
        reject(err);
      }
    };

    const onReady = () => {
      console.log("✅ Redis ready");
      finishOk();
    };

    const onError = (err: any) => {
      console.error("❌ Redis error:", err?.message || err);
      finishFail(err);
    };

    const cleanup = () => {
      redisClient.off("ready", onReady);
      redisClient.off("error", onError);
    };

    redisClient.on("ready", onReady);
    redisClient.on("error", onError);

    // Timeout: se não conectou nem errou, segue (dev) ou falha (prod)
    setTimeout(() => {
      finishFail(new Error("Redis connect timeout"));
    }, timeoutMs);
  });
}


// ===========================================
// Cache Operations
// ===========================================
export async function setCache(
  key: string,
  value: unknown,
  expireSeconds?: number
): Promise<void> {
  const serialized = JSON.stringify(value);
  if (expireSeconds) {
    await redisClient.setex(key, expireSeconds, serialized);
  } else {
    await redisClient.set(key, serialized);
  }
}

export async function getCache<T>(key: string): Promise<T | null> {
  const data = await redisClient.get(key);
  if (!data) return null;
  return JSON.parse(data) as T;
}

export async function deleteCache(key: string): Promise<void> {
  await redisClient.del(key);
}

export async function clearCachePattern(pattern: string): Promise<void> {
  const keys = await redisClient.keys(pattern);
  if (keys.length > 0) {
    await redisClient.del(...keys);
  }
}

// ===========================================
// Pub/Sub Operations
// ===========================================
export async function publishEvent(channel: string, data: unknown): Promise<void> {
  await redisPublisher.publish(channel, JSON.stringify(data));
}

// ===========================================
// Rate Limiting
// ===========================================
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const current = await redisClient.incr(key);
  
  if (current === 1) {
    await redisClient.expire(key, windowSeconds);
  }
  
  const ttl = await redisClient.ttl(key);
  const resetAt = Date.now() + ttl * 1000;
  
  return {
    allowed: current <= maxRequests,
    remaining: Math.max(0, maxRequests - current),
    resetAt,
  };
}

// ===========================================
// Session/Token Storage
// ===========================================
export async function storeSession(
  sessionId: string,
  data: unknown,
  expireSeconds: number = 86400 // 24 hours default
): Promise<void> {
  await setCache(`session:${sessionId}`, data, expireSeconds);
}

export async function getSession<T>(sessionId: string): Promise<T | null> {
  return getCache<T>(`session:${sessionId}`);
}

export async function deleteSession(sessionId: string): Promise<void> {
  await deleteCache(`session:${sessionId}`);
}

// ===========================================
// Transformation Job Queue
// ===========================================
export async function addTransformationJob(job: {
  id: string;
  userId: string;
  imageUrl: string;
  style: string;
}): Promise<void> {
  await redisClient.lpush('transformation:queue', JSON.stringify(job));
  await setCache(`transformation:${job.id}`, { status: 'pending', ...job }, 3600);
}

export async function updateTransformationStatus(
  jobId: string,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  result?: { outputUrl?: string; error?: string }
): Promise<void> {
  const existing = await getCache<{ userId: string }>(`transformation:${jobId}`);
  if (existing) {
    await setCache(`transformation:${jobId}`, { ...existing, status, ...result }, 3600);
    
    // Publish event for WebSocket notification
    await publishEvent('transformation:complete', {
      jobId,
      userId: existing.userId,
      status,
      ...result,
    });
  }
}

export async function getTransformationStatus(jobId: string): Promise<{
  status: string;
  outputUrl?: string;
  error?: string;
} | null> {
  return getCache(`transformation:${jobId}`);
}
