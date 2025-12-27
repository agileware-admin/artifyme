import Redis from 'ioredis';
export declare const redisClient: Redis;
export declare const redisSubscriber: Redis;
export declare const redisPublisher: Redis;
export declare function connectRedis(): Promise<void>;
export declare function setCache(key: string, value: unknown, expireSeconds?: number): Promise<void>;
export declare function getCache<T>(key: string): Promise<T | null>;
export declare function deleteCache(key: string): Promise<void>;
export declare function clearCachePattern(pattern: string): Promise<void>;
export declare function publishEvent(channel: string, data: unknown): Promise<void>;
export declare function checkRateLimit(key: string, maxRequests: number, windowSeconds: number): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: number;
}>;
export declare function storeSession(sessionId: string, data: unknown, expireSeconds?: number): Promise<void>;
export declare function getSession<T>(sessionId: string): Promise<T | null>;
export declare function deleteSession(sessionId: string): Promise<void>;
export declare function addTransformationJob(job: {
    id: string;
    userId: string;
    imageUrl: string;
    style: string;
}): Promise<void>;
export declare function updateTransformationStatus(jobId: string, status: 'pending' | 'processing' | 'completed' | 'failed', result?: {
    outputUrl?: string;
    error?: string;
}): Promise<void>;
export declare function getTransformationStatus(jobId: string): Promise<{
    status: string;
    outputUrl?: string;
    error?: string;
} | null>;
//# sourceMappingURL=redis.service.d.ts.map