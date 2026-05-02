/**
 * Redis Connection — Shared singleton for BullMQ queues.
 * Supports TLS (Upstash) via rediss:// protocol.
 *
 * CIRCUIT BREAKER: Cuando Upstash excede el límite de requests,
 * desactiva Redis COMPLETAMENTE y deja de reintentar.
 * Todo el sistema cambia a modo emergencia (DB fallback).
 */

import IORedis from "ioredis"

// ==========================================
// CIRCUIT BREAKER GLOBAL
// ==========================================

const globalCircuit = globalThis as unknown as {
    redisCircuitOpen: boolean | undefined
    redisConnection: IORedis | undefined
}

/** true = Redis deshabilitado (circuito abierto) */
let circuitOpen = globalCircuit.redisCircuitOpen ?? false

/** Marca Redis como muerto — todo el sistema usa DB fallback */
export function tripCircuitBreaker(reason: string) {
    if (!circuitOpen) {
        console.warn(`[Redis] CIRCUIT BREAKER ABIERTO: ${reason}`)
        console.warn("[Redis] Todo el tráfico se redirige a DB (modo emergencia)")
        circuitOpen = true
        globalCircuit.redisCircuitOpen = true

        // Desconectar la instancia existente para que deje de reintentar
        try {
            if (globalCircuit.redisConnection) {
                globalCircuit.redisConnection.disconnect()
            }
        } catch { /* ignore */ }
    }
}

/** Detecta si un error es de límite de Upstash */
function isUpstashLimitError(err: unknown): boolean {
    if (err instanceof Error) {
        return err.message.includes("limit exceeded") ||
               err.message.includes("max requests")
    }
    return false
}

// ==========================================
// REDIS CONFIG
// ==========================================

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

// ==========================================
// CONEXIÓN SINGLETON
// ==========================================

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
        lazyConnect: true, // No conectar al crear — conectar solo cuando se necesite
        ...(config.useTls ? { tls: {} } : {}),
        retryStrategy(times: number) {
            // Si el circuit breaker está abierto, NO reintentar
            if (circuitOpen) return null

            // Máximo 5 reintentos, luego parar
            if (times > 5) {
                console.error("[Redis] Máximo de reintentos alcanzado, deteniendo")
                return null
            }

            const delay = Math.min(times * 500, 5000)
            return delay
        },
    })

    connection.on("error", (err) => {
        if (isUpstashLimitError(err)) {
            tripCircuitBreaker("Upstash max requests limit exceeded")
            return
        }
        // Solo logear 1 vez, no spamear
        if (!circuitOpen) {
            console.error("[Redis] Error:", err.message)
        }
    })

    connection.on("connect", () => {
        console.log("[Redis] Conectado exitosamente")
    })

    return connection
}

export const redis = globalCircuit.redisConnection ?? createRedisConnection()
globalCircuit.redisConnection = redis

// ==========================================
// CONFIG PARA BULLMQ (con circuit breaker)
// ==========================================

/**
 * Returns a Redis connection config object for use with BullMQ Queue/Worker constructors.
 * Incluye retryStrategy con circuit breaker.
 */
export function getRedisConfig() {
    const config = parseRedisUrl()

    return {
        host: config.host,
        port: config.port,
        password: config.password,
        username: config.username,
        maxRetriesPerRequest: null as null,
        lazyConnect: true,
        ...(config.useTls ? { tls: {} } : {}),
        retryStrategy(times: number) {
            if (circuitOpen) return null
            if (times > 5) return null
            return Math.min(times * 500, 5000)
        },
    }
}

// ==========================================
// DISPONIBILIDAD
// ==========================================

/** Cache para no spamear pings a Upstash */
let _lastPingResult: boolean | null = null
let _lastPingTime = 0
const PING_CACHE_MS = 60_000 // Cache resultado por 60s

/**
 * Verifica si Redis está disponible sin lanzar excepciones.
 * Retorna false inmediatamente si el circuit breaker está abierto.
 * Cache el resultado para no desperdiciar requests de Upstash.
 */
export async function isRedisAvailable(): Promise<boolean> {
    // Fast path: circuit breaker abierto — NUNCA hacer ping
    if (circuitOpen) return false

    // Cache: no re-verificar si ya comprobamos recientemente
    const now = Date.now()
    if (_lastPingResult !== null && (now - _lastPingTime) < PING_CACHE_MS) {
        return _lastPingResult
    }

    try {
        await redis.ping()
        _lastPingResult = true
        _lastPingTime = now
        return true
    } catch (err) {
        _lastPingResult = false
        _lastPingTime = now
        if (isUpstashLimitError(err)) {
            tripCircuitBreaker("Upstash limit exceeded en ping")
        }
        return false
    }
}
