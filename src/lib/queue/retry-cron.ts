/**
 * Retry Cron — Procesa jobs pendientes desde la DB.
 *
 * FIX: SIEMPRE procesa directamente desde DB (modo emergencia).
 *      No intenta re-encolar en Redis — eso desperdicia requests
 *      de Upstash y falla si el límite está excedido.
 *      Cuando Redis vuelva, los NUEVOS mensajes irán por Redis.
 *      Los que ya están en DB se procesan directamente aquí.
 */

import { prisma } from "../db"
import type { QueueName } from "./dispatcher"
import type { AIProcessingJob } from "./ai-processing"
import type { IncomingMessageJob } from "./incoming"
import type { OutgoingMessageJob } from "./outgoing"

const BATCH_SIZE = 50
type QueuePayload = IncomingMessageJob | AIProcessingJob | OutgoingMessageJob

/**
 * Procesa un job directamente llamando a la lógica de negocio,
 * puenteando BullMQ completamente.
 */
async function processJobDirectly(job: { queue: string; payload: unknown }) {
    const queue = job.queue as QueueName
    const payload = job.payload as QueuePayload

    if (queue === "incoming") {
        const { handleIncomingMessage } = await import("./incoming")
        await handleIncomingMessage(payload as IncomingMessageJob)
    } else if (queue === "ai-processing") {
        const { handleAIProcessing } = await import("./ai-processing")
        await handleAIProcessing(payload as AIProcessingJob)
    } else if (queue === "outgoing") {
        const { handleOutgoingMessage } = await import("./outgoing")
        await handleOutgoingMessage(payload as OutgoingMessageJob)
    } else {
        throw new Error(`Queue ${queue} not supported for direct processing`)
    }
}

/**
 * Procesa jobs pendientes SIEMPRE directamente desde DB.
 * No re-encola en Redis para evitar desperdiciar requests.
 */
export async function retryPendingJobs(): Promise<number> {
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
    console.log(`[RetryCron] Procesando ${pending.length} jobs directamente desde DB`)

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
            await processJobDirectly(job)

            await prisma.queueJob.update({
                where: { id: job.id },
                data: {
                    status: "completed",
                    attempts: { increment: 1 },
                },
            })

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
        console.log(`[RetryCron] Procesados ${processed}/${pending.length} jobs`)
    }

    return processed
}

// ==========================================
// CLEANUP MANTENIMIENTO DB
// ==========================================

/**
 * Borra jobs completados o fallidos de más de 24 horas de antigüedad.
 * Esto mantiene la tabla temporal limpia sin borrar los historiales
 * de mensajes ni las conversaciones reales.
 */
export async function cleanupCompletedJobs() {
    try {
        const thresholdDate = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 horas

        const deleted = await prisma.queueJob.deleteMany({
            where: {
                status: { in: ["completed", "failed"] },
                createdAt: { lt: thresholdDate },
            },
        })

        if (deleted.count > 0) {
            console.log(`[RetryCron] Limpieza: Borrados ${deleted.count} jobs antiguos.`)
        }
    } catch (err) {
        console.error("[RetryCron] Error en cleanup:", err)
    }
}

// ==========================================
// INTERVALO AUTOMÁTICO
// ==========================================

let retryInterval: ReturnType<typeof setInterval> | null = null
let cleanupCounter = 0

export function startRetryCron(intervalMs = 15_000) {
    if (retryInterval) return

    retryInterval = setInterval(async () => {
        try {
            await retryPendingJobs()

            // Correr cleanup cada ~1 hora aprox (suponiendo interval 15s -> 240 ticks)
            cleanupCounter++
            if (cleanupCounter >= 240) {
                cleanupCounter = 0
                await cleanupCompletedJobs()
            }
        } catch (err) {
            console.error("[RetryCron] Error fatal:", err)
        }
    }, intervalMs)

    console.log(`[RetryCron] Iniciado — procesamiento directo DB cada ${intervalMs / 1000}s`)
}

export function stopRetryCron() {
    if (retryInterval) {
        clearInterval(retryInterval)
        retryInterval = null
    }
}
