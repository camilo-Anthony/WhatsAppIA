/**
 * Queue Worker Orchestrator
 * Inicializa todos los workers de cola + retry cron al arrancar.
 *
 * FIX: Verifica Redis antes de crear BullMQ workers.
 *      El retry cron SIEMPRE arranca (fallback de emergencia DB).
 */

import { startRetryCron } from "./retry-cron"

const globalForQueues = globalThis as unknown as {
    queuesInitialized: boolean | undefined
}

/**
 * Inicializa todos los workers de cola.
 * Solo se ejecuta una vez (singleton pattern).
 */
export async function initializeQueueWorkers() {
    if (globalForQueues.queuesInitialized) {
        console.log("[Colas] Workers ya inicializados, omitiendo...")
        return
    }

    console.log("[Colas] Inicializando workers...")

    // 1. Verificar Redis ANTES de crear workers costosos
    const { isRedisAvailable } = await import("./redis")
    const redisUp = await isRedisAvailable()

    if (redisUp) {
        try {
            const { startIncomingWorker } = await import("./incoming")
            const { startAIProcessingWorker } = await import("./ai-processing")
            const { startOutgoingWorker } = await import("./outgoing")
            
            startIncomingWorker()
            startAIProcessingWorker()
            startOutgoingWorker()
            console.log("[Colas] Workers de Redis iniciados correctamente")
        } catch (error) {
            console.error("[Colas] Error inicializando workers de Redis:", error)
        }
    } else {
        console.warn("[Colas] Redis NO disponible — omitiendo BullMQ workers")
        console.warn("[Colas] El sistema operará en MODO EMERGENCIA (solo DB)")
    }

    // 2. SIEMPRE iniciar el retry cron (fallback de emergencia)
    try {
        startRetryCron(15_000) // 15s para modo emergencia
        console.log("[Colas] Retry cron iniciado (fallback emergencia activo)")
    } catch (error) {
        console.error("[Colas] Error CRÍTICO inicializando retry cron:", error)
    }

    globalForQueues.queuesInitialized = true
    console.log("[Colas] Inicialización completada")
}

if (process.env.NODE_ENV !== "production") {
    globalForQueues.queuesInitialized = globalForQueues.queuesInitialized || false
}
