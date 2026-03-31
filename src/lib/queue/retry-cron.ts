/**
 * Retry Cron — Escanea queue_jobs pendientes y los re-encola cuando Redis vuelve.
 * 
 * Ejecutar periódicamente (cada 30s-60s) desde el worker orchestrator.
 * Solo procesa jobs cuyo nextRetryAt ya pasó y no han agotado intentos.
 */

import { prisma } from "../db"
import { isRedisAvailable } from "./redis"

const BATCH_SIZE = 50

/**
 * Re-encola jobs pendientes en DB cuando Redis está disponible.
 * Implementa backoff exponencial: 2s, 8s, 32s, 128s...
 */
export async function retryPendingJobs(): Promise<number> {
    // No intentar si Redis sigue caído
    if (!(await isRedisAvailable())) {
        return 0
    }

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
            const incoming = await import("./incoming")
            await incoming.getIncomingQueue().add("retry", job.payload as never)

            await prisma.queueJob.update({
                where: { id: job.id },
                data: {
                    status: "processing",
                    attempts: { increment: 1 },
                },
            })

            processed++
        } catch (err) {
            // Aún no puede encolar — calcular backoff exponencial
            const delay = Math.pow(4, job.attempts) * 2000 // 2s, 8s, 32s, 128s
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
        console.log(`[RetryCron] Re-encolados ${processed}/${pending.length} jobs`)
    }

    return processed
}

// ==========================================
// INTERVALO AUTOMÁTICO
// ==========================================

let retryInterval: ReturnType<typeof setInterval> | null = null

export function startRetryCron(intervalMs = 30_000) {
    if (retryInterval) return

    retryInterval = setInterval(async () => {
        try {
            await retryPendingJobs()
        } catch (err) {
            console.error("[RetryCron] Error:", err)
        }
    }, intervalMs)

    console.log(`[RetryCron] Iniciado — intervalo: ${intervalMs / 1000}s`)
}

export function stopRetryCron() {
    if (retryInterval) {
        clearInterval(retryInterval)
        retryInterval = null
    }
}
