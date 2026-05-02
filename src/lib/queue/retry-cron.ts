import { prisma } from "../db"
import { isRedisAvailable } from "./redis"

const BATCH_SIZE = 50

/**
 * Procesa un job directamente llamando a la lógica de negocio,
 * puenteando BullMQ cuando Redis no está disponible.
 */
async function processJobDirectly(job: any) {
    const queue = job.queue
    const payload = job.payload

    if (queue === "incoming") {
        const { handleIncomingMessage } = await import("./incoming")
        await handleIncomingMessage(payload)
    } else if (queue === "ai-processing") {
        const { handleAIProcessing } = await import("./ai-processing")
        await handleAIProcessing(payload)
    } else if (queue === "outgoing") {
        const { handleOutgoingMessage } = await import("./outgoing")
        await handleOutgoingMessage(payload)
    } else {
        throw new Error(`Queue ${queue} not supported for direct processing`)
    }
}

/**
 * Re-encola jobs pendientes o los procesa directamente si Redis está caído.
 */
export async function retryPendingJobs(): Promise<number> {
    const isRedisUp = await isRedisAvailable()

    const pending = await prisma.queueJob.findMany({
        where: {
            status: "pending",
            nextRetryAt: { lte: new Date() },
        },
        take: BATCH_SIZE,
        orderBy: { createdAt: "asc" },
    })

    if (pending.length === 0) return 0

    let processed = 0
    console.log(`[RetryCron] Analizando ${pending.length} jobs (Redis: ${isRedisUp ? "OK" : "DOWN"})`)

    for (const job of pending) {
        // Verificar que no ha agotado intentos
        if (job.attempts >= job.maxAttempts) {
            await prisma.queueJob.update({
                where: { id: job.id },
                data: { status: "failed", lastError: "Max attempts reached" },
            })
            continue
        }

        try {
            if (isRedisUp) {
                // MODO NORMAL: Enviar a Redis
                const incoming = await import("./incoming")
                // Determinamos la cola correcta basado en el campo 'queue' del job
                if (job.queue === "incoming") {
                    const { getIncomingQueue } = await import("./incoming")
                    await getIncomingQueue().add("retry", job.payload as any)
                } else if (job.queue === "ai-processing") {
                    const { getAIProcessingQueue } = await import("./ai-processing")
                    await getAIProcessingQueue().add("retry", job.payload as any)
                } else {
                    const { getOutgoingQueue } = await import("./outgoing")
                    await getOutgoingQueue().add("retry", job.payload as any)
                }

                await prisma.queueJob.update({
                    where: { id: job.id },
                    data: {
                        status: "completed", // En modo normal, el encolado exitoso cuenta como completado para la DB
                        attempts: { increment: 1 },
                    },
                })
            } else {
                // MODO EMERGENCIA: Procesar directamente
                console.log(`[EmergencyMode] Procesando job ${job.id} directamente desde DB`)
                await processJobDirectly(job)

                await prisma.queueJob.update({
                    where: { id: job.id },
                    data: {
                        status: "completed",
                        attempts: { increment: 1 },
                    },
                })
            }

            processed++
        } catch (err) {
            console.error(`[RetryCron] Error procesando job ${job.id}:`, err)
            // Backoff exponencial
            const delay = Math.pow(4, job.attempts) * 2000 
            const nextRetry = new Date(Date.now() + delay)
            const newAttempts = job.attempts + 1

            await prisma.queueJob.update({
                where: { id: job.id },
                data: {
                    attempts: newAttempts,
                    lastError: err instanceof Error ? err.message : "Unknown error",
                    nextRetryAt: nextRetry,
                    status: newAttempts >= job.maxAttempts ? "failed" : "pending",
                },
            })
        }
    }

    if (processed > 0) {
        console.log(`[RetryCron] ${isRedisUp ? "Re-encolados" : "Procesados directamente"} ${processed}/${pending.length} jobs`)
    }

    return processed
}

// ==========================================
// INTERVALO AUTOMÁTICO
// ==========================================

let retryInterval: ReturnType<typeof setInterval> | null = null

export function startRetryCron(intervalMs = 15_000) { // Bajamos a 15s para modo emergencia
    if (retryInterval) return

    retryInterval = setInterval(async () => {
        try {
            await retryPendingJobs()
        } catch (err) {
            console.error("[RetryCron] Error fatal:", err)
        }
    }, intervalMs)

    console.log(`[RetryCron] Iniciado (Emergencia habilitada) — intervalo: ${intervalMs / 1000}s`)
}

export function stopRetryCron() {
    if (retryInterval) {
        clearInterval(retryInterval)
        retryInterval = null
    }
}
