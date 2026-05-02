/**
 * Cola de Mensajes Entrantes
 * Recibe mensajes de WhatsApp y los envía al procesamiento de IA.
 */

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
// LÓGICA DE NEGOCIO
// ==========================================

export async function handleIncomingMessage(data: IncomingMessageJob) {
    const { connectionId, userId, senderPhone, senderName, messageContent, remoteJid } = data

    console.log(`[Incoming] Procesando mensaje de +${senderPhone}`)

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

    console.log(`[Incoming] Mensaje guardado y enviado a IA — conversación: ${conversation.id}`)
    return conversation
}
