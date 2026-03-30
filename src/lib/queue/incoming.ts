/**
 * Cola de Mensajes Entrantes
 * Recibe mensajes de WhatsApp y los envía al procesamiento de IA.
 */

import { Queue, Worker, Job } from "bullmq"
import { getRedisConfig } from "./redis"
import { prisma } from "@/lib/db"

// ==========================================
// TIPOS
// ==========================================

export interface IncomingMessageJob {
    connectionId: string
    userId: string
    senderPhone: string
    senderName?: string
    messageContent: string
    messageId: string
    source: "baileys" | "cloud_api"
}

// ==========================================
// COLA (lazy init para evitar errores durante build)
// ==========================================

let _incomingQueue: Queue<IncomingMessageJob> | null = null

export function getIncomingQueue(): Queue<IncomingMessageJob> {
    if (!_incomingQueue) {
        _incomingQueue = new Queue<IncomingMessageJob>("whatsapp:incoming", {
            connection: getRedisConfig(),
            defaultJobOptions: {
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 50 },
                attempts: 2,
                backoff: { type: "exponential", delay: 1000 },
            },
        })
    }
    return _incomingQueue
}

// Alias para compatibilidad
export const incomingQueue = { add: (...args: Parameters<Queue<IncomingMessageJob>["add"]>) => getIncomingQueue().add(...args) }

// ==========================================
// PROCESADOR
// ==========================================

async function processIncomingJob(job: Job<IncomingMessageJob>) {
    const { connectionId, userId, senderPhone, senderName, messageContent } = job.data

    console.log(`[Cola:Entrante] Procesando mensaje de +${senderPhone}`)

    let conversation = await prisma.conversation.findFirst({
        where: { userId, clientPhone: senderPhone },
    })

    if (!conversation) {
        conversation = await prisma.conversation.create({
            data: { userId, clientPhone: senderPhone, clientName: senderName || null },
        })
    } else if (senderName && !conversation.clientName) {
        await prisma.conversation.update({
            where: { id: conversation.id },
            data: { clientName: senderName },
        })
    }

    await prisma.message.create({
        data: {
            conversationId: conversation.id,
            connectionId,
            direction: "INCOMING",
            content: messageContent,
        },
    })

    const { getAIProcessingQueue } = await import("./ai-processing")
    const aiQueue = getAIProcessingQueue()
    await aiQueue.add("ai-process", {
        userId,
        connectionId,
        conversationId: conversation.id,
        clientPhone: senderPhone,
        messageContent,
    })

    console.log(`[Cola:Entrante] Mensaje guardado y encolado para IA — conversación: ${conversation.id}`)
}

// ==========================================
// WORKER
// ==========================================

let incomingWorker: Worker<IncomingMessageJob> | null = null

export function startIncomingWorker() {
    if (incomingWorker) return incomingWorker

    incomingWorker = new Worker<IncomingMessageJob>(
        "whatsapp:incoming",
        processIncomingJob,
        { connection: getRedisConfig(), concurrency: 10 }
    )

    incomingWorker.on("completed", (job) => {
        console.log(`[Cola:Entrante] Job ${job.id} completado`)
    })

    incomingWorker.on("failed", (job, err) => {
        console.error(`[Cola:Entrante] Job ${job?.id} falló:`, err.message)
    })

    console.log("[Cola:Entrante] Worker iniciado — concurrencia: 10")
    return incomingWorker
}
