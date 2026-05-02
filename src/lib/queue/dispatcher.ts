import { NormalizedMessage } from "./provider"

export type QueueName = "incoming" | "ai-processing" | "outgoing"

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
        // Mapeo automático de mensaje normalizado a la cola entrante
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
            console.log(`[Dispatcher] Encolando en Redis: ${queue}`)
            
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
            console.error(`[Dispatcher] Fallo al encolar en Redis, reintentando via DB:`, err)
        }
    }

    // FALLBACK A BASE DE DATOS
    console.log(`[Dispatcher] MODO EMERGENCIA: Guardando job en DB para ${queue}`)
    
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
