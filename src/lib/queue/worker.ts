/**
 * Queue Worker Orchestrator
 * Solo inicia el retry-cron para procesar jobs fallidos desde la DB.
 * BullMQ/Redis ya no se usa — todo se procesa directamente.
 */

import { startRetryCron } from "./retry-cron"

const globalForQueues = globalThis as unknown as {
    queuesInitialized: boolean | undefined
}

/**
 * Inicializa el sistema de colas.
 * Solo arranca el retry-cron (fallback para jobs que fallan).
 */
export async function initializeQueueWorkers() {
    if (globalForQueues.queuesInitialized) {
        console.log("[Colas] Ya inicializado, omitiendo...")
        return
    }

    console.log("[Colas] Modo directo (sin Redis) — solo retry-cron")

    try {
        startRetryCron(15_000) // Cada 15s procesa jobs fallidos
        console.log("[Colas] Retry cron iniciado")
    } catch (error) {
        console.error("[Colas] Error CRÍTICO inicializando retry cron:", error)
    }

    globalForQueues.queuesInitialized = true
}

if (process.env.NODE_ENV !== "production") {
    globalForQueues.queuesInitialized = globalForQueues.queuesInitialized || false
}
