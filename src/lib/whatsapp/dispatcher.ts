/**
 * WhatsApp Dispatcher — Valida, deduplica y encola mensajes.
 * 
 * Flujo:
 *   listener.ts → dispatcher.ts → queue (Redis) | DB fallback
 * 
 * Nunca procesa mensajes directamente. Solo encola o guarda para retry.
 */

import { prisma } from "../db"
import type { NormalizedMessage } from "./provider"

// ==========================================
// DEDUPLICACIÓN (Redis → DB fallback)
// ==========================================

const DEDUP_TTL_SECONDS = 3600 // 1 hora

async function isDuplicate(messageId: string): Promise<boolean> {
    try {
        const { redis } = await import("../queue/redis")
        const exists = await redis.get(`msg:dedup:${messageId}`)
        if (exists) return true
        await redis.set(`msg:dedup:${messageId}`, "1", "EX", DEDUP_TTL_SECONDS)
        return false
    } catch (err) {
        // Redis no disponible → fallback a DB
        console.error(`[Dispatcher] Redis dedup error:`, err instanceof Error ? err.message : err)
        const existing = await prisma.message.findFirst({
            where: { externalId: messageId },
            select: { id: true },
        })
        return !!existing
    }
}

// ==========================================
// GUARDAR PARA RETRY (cuando Redis no está)
// ==========================================

async function saveForRetry(msg: NormalizedMessage): Promise<void> {
    const payload = JSON.parse(JSON.stringify({
        userId: msg.userId,
        connectionId: msg.connectionId,
        senderPhone: msg.senderPhone,
        senderName: msg.senderName,
        messageContent: msg.content.text || "",
        messageId: msg.id,
        source: msg.provider,
    }))

    await prisma.queueJob.create({
        data: {
            queue: "incoming",
            connectionId: msg.connectionId,
            payload,
            status: "pending",
            nextRetryAt: new Date(),
        },
    })
    console.warn(`[Dispatcher] Mensaje guardado en DB para retry — de: +${msg.senderPhone}`)
}

// ==========================================
// DISPATCH PRINCIPAL
// ==========================================

/**
 * Procesa un mensaje normalizado: deduplica y encola.
 * NUNCA procesa IA directamente.
 */
export async function dispatch(msg: NormalizedMessage): Promise<void> {
    // 1. Deduplicar
    if (await isDuplicate(msg.id)) {
        console.log(`[Dispatcher] Duplicado ignorado: ${msg.id}`)
        return
    }

    // 2. Solo texto por ahora — otros tipos se logean y descartan
    if (msg.content.type !== "text" || !msg.content.text) {
        console.log(`[Dispatcher] Tipo "${msg.content.type}" no soportado aún, ignorando`)
        return
    }

    console.log(`[Dispatcher] Mensaje de +${msg.senderPhone}: "${msg.content.text.substring(0, 60)}"`)

    // 3. Intentar encolar en BullMQ
    try {
        const { getIncomingQueue } = await import("../queue/incoming")
        await getIncomingQueue().add("incoming-message", {
            connectionId: msg.connectionId,
            userId: msg.userId,
            senderPhone: msg.senderPhone,
            senderName: msg.senderName,
            messageContent: msg.content.text,
            messageId: msg.id,
            source: msg.provider,
            remoteJid: msg.metadata?.remoteJid as string | undefined,
        })

        console.log(`[Dispatcher] Mensaje encolado — de: +${msg.senderPhone}`)
    } catch (err) {
        // 4. Redis no disponible → guardar en DB para retry
        console.error(`[Dispatcher] Queue error:`, err instanceof Error ? err.message : err)
        await saveForRetry(msg)
    }
}
