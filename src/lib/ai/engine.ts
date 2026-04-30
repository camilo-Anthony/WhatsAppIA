import { prisma } from "@/lib/db"
import { generateResponse } from "@/lib/ai/providers/groq"

interface ProcessMessageOptions {
    userId: string
    connectionId: string
    clientPhone: string
    clientName?: string
    messageContent: string
}

interface ProcessMessageResult {
    response: string
    conversationId: string
    tokensUsed: {
        prompt: number
        completion: number
        total: number
    }
}

export async function processIncomingMessage(
    options: ProcessMessageOptions
): Promise<ProcessMessageResult> {
    const { userId, connectionId, clientPhone, clientName, messageContent } = options

    // 1. Find or create conversation
    let conversation = await prisma.conversation.findFirst({
        where: { userId, clientPhone },
    })

    if (!conversation) {
        conversation = await prisma.conversation.create({
            data: {
                userId,
                clientPhone,
                clientName: clientName || null,
            },
        })
    } else if (clientName && !conversation.clientName) {
        await prisma.conversation.update({
            where: { id: conversation.id },
            data: { clientName },
        })
    }

    // 2. Verify connectionId exists, fallback to user's active connection
    let validConnectionId = connectionId
    const connectionExists = await prisma.whatsAppConnection.findUnique({
        where: { id: connectionId },
        select: { id: true },
    })

    if (!connectionExists) {
        const fallback = await prisma.whatsAppConnection.findFirst({
            where: { userId, status: "CONNECTED" },
            select: { id: true },
        })
        if (fallback) {
            validConnectionId = fallback.id
        } else {
            // Use any connection for this user
            const anyConn = await prisma.whatsAppConnection.findFirst({
                where: { userId },
                select: { id: true },
            })
            if (anyConn) {
                validConnectionId = anyConn.id
            } else {
                console.error(`[Engine] No connection found for user ${userId}`)
                throw new Error("NO_CONNECTION")
            }
        }
    }

    // 3. Store incoming message
    await prisma.message.create({
        data: {
            conversationId: conversation.id,
            connectionId: validConnectionId,
            direction: "INCOMING",
            content: messageContent,
        },
    })

    // 3. Process message using the deterministic Agent Pipeline (ZeroClaw-pattern)
    const { agentPipeline } = await import("./agent/agent-pipeline")
    const result = await agentPipeline({
        userId,
        connectionId: validConnectionId,
        conversationId: conversation.id,
        clientPhone,
        messageContent,
    })

    // 4. Store outgoing message
    await prisma.message.create({
        data: {
            conversationId: conversation.id,
            connectionId: validConnectionId,
            direction: "OUTGOING",
            content: result.response,
        },
    })

    // 5. Update conversation timestamp
    await prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
    })

    return {
        response: result.response,
        conversationId: conversation.id,
        tokensUsed: result.tokensUsed,
    }
}
