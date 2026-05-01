/**
 * Proveedor de IA — Groq SDK
 * Soporta chat completions + tool calling para el loop agéntico.
 */

import Groq from "groq-sdk"

let groq: Groq;
export function getGroqClient() {
    if (!groq) {
        groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }
    return groq;
}

// ==========================================
// TIPOS
// ==========================================

export interface AIMessage {
    role: "system" | "user" | "assistant" | "tool"
    content: string | null
    tool_calls?: AIToolCall[]
    tool_call_id?: string
}

export interface AIToolCall {
    id: string
    type: "function"
    function: {
        name: string
        arguments: string
    }
}

export interface AIToolDefinition {
    type: "function"
    function: {
        name: string
        description: string
        parameters: Record<string, unknown>
    }
}

export interface AIResponse {
    content: string | null
    toolCalls: AIToolCall[]
    tokensUsed: {
        prompt: number
        completion: number
        total: number
    }
}

// ==========================================
// GENERACIÓN
// ==========================================

export async function generateResponse(
    messages: AIMessage[],
    options?: {
        temperature?: number
        maxTokens?: number
        model?: string
        tools?: AIToolDefinition[]
    }
): Promise<AIResponse> {
    const {
        temperature = 0.7,
        maxTokens = 1024,
        model = process.env.GROQ_MODEL || "llama-3.1-8b-instant",
        tools,
    } = options || {}

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const requestParams: any = {
            messages: messages.map((m) => {
                if (m.role === "tool") {
                    return {
                        role: "tool" as const,
                        content: m.content || "",
                        tool_call_id: m.tool_call_id || "",
                    }
                }
                if (m.role === "assistant" && m.tool_calls?.length) {
                    return {
                        role: "assistant" as const,
                        content: m.content,
                        tool_calls: m.tool_calls.map((tc) => ({
                            id: tc.id,
                            type: "function" as const,
                            function: {
                                name: tc.function.name,
                                arguments: tc.function.arguments,
                            },
                        })),
                    }
                }
                return {
                    role: m.role as "system" | "user" | "assistant",
                    content: m.content || "",
                }
            }),
            model,
            temperature,
            max_tokens: maxTokens,
        }

        // Solo agregar tools si hay disponibles
        if (tools && tools.length > 0) {
            requestParams.tools = tools.map((t) => ({
                type: "function" as const,
                function: {
                    name: t.function.name,
                    description: t.function.description,
                    parameters: t.function.parameters,
                },
            }))
            requestParams.tool_choice = "auto"
        }

        const completion = await getGroqClient().chat.completions.create(requestParams)

        const choice = completion.choices[0]
        const message = choice?.message

        // Extraer tool calls si existen
        const toolCalls: AIToolCall[] = (message?.tool_calls || []).map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
            },
        }))

        return {
            content: message?.content || null,
            toolCalls,
            tokensUsed: {
                prompt: completion.usage?.prompt_tokens || 0,
                completion: completion.usage?.completion_tokens || 0,
                total: completion.usage?.total_tokens || 0,
            },
        }
    } catch (error: unknown) {
        console.error("Groq API error:", error)

        if (error instanceof Error && "status" in error && (error as { status: number }).status === 429) {
            throw new Error("RATE_LIMITED")
        }

        throw new Error("AI_ERROR")
    }
}
