import { Queue, Worker, Job } from "bullmq"
import { getRedisConfig } from "./redis"
import { prisma } from "@/lib/db"

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
// COLA (lazy init)
// ==========================================

let _aiQueue: Queue<AIProcessingJob> | null = null

export function getAIProcessingQueue(): Queue<AIProcessingJob> {
    if (!_aiQueue) {
        _aiQueue = new Queue<AIProcessingJob>("whatsapp-ai-processing", {
            connection: getRedisConfig(),
            defaultJobOptions: {
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 50 },
                attempts: 2,
                backoff: { type: "exponential", delay: 2000 },
            },
        })
    }
    return _aiQueue
}

export const aiProcessingQueue = { add: (...args: Parameters<Queue<AIProcessingJob>["add"]>) => getAIProcessingQueue().add(...args) }

// ==========================================
// PROCESADOR
// ==========================================

async function processAIJob(job: Job<AIProcessingJob>) {
    const { userId, connectionId, conversationId, clientPhone, messageContent, remoteJid } = job.data

    console.log(`[Cola:IA] Procesando solicitud IA para +${clientPhone}`)

    try {
        // Usar el agent pipeline determinístico (ZeroClaw-pattern)
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

        const { getOutgoingQueue } = await import("./outgoing")
        const outQueue = getOutgoingQueue()
        const recipientJid = remoteJid || `${clientPhone}@s.whatsapp.net`

        await outQueue.add("send-message", {
            connectionId,
            recipientJid,
            recipientPhone: clientPhone,
            text: result.response,
            conversationId,
        })

        const toolsInfo = result.toolsUsed.length > 0 ? ` | tools: ${result.toolsUsed.join(", ")}` : ""
        console.log(
            `[Cola:IA] Respuesta generada para +${clientPhone}: "${result.response.substring(0, 80)}..." (${result.tokensUsed.total} tokens, ${result.iterations} iter${toolsInfo})`
        )
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Error desconocido"

        if (errorMessage === "ASSISTANT_NOT_CONFIGURED") {
            console.log(`[Cola:IA] Asistente no configurado para usuario ${userId}`)
            return
        }

        if (errorMessage === "ASSISTANT_INACTIVE") {
            console.log(`[Cola:IA] Asistente inactivo para usuario ${userId}`)
            return
        }

        if (errorMessage === "RATE_LIMITED") {
            console.log(`[Cola:IA] Rate limit de Groq API`)
            const { getOutgoingQueue } = await import("./outgoing")
            const outQueue = getOutgoingQueue()
            const recipientJidRateLimit = remoteJid || `${clientPhone}@s.whatsapp.net`
            await outQueue.add("send-message", {
                connectionId,
                recipientJid: recipientJidRateLimit,
                recipientPhone: clientPhone,
                text: "Estamos procesando muchas solicitudes en este momento. Por favor intenta de nuevo en unos segundos.",
                conversationId,
            })
            throw error
        }

        console.error(`[Cola:IA] Error procesando mensaje:`, error)
        throw error
    }
}

// ==========================================
// WORKER
// ==========================================

let aiWorker: Worker<AIProcessingJob> | null = null

export function startAIProcessingWorker() {
    if (aiWorker) return aiWorker

    aiWorker = new Worker<AIProcessingJob>(
        "whatsapp-ai-processing",
        processAIJob,
        { connection: getRedisConfig(), concurrency: 5 }
    )

    aiWorker.on("completed", (job) => {
        console.log(`[Cola:IA] Job ${job.id} completado`)
    })

    aiWorker.on("failed", (job, err) => {
        console.error(`[Cola:IA] Job ${job?.id} falló:`, err.message)
    })

    console.log("[Cola:IA] Worker iniciado — concurrencia: 5")
    return aiWorker
}
