/**
 * Envío de Mensajes
 * Envía respuestas a WhatsApp con control de velocidad por conexión.
 */

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
        console.log(`[Outgoing] Rate limit para conexión ${connectionId}, esperando ${waitTime}ms`)
        await new Promise((resolve) => setTimeout(resolve, waitTime))
    }

    const updated = connectionTimestamps.get(connectionId) || []
    updated.push(Date.now())
    connectionTimestamps.set(connectionId, updated)
}

// ==========================================
// LÓGICA DE NEGOCIO
// ==========================================

export async function handleOutgoingMessage(data: OutgoingMessageJob) {
    const { connectionId, recipientJid, recipientPhone, text } = data

    console.log(`[Outgoing] Enviando mensaje a ${recipientPhone}`)

    await waitForRateLimit(connectionId)

    const connection = await prisma.whatsAppConnection.findUnique({
        where: { id: connectionId },
    })

    if (!connection) {
        console.error(`[Outgoing] Conexión ${connectionId} no encontrada`)
        return
    }

    if (connection.mode === "QR") {
        const { whatsappManager } = await import("@/lib/whatsapp/manager")
        const client = whatsappManager.getClient(connectionId)

        if (!client) {
            console.error(`[Outgoing] Cliente Baileys no encontrado para ${connectionId}`)
            throw new Error("CLIENT_NOT_FOUND")
        }

        await client.sendMessage(recipientJid, text)
    } else {
        if (!connection.waPhoneNumberId || !connection.accessToken) {
            console.error(`[Outgoing] Conexión ${connectionId} sin credenciales Cloud API`)
            return
        }

        if (connection.tokenExpiresAt && connection.tokenExpiresAt < new Date()) {
            await prisma.whatsAppConnection.update({
                where: { id: connectionId },
                data: { status: "TOKEN_EXPIRED" },
            })
            console.error(`[Outgoing] Token expirado para conexión ${connectionId}`)
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

    console.log(`[Outgoing] Mensaje enviado a ${recipientPhone}`)
    return true
}
