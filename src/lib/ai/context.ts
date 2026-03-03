import { prisma } from "@/lib/db"
import type { AIMessage } from "@/lib/ai/providers/groq"

interface ContextOptions {
    userId: string
    clientPhone: string
    incomingMessage: string
    recentMessagesCount?: number
}

export async function buildContext(options: ContextOptions): Promise<AIMessage[]> {
    const { userId, clientPhone, incomingMessage, recentMessagesCount = 10 } = options

    // Load assistant config
    const config = await prisma.assistantConfig.findUnique({
        where: { userId },
    })

    if (!config) {
        throw new Error("ASSISTANT_NOT_CONFIGURED")
    }

    if (!config.isActive) {
        throw new Error("ASSISTANT_INACTIVE")
    }

    // Build knowledge base
    let knowledgeBase = ""

    if (config.infoMode === "SIMPLE") {
        knowledgeBase = config.simpleInfo || ""
    } else {
        // Load structured info fields
        const fields = await prisma.infoField.findMany({
            where: { userId },
            orderBy: { order: "asc" },
        })

        knowledgeBase = fields
            .map((field) => `## ${field.label}\n${field.content}`)
            .join("\n\n")
    }

    // Load recent conversation history
    const conversation = await prisma.conversation.findFirst({
        where: { userId, clientPhone },
        include: {
            messages: {
                orderBy: { timestamp: "desc" },
                take: recentMessagesCount,
            },
        },
    })

    const recentMessages = conversation?.messages?.reverse() || []

    // Build the prompt messages
    const messages: AIMessage[] = []

    // System prompt (behavior + knowledge)
    let systemPrompt = config.behaviorPrompt

    if (knowledgeBase.trim()) {
        systemPrompt += `\n\n---\n\n# INFORMACIÓN DISPONIBLE\nUsa ÚNICAMENTE la siguiente información para responder. Si la pregunta no puede ser respondida con esta información, indícalo amablemente.\n\n${knowledgeBase}`
    }

    systemPrompt += `\n\n---\n\n# REGLAS IMPORTANTES\n- Responde SOLO con la información proporcionada arriba.\n- Si no tienes información sobre algo, NO inventes respuestas.\n- Mantén las respuestas concisas y relevantes.\n- Responde en el mismo idioma que el cliente.\n- NO menciones que eres una IA a menos que te lo pregunten directamente.`

    messages.push({ role: "system", content: systemPrompt })

    // Add recent conversation history
    for (const msg of recentMessages) {
        messages.push({
            role: msg.direction === "INCOMING" ? "user" : "assistant",
            content: msg.content,
        })
    }

    // Add current message
    messages.push({ role: "user", content: incomingMessage })

    return messages
}
