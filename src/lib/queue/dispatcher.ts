/**
 * Dispatcher Central — Procesa jobs directamente (sin Redis).
 *
 * ARQUITECTURA SIMPLIFICADA:
 * 1. Mensaje llega → se procesa INMEDIATAMENTE en el mismo request
 * 2. Si falla, se guarda en DB para retry-cron
 * 3. Deduplicación via DB (tabla Message)
 *
 * Redis/BullMQ ya no se usa. PostgreSQL maneja todo.
 */

import { prisma } from "../db"
import { NormalizedMessage } from "../whatsapp/provider"
import type { AIProcessingJob } from "./ai-processing"
import type { IncomingMessageJob } from "./incoming"
import type { OutgoingMessageJob } from "./outgoing"

export type QueueName = "incoming" | "ai-processing" | "outgoing"
type QueuePayload = IncomingMessageJob | AIProcessingJob | OutgoingMessageJob

// ==========================================
// DEDUPLICACIÓN (via DB, sin Redis)
// ==========================================

async function isDuplicate(messageId: string): Promise<boolean> {
    const existing = await prisma.message.findFirst({
        where: { externalId: messageId },
        select: { id: true },
    })
    return !!existing
}

// ==========================================
// PROCESAMIENTO DIRECTO
// ==========================================

/**
 * Ejecuta la lógica de negocio de una cola directamente.
 */
async function processDirectly(queue: QueueName, data: QueuePayload): Promise<void> {
    if (queue === "incoming") {
        const { handleIncomingMessage } = await import("./incoming")
        await handleIncomingMessage(data as IncomingMessageJob)
    } else if (queue === "ai-processing") {
        const { handleAIProcessing } = await import("./ai-processing")
        await handleAIProcessing(data as AIProcessingJob)
    } else if (queue === "outgoing") {
        const { handleOutgoingMessage } = await import("./outgoing")
        await handleOutgoingMessage(data as OutgoingMessageJob)
    }
}

// ==========================================
// DISPATCHER
// ==========================================

/**
 * Procesa un trabajo inmediatamente.
 * Si falla, lo guarda en DB para reintento automático.
 */
export async function dispatch(queueNameOrMessage: QueueName | NormalizedMessage, payload?: QueuePayload) {
    let queue: QueueName
    let data: QueuePayload

    if (typeof queueNameOrMessage === "string") {
        if (!payload) {
            throw new Error(`Payload requerido para cola ${queueNameOrMessage}`)
        }
        queue = queueNameOrMessage
        data = payload
    } else {
        // Deduplicar mensajes de WhatsApp
        if (await isDuplicate(queueNameOrMessage.id)) {
            console.log(`[Dispatcher] Duplicado ignorado: ${queueNameOrMessage.id}`)
            return { success: true, mode: "ignored_duplicate" }
        }

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

    // Intentar procesar directamente
    try {
        await processDirectly(queue, data)
        return { success: true, mode: "direct" }
    } catch (err) {
        console.error(`[Dispatcher] Error procesando ${queue}, guardando para retry:`, err)

        // Guardar en DB para retry-cron
        await prisma.queueJob.create({
            data: {
                queue: queue,
                connectionId: data.connectionId || "unknown",
                payload: JSON.parse(JSON.stringify(data)),
                status: "pending",
                attempts: 1, // Ya intentamos 1 vez
                maxAttempts: 5,
                lastError: err instanceof Error ? err.message : "Unknown error",
                nextRetryAt: new Date(Date.now() + 5000), // Reintentar en 5s
            }
        })

        return { success: true, mode: "queued_for_retry" }
    }
}
