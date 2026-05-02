/**
 * Redis Connection — Shared singleton for BullMQ queues.
 * Supports TLS (Upstash) via rediss:// protocol.
 */

import IORedis from "ioredis"

const globalForRedis = globalThis as unknown as {
    redisConnection: IORedis | undefined
}

function parseRedisUrl() {
    const url = process.env.REDIS_URL || "redis://localhost:6379"
    const parsed = new URL(url)
    const useTls = parsed.protocol === "rediss:"

    return {
        host: parsed.hostname || "localhost",
        port: parseInt(parsed.port || "6379", 10),
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
        username: parsed.username || undefined,
        useTls,
    }
}

function createRedisConnection(): IORedis {
    const config = parseRedisUrl()

    console.log(`[Redis] Conectando a ${config.host}:${config.port} (TLS: ${config.useTls})`)

    const connection = new IORedis({
        host: config.host,
        port: config.port,
        password: config.password,
        username: config.username,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        ...(config.useTls ? { tls: {} } : {}),
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
 */
export function getRedisConfig() {
    const config = parseRedisUrl()

    return {
        host: config.host,
        port: config.port,
        password: config.password,
        username: config.username,
        maxRetriesPerRequest: null as null,
        ...(config.useTls ? { tls: {} } : {}),
    }
}

/**
 * Verifica si Redis está disponible sin lanzar excepciones.
 */
export async function isRedisAvailable(): Promise<boolean> {
    try {
        await redis.ping()
        return true
    } catch (err) {
        // Tratar errores de límite de Upstash como "no disponible"
        if (err instanceof Error && err.message.includes("limit exceeded")) {
            console.warn("[Redis] Límite de solicitudes excedido (Upstash)")
        }
        return false
    }
}
