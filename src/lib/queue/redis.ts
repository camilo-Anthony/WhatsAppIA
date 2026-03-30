/**
 * Redis Connection — Shared singleton for BullMQ queues.
 * Uses the IORedis version bundled with BullMQ to avoid version conflicts.
 */

import IORedis from "ioredis"

const globalForRedis = globalThis as unknown as {
    redisConnection: IORedis | undefined
}

function createRedisConnection(): IORedis {
    const url = process.env.REDIS_URL || "redis://localhost:6379"

    const connection = new IORedis(url, {
        maxRetriesPerRequest: null, // Required by BullMQ
        enableReadyCheck: false,
        retryStrategy(times: number) {
            const delay = Math.min(times * 50, 2000)
            return delay
        },
    })

    connection.on("error", (err) => {
        console.error("[Redis] Error de conexión:", err.message)
    })

    connection.on("connect", () => {
        console.log("[Redis] Conectado exitosamente")
    })

    return connection
}

export const redis = globalForRedis.redisConnection ?? createRedisConnection()

if (process.env.NODE_ENV !== "production") globalForRedis.redisConnection = redis

/**
 * Returns a Redis connection config object for use with BullMQ Queue/Worker constructors.
 * This avoids the IORedis version mismatch between separate ioredis and bullmq's bundled version.
 */
export function getRedisConfig() {
    const url = process.env.REDIS_URL || "redis://localhost:6379"
    const parsed = new URL(url)

    return {
        host: parsed.hostname || "localhost",
        port: parseInt(parsed.port || "6379", 10),
        password: parsed.password || undefined,
        maxRetriesPerRequest: null as null,
    }
}
