/**
 * Cola de Envío de Mensajes
 * Envía respuestas a WhatsApp con control de velocidad por número.
 */

import { Queue, Worker, Job } from "bullmq"
import { getRedisConfig } from "./redis"
import { prisma } from "@/lib/db"
import { sendTextMessage } from "@/lib/whatsapp/cloud-api"

// ==========================================
// TIPOS
// ==========================================

export interface OutgoingMessageJob {
    connectionId: string
    recipientJid: string
    recipientPhone: string
    text: string
    conversationId: string
}

// ==========================================
// COLA (lazy init)
// ==========================================

let _outgoingQueue: Queue<OutgoingMessageJob> | null = null

export function getOutgoingQueue(): Queue<OutgoingMessageJob> {
    if (!_outgoingQueue) {
        _outgoingQueue = new Queue<OutgoingMessageJob>("whatsapp:outgoing", {
            connection: getRedisConfig(),
            defaultJobOptions: {
                removeOnComplete: { count: 200 },
                removeOnFail: { count: 100 },
                attempts: 3,
                backoff: { type: "exponential", delay: 1000 },
            },
        })
    }
    return _outgoingQueue
}

export const outgoingQueue = { add: (...args: Parameters<Queue<OutgoingMessageJob>["add"]>) => getOutgoingQueue().add(...args) }

// ==========================================
// RATE LIMITER POR CONEXIÓN
// ==========================================

const connectionTimestamps: Map<string, number[]> = new Map()
const MAX_MESSAGES_PER_MINUTE = 20

async function waitForRateLimit(connectionId: string) {
    const now = Date.now()
    const timestamps = connectionTimestamps.get(connectionId) || []
    const recent = timestamps.filter((t) => now - t < 60000)
    connectionTimestamps.set(connectionId, recent)

    if (recent.length >= MAX_MESSAGES_PER_MINUTE) {
        const oldestTimestamp = recent[0]
        const waitTime = 60000 - (now - oldestTimestamp) + 100
        console.log(`[Cola:Envío] Rate limit para conexión ${connectionId}, esperando ${waitTime}ms`)
        await new Promise((resolve) => setTimeout(resolve, waitTime))
    }

    const updated = connectionTimestamps.get(connectionId) || []
    updated.push(Date.now())
    connectionTimestamps.set(connectionId, updated)
}

// ==========================================
// PROCESADOR
// ==========================================

async function processOutgoingJob(job: Job<OutgoingMessageJob>) {
    const { connectionId, recipientJid, recipientPhone, text } = job.data

    console.log(`[Cola:Envío] Enviando mensaje a ${recipientPhone}`)

    await waitForRateLimit(connectionId)

    const connection = await prisma.whatsAppConnection.findUnique({
        where: { id: connectionId },
    })

    if (!connection) {
        console.error(`[Cola:Envío] Conexión ${connectionId} no encontrada`)
        return
    }

    if (connection.mode === "QR") {
        const { whatsappManager } = await import("@/lib/whatsapp/manager")
        const client = whatsappManager.getClient(connectionId)

        if (!client) {
            console.error(`[Cola:Envío] Cliente Baileys no encontrado para ${connectionId}`)
            throw new Error("CLIENT_NOT_FOUND")
        }

        await client.sendMessage(recipientJid, text)
    } else {
        if (!connection.waPhoneNumberId || !connection.accessToken) {
            console.error(`[Cola:Envío] Conexión ${connectionId} sin credenciales Cloud API`)
            return
        }

        if (connection.tokenExpiresAt && connection.tokenExpiresAt < new Date()) {
            await prisma.whatsAppConnection.update({
                where: { id: connectionId },
                data: { status: "TOKEN_EXPIRED" },
            })
            console.error(`[Cola:Envío] Token expirado para conexión ${connectionId}`)
            return
        }

        await sendTextMessage(
            connection.waPhoneNumberId,
            connection.accessToken,
            recipientPhone,
            text
        )
    }

    await prisma.whatsAppConnection.update({
        where: { id: connectionId },
        data: { lastActive: new Date() },
    })

    console.log(`[Cola:Envío] Mensaje enviado a ${recipientPhone}`)
}

// ==========================================
// WORKER
// ==========================================

let outgoingWorker: Worker<OutgoingMessageJob> | null = null

export function startOutgoingWorker() {
    if (outgoingWorker) return outgoingWorker

    outgoingWorker = new Worker<OutgoingMessageJob>(
        "whatsapp:outgoing",
        processOutgoingJob,
        { connection: getRedisConfig(), concurrency: 5 }
    )

    outgoingWorker.on("completed", (job) => {
        console.log(`[Cola:Envío] Job ${job.id} completado`)
    })

    outgoingWorker.on("failed", (job, err) => {
        console.error(`[Cola:Envío] Job ${job?.id} falló:`, err.message)
    })

    console.log("[Cola:Envío] Worker iniciado — concurrencia: 5, límite: 20 msg/min por número")
    return outgoingWorker
}
