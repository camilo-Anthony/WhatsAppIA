import Groq from "groq-sdk"

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
})

export interface AIMessage {
    role: "system" | "user" | "assistant"
    content: string
}

export interface AIResponse {
    content: string
    tokensUsed: {
        prompt: number
        completion: number
        total: number
    }
}

export async function generateResponse(
    messages: AIMessage[],
    options?: {
        temperature?: number
        maxTokens?: number
        model?: string
    }
): Promise<AIResponse> {
    const { temperature = 0.7, maxTokens = 1024, model = "llama-3.3-70b-versatile" } = options || {}

    try {
        const completion = await groq.chat.completions.create({
            messages,
            model,
            temperature,
            max_tokens: maxTokens,
        })

        const choice = completion.choices[0]
        const content = choice?.message?.content || "Lo siento, no pude generar una respuesta."

        return {
            content,
            tokensUsed: {
                prompt: completion.usage?.prompt_tokens || 0,
                completion: completion.usage?.completion_tokens || 0,
                total: completion.usage?.total_tokens || 0,
            },
        }
    } catch (error: unknown) {
        console.error("Groq API error:", error)

        // Handle rate limiting
        if (error instanceof Error && "status" in error && (error as { status: number }).status === 429) {
            throw new Error("RATE_LIMITED")
        }

        throw new Error("AI_ERROR")
    }
}
