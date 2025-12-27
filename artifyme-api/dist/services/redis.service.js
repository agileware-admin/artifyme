"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisPublisher = exports.redisSubscriber = exports.redisClient = void 0;
exports.connectRedis = connectRedis;
exports.setCache = setCache;
exports.getCache = getCache;
exports.deleteCache = deleteCache;
exports.clearCachePattern = clearCachePattern;
exports.publishEvent = publishEvent;
exports.checkRateLimit = checkRateLimit;
exports.storeSession = storeSession;
exports.getSession = getSession;
exports.deleteSession = deleteSession;
exports.addTransformationJob = addTransformationJob;
exports.updateTransformationStatus = updateTransformationStatus;
exports.getTransformationStatus = getTransformationStatus;
const ioredis_1 = __importDefault(require("ioredis"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
// Main Redis client for general operations
exports.redisClient = new ioredis_1.default(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
});
// Separate client for subscriptions (Redis requires separate connections for pub/sub)
exports.redisSubscriber = new ioredis_1.default(REDIS_URL);
// Publisher client
exports.redisPublisher = new ioredis_1.default(REDIS_URL);
// ===========================================
// Connection Management
// ===========================================
async function connectRedis() {
    return new Promise((resolve, reject) => {
        exports.redisClient.on('connect', () => {
            console.log('📡 Redis client connected');
            resolve();
        });
        exports.redisClient.on('error', (error) => {
            console.error('❌ Redis connection error:', error);
            reject(error);
        });
    });
}
// ===========================================
// Cache Operations
// ===========================================
async function setCache(key, value, expireSeconds) {
    const serialized = JSON.stringify(value);
    if (expireSeconds) {
        await exports.redisClient.setex(key, expireSeconds, serialized);
    }
    else {
        await exports.redisClient.set(key, serialized);
    }
}
async function getCache(key) {
    const data = await exports.redisClient.get(key);
    if (!data)
        return null;
    return JSON.parse(data);
}
async function deleteCache(key) {
    await exports.redisClient.del(key);
}
async function clearCachePattern(pattern) {
    const keys = await exports.redisClient.keys(pattern);
    if (keys.length > 0) {
        await exports.redisClient.del(...keys);
    }
}
// ===========================================
// Pub/Sub Operations
// ===========================================
async function publishEvent(channel, data) {
    await exports.redisPublisher.publish(channel, JSON.stringify(data));
}
// ===========================================
// Rate Limiting
// ===========================================
async function checkRateLimit(key, maxRequests, windowSeconds) {
    const current = await exports.redisClient.incr(key);
    if (current === 1) {
        await exports.redisClient.expire(key, windowSeconds);
    }
    const ttl = await exports.redisClient.ttl(key);
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
async function storeSession(sessionId, data, expireSeconds = 86400 // 24 hours default
) {
    await setCache(`session:${sessionId}`, data, expireSeconds);
}
async function getSession(sessionId) {
    return getCache(`session:${sessionId}`);
}
async function deleteSession(sessionId) {
    await deleteCache(`session:${sessionId}`);
}
// ===========================================
// Transformation Job Queue
// ===========================================
async function addTransformationJob(job) {
    await exports.redisClient.lpush('transformation:queue', JSON.stringify(job));
    await setCache(`transformation:${job.id}`, { status: 'pending', ...job }, 3600);
}
async function updateTransformationStatus(jobId, status, result) {
    const existing = await getCache(`transformation:${jobId}`);
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
async function getTransformationStatus(jobId) {
    return getCache(`transformation:${jobId}`);
}
//# sourceMappingURL=redis.service.js.map