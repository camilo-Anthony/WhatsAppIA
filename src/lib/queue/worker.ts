/**
 * Queue Worker Orchestrator
 * Inicializa todos los workers de cola + retry cron al arrancar.
 *
 * FIX: El retry cron SIEMPRE arranca, incluso si Redis/BullMQ falla.
 *      Es el fallback de emergencia que procesa jobs desde la DB.
 */

import { startIncomingWorker } from "./incoming"
import { startAIProcessingWorker } from "./ai-processing"
import { startOutgoingWorker } from "./outgoing"
import { startRetryCron } from "./retry-cron"

const globalForQueues = globalThis as unknown as {
    queuesInitialized: boolean | undefined
}

/**
 * Inicializa todos los workers de cola.
 * Solo se ejecuta una vez (singleton pattern).
 */
export function initializeQueueWorkers() {
    if (globalForQueues.queuesInitialized) {
        console.log("[Colas] Workers ya inicializados, omitiendo...")
        return
    }

    console.log("[Colas] Inicializando workers...")

    // 1. Intentar iniciar workers de Redis (puede fallar si Redis no está)
    try {
        startIncomingWorker()
        startAIProcessingWorker()
        startOutgoingWorker()
        console.log("[Colas] Workers de Redis iniciados correctamente")
    } catch (error) {
        console.error("[Colas] Error inicializando workers de Redis (usando modo emergencia DB):", error)
    }

    // 2. SIEMPRE iniciar el retry cron (fallback de emergencia)
    try {
        startRetryCron(15_000) // 15s para modo emergencia
        console.log("[Colas] Retry cron iniciado (fallback emergencia activo)")
    } catch (error) {
        console.error("[Colas] Error CRÍTICO inicializando retry cron:", error)
    }

    globalForQueues.queuesInitialized = true
    console.log("[Colas] Inicialización de workers completada")
}

if (process.env.NODE_ENV !== "production") {
    globalForQueues.queuesInitialized = globalForQueues.queuesInitialized || false
}

