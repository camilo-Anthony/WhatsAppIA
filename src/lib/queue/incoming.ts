/**
 * Cola de Mensajes Entrantes
 * Recibe mensajes de WhatsApp y los envía al procesamiento de IA.
 */

import { Queue, Worker, Job } from "bullmq"
import { getRedisConfig } from "./redis"
import { prisma } from "../db"
import { dispatch } from "@/lib/queue/dispatcher"

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
    remoteJid?: string
}

// ==========================================
// COLA (lazy init para evitar errores durante build)
// ==========================================

let _incomingQueue: Queue<IncomingMessageJob> | null = null

export function getIncomingQueue(): Queue<IncomingMessageJob> {
    if (!_incomingQueue) {
        _incomingQueue = new Queue<IncomingMessageJob>("whatsapp-incoming", {
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
// LÓGICA DE NEGOCIO (Extraída para modo emergencia)
// ==========================================

export async function handleIncomingMessage(data: IncomingMessageJob) {
    const { connectionId, userId, senderPhone, senderName, messageContent, remoteJid } = data

    console.log(`[Queue:Incoming] Processing message from +${senderPhone}`)

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

    await dispatch("ai-processing", {
        userId,
        connectionId,
        conversationId: conversation.id,
        clientPhone: senderPhone,
        messageContent,
        remoteJid,
    })

    console.log(`[Queue:Incoming] Message saved and dispatched to AI — conversation: ${conversation.id}`)
    return conversation
}

// ==========================================
// PROCESADOR (BullMQ Wrapper)
// ==========================================

async function processIncomingJob(job: Job<IncomingMessageJob>) {
    return handleIncomingMessage(job.data)
}

// ==========================================
// WORKER
// ==========================================

let incomingWorker: Worker<IncomingMessageJob> | null = null

export function startIncomingWorker() {
    if (incomingWorker) return incomingWorker

    incomingWorker = new Worker<IncomingMessageJob>(
        "whatsapp-incoming",
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
