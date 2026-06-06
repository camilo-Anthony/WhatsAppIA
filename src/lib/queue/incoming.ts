/**
 * Cola de Mensajes Entrantes
 * Recibe mensajes de WhatsApp y los envía al procesamiento de IA.
 */

import { prisma } from "../db"
import { dispatch } from "@/lib/queue/dispatcher"
import { debounceMessage } from "@/lib/queue/debounce"
import { redactPhone } from "@/lib/utils/redact"

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
// LÓGICA DE NEGOCIO
// ==========================================

export async function handleIncomingMessage(data: IncomingMessageJob) {
    const { connectionId, userId, senderPhone, senderName, messageContent, messageId, remoteJid } = data

    // ── Deduplicación (BUG-001) ──
    // Si ya existe un mensaje con este externalId en esta conexión, ignorar.
    if (messageId) {
        const existing = await prisma.message.findFirst({
            where: { externalId: messageId, connectionId },
            select: { id: true },
        })
        if (existing) {
            console.log(`[Incoming] Duplicado ignorado: ${messageId}`)
            return null
        }
    }

    console.log(`[Incoming] Procesando mensaje de ${redactPhone(senderPhone)}`)

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

    // Guardar mensaje en PostgreSQL INMEDIATAMENTE (nunca se pierde)
    await prisma.message.create({
        data: {
            conversationId: conversation.id,
            connectionId,
            direction: "INCOMING",
            content: messageContent,
            externalId: messageId || null,
        },
    })

    // Debounce: acumular mensajes rápidos antes de enviar a IA
    const conversationId = conversation.id
    debounceMessage(
        { connectionId, userId, senderPhone, senderName, messageId, source: data.source, remoteJid },
        messageContent,
        async (combined) => {
            await dispatch("ai-processing", {
                userId: combined.userId,
                connectionId: combined.connectionId,
                conversationId,
                clientPhone: combined.senderPhone,
                messageContent: combined.messageContent,
                remoteJid: combined.remoteJid,
            })
            console.log(`[Incoming] Mensaje(s) enviados a IA — conversación: ${conversationId}`)
        }
    )

    console.log(`[Incoming] Mensaje guardado, esperando debounce — conversación: ${conversationId}`)
    return conversation
}
