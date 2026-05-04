/**
 * Procesamiento de IA
 * Genera respuestas usando el pipeline de agente IA.
 */

import { prisma } from "../db"
import { dispatch } from "@/lib/queue/dispatcher"
import { redactPhone } from "@/lib/utils/redact"

// ==========================================
// TIPOS
// ==========================================

export interface AIProcessingJob {
    userId: string
    connectionId: string
    conversationId: string
    clientPhone: string
    messageContent: string
    remoteJid?: string
}

// ==========================================
// LÓGICA DE NEGOCIO
// ==========================================

export async function handleAIProcessing(data: AIProcessingJob) {
    const { userId, connectionId, conversationId, clientPhone, messageContent, remoteJid } = data

    console.log(`[AI] Procesando request de IA para ${redactPhone(clientPhone)}`)

    try {
        const { agentPipeline } = await import("@/lib/ai/agent/agent-pipeline")

        const result = await agentPipeline({
            userId,
            connectionId,
            conversationId,
            clientPhone,
            messageContent,
        })

        await prisma.message.create({
            data: {
                conversationId,
                connectionId,
                direction: "OUTGOING",
                content: result.response,
            },
        })

        await prisma.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
        })

        const recipientJid = remoteJid || `${clientPhone}@s.whatsapp.net`

        await dispatch("outgoing", {
            connectionId,
            recipientJid,
            recipientPhone: clientPhone,
            text: result.response,
            conversationId,
        })

        const toolsInfo = result.toolsUsed.length > 0 ? ` | tools: ${result.toolsUsed.join(", ")}` : ""
        console.log(
            `[AI] Respuesta generada para +${clientPhone}: "${result.response.substring(0, 80)}..." (${result.tokensUsed.total} tokens${toolsInfo})`
        )
        return result
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Error desconocido"

        if (errorMessage === "ASSISTANT_NOT_CONFIGURED") {
            console.log(`[AI] Asistente no configurado para usuario ${userId}`)
            return
        }

        if (errorMessage === "ASSISTANT_INACTIVE") {
            console.log(`[AI] Asistente inactivo para usuario ${userId}`)
            return
        }

        if (errorMessage === "RATE_LIMITED") {
            console.log(`[AI] Rate limit (Groq API)`)
            const recipientJidRateLimit = remoteJid || `${clientPhone}@s.whatsapp.net`
            await dispatch("outgoing", {
                connectionId,
                recipientJid: recipientJidRateLimit,
                recipientPhone: clientPhone,
                text: "Estamos procesando muchas solicitudes en este momento. Por favor intenta de nuevo en unos segundos.",
                conversationId,
            })
            throw error
        }

        console.error(`[AI] Error procesando mensaje:`, error)
        throw error
    }
}
