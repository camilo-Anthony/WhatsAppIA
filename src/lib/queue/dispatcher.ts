/**
 * Dispatcher Central — Encola jobs en Redis o DB.
 *
 * FIX: Cuando Redis falla, activa el circuit breaker para que
 *      TODOS los siguientes dispatches vayan directo a DB sin
 *      desperdiciar requests en Upstash.
 */

import { prisma } from "../db"
import { isRedisAvailable, tripCircuitBreaker } from "./redis"
import { NormalizedMessage } from "../whatsapp/provider"

export type QueueName = "incoming" | "ai-processing" | "outgoing"

// ==========================================
// DEDUPLICACIÓN
// ==========================================

const DEDUP_TTL_SECONDS = 3600 // 1 hora

async function isDuplicate(messageId: string): Promise<boolean> {
    // Si Redis no está disponible, ir directo a DB
    const redisUp = await isRedisAvailable()
    if (!redisUp) {
        const existing = await prisma.message.findFirst({
            where: { externalId: messageId },
            select: { id: true },
        })
        return !!existing
    }

    try {
        const { redis } = await import("./redis")
        const exists = await redis.get(`msg:dedup:${messageId}`)
        if (exists) return true
        await redis.set(`msg:dedup:${messageId}`, "1", "EX", DEDUP_TTL_SECONDS)
        return false
    } catch (err) {
        tripCircuitBreaker("dedup operation failed")
        // Fallback a DB
        const existing = await prisma.message.findFirst({
            where: { externalId: messageId },
            select: { id: true },
        })
        return !!existing
    }
}

// ==========================================
// DISPATCHER CENTRAL
// ==========================================

/**
 * Encola un trabajo. Si Redis no está disponible, lo guarda en la DB para el RetryCron.
 * Soporta sobrecarga para recibir un NormalizedMessage directamente desde el listener.
 */
export async function dispatch(queueNameOrMessage: QueueName | NormalizedMessage, payload?: any) {
    let queue: QueueName
    let data: any

    if (typeof queueNameOrMessage === "string") {
        queue = queueNameOrMessage
        data = payload
    } else {
        // 1. Deduplicar mensajes de WhatsApp
        if (await isDuplicate(queueNameOrMessage.id)) {
            console.log(`[Dispatcher] Duplicado ignorado: ${queueNameOrMessage.id}`)
            return { success: true, mode: "ignored_duplicate" }
        }

        // 2. Mapeo automático de mensaje normalizado a la cola entrante
        queue = "incoming"
        data = {
            connectionId: queueNameOrMessage.connectionId,
            userId: queueNameOrMessage.userId,
            senderPhone: queueNameOrMessage.senderPhone,
            senderName: queueNameOrMessage.senderName,
            messageContent: queueNameOrMessage.content.text || "",
            messageId: queueNameOrMessage.id,
            source: queueNameOrMessage.provider,
            remoteJid: queueNameOrMessage.metadata?.remoteJid as string
        }
    }

    const isRedisUp = await isRedisAvailable()

    if (isRedisUp) {
        try {
            if (queue === "incoming") {
                const { getIncomingQueue } = await import("./incoming")
                await getIncomingQueue().add("incoming-message", data)
            } else if (queue === "ai-processing") {
                const { getAIProcessingQueue } = await import("./ai-processing")
                await getAIProcessingQueue().add("ai-process", data)
            } else if (queue === "outgoing") {
                const { getOutgoingQueue } = await import("./outgoing")
                await getOutgoingQueue().add("send-message", data)
            }
            
            return { success: true, mode: "redis" }
        } catch (err) {
            // ACTIVAR CIRCUIT BREAKER para que no se vuelva a intentar Redis
            tripCircuitBreaker("BullMQ enqueue failed")
            console.warn(`[Dispatcher] Redis falló, circuit breaker activado. Guardando en DB.`)
        }
    }

    // FALLBACK A BASE DE DATOS (Emergencia)
    console.log(`[Dispatcher] MODO DB: Guardando job para ${queue}`)
    
    await prisma.queueJob.create({
        data: {
            queue: queue,
            connectionId: data.connectionId || "unknown",
            payload: data as any,
            status: "pending",
            attempts: 0,
            maxAttempts: 5,
            nextRetryAt: new Date(), 
        }
    })

    return { success: true, mode: "database" }
}
