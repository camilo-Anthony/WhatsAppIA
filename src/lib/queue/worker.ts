/**
 * Queue Worker Orchestrator
 * Inicializa todos los workers de cola + retry cron al arrancar.
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

    try {
        startIncomingWorker()
        startAIProcessingWorker()
        startOutgoingWorker()
        startRetryCron(30_000) // Retry cada 30 segundos

        globalForQueues.queuesInitialized = true
        console.log("[Colas] Todos los workers + retry cron iniciados correctamente")
    } catch (error) {
        console.error("[Colas] Error inicializando workers:", error)
        globalForQueues.queuesInitialized = false
    }
}

if (process.env.NODE_ENV !== "production") {
    globalForQueues.queuesInitialized = globalForQueues.queuesInitialized || false
}
