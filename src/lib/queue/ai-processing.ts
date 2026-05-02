import { Queue, Worker, Job } from "bullmq"
import { getRedisConfig } from "./redis"
import { prisma } from "../db"
import { dispatch } from "@/lib/queue/dispatcher"

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
// LÓGICA DE NEGOCIO (Extraída para modo emergencia)
// ==========================================

export async function handleAIProcessing(data: AIProcessingJob) {
    const { userId, connectionId, conversationId, clientPhone, messageContent, remoteJid } = data

    console.log(`[Queue:AI] Processing AI request for +${clientPhone}`)

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
            `[Queue:AI] Response generated for +${clientPhone}: "${result.response.substring(0, 80)}..." (${result.tokensUsed.total} tokens${toolsInfo})`
        )
        return result
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Error desconocido"

        if (errorMessage === "ASSISTANT_NOT_CONFIGURED") {
            console.log(`[Queue:AI] Assistant not configured for user ${userId}`)
            return
        }

        if (errorMessage === "ASSISTANT_INACTIVE") {
            console.log(`[Queue:AI] Assistant inactive for user ${userId}`)
            return
        }

        if (errorMessage === "RATE_LIMITED") {
            console.log(`[Queue:AI] Rate limit hit (Groq API)`)
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

        console.error(`[Queue:AI] Error processing message:`, error)
        throw error
    }
}

// ==========================================
// PROCESADOR (BullMQ Wrapper)
// ==========================================

async function processAIJob(job: Job<AIProcessingJob>) {
    return handleAIProcessing(job.data)
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
