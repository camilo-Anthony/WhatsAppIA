import { prisma } from "@/lib/db"
import { buildContext } from "@/lib/ai/context"
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

    // 2. Store incoming message
    await prisma.message.create({
        data: {
            conversationId: conversation.id,
            connectionId,
            direction: "INCOMING",
            content: messageContent,
        },
    })

    // 3. Build AI context
    const contextMessages = await buildContext({
        userId,
        clientPhone,
        incomingMessage: messageContent,
    })

    // 4. Generate AI response
    const aiResponse = await generateResponse(contextMessages)

    // 5. Store outgoing message
    await prisma.message.create({
        data: {
            conversationId: conversation.id,
            connectionId,
            direction: "OUTGOING",
            content: aiResponse.content,
        },
    })

    // 6. Update conversation timestamp
    await prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
    })

    return {
        response: aiResponse.content,
        conversationId: conversation.id,
        tokensUsed: aiResponse.tokensUsed,
    }
}
