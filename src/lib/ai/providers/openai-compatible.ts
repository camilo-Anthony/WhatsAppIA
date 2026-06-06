/**
 * Proveedor Genérico de IA compatible con OpenAI
 * Usado para integrar Mistral, OpenRouter y otros proveedores sin dependencias adicionales.
 */

import { AIMessage, AIToolCall, AIToolDefinition, AIResponse } from "./groq"

export async function generateOpenAICompatibleResponse(
    messages: AIMessage[],
    options: {
        temperature?: number
        maxTokens?: number
        model: string
        tools?: AIToolDefinition[]
    },
    config: {
        apiKey: string
        baseUrl: string
    }
): Promise<AIResponse> {
    const { temperature = 0.7, maxTokens = 1024, model, tools } = options
    const { apiKey, baseUrl } = config

    const body: any = {
        model,
        messages: messages.map((m) => {
            if (m.role === "tool") {
                return {
                    role: "tool",
                    content: m.content || "",
                    tool_call_id: m.tool_call_id || "",
                }
            }
            if (m.role === "assistant" && m.tool_calls?.length) {
                return {
                    role: "assistant",
                    content: m.content,
                    tool_calls: m.tool_calls.map((tc) => ({
                        id: tc.id,
                        type: "function",
                        function: {
                            name: tc.function.name,
                            arguments: tc.function.arguments,
                        },
                    })),
                }
            }
            return {
                role: m.role,
                content: m.content || "",
            }
        }),
        temperature,
        max_tokens: maxTokens,
    }

    if (tools && tools.length > 0) {
        body.tools = tools.map((t) => ({
            type: "function",
            function: {
                name: t.function.name,
                description: t.function.description,
                parameters: t.function.parameters,
            },
        }))
        body.tool_choice = "auto"
    }

    try {
        const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
                "HTTP-Referer": "https://whatsappia.com", // Requerido por OpenRouter
                "X-Title": "WhatsApp IA", // Requerido por OpenRouter
            },
            body: JSON.stringify(body),
        })

        if (response.status === 429) {
            throw new Error("RATE_LIMITED")
        }

        if (!response.ok) {
            const errText = await response.text()
            throw new Error(`API_ERROR: ${response.status} - ${errText}`)
        }

        const data = await response.json()
        const choice = data.choices?.[0]
        const message = choice?.message

        const toolCalls: AIToolCall[] = (message?.tool_calls || []).map((tc: any) => ({
            id: tc.id,
            type: "function",
            function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
            },
        }))

        return {
            content: message?.content || null,
            toolCalls,
            tokensUsed: {
                prompt: data.usage?.prompt_tokens || 0,
                completion: data.usage?.completion_tokens || 0,
                total: data.usage?.total_tokens || 0,
            },
        }
    } catch (error: any) {
        console.error(`OpenAI-compatible provider (${baseUrl}) error:`, error)
        if (error.message === "RATE_LIMITED") {
            throw error
        }
        throw new Error("AI_ERROR")
    }
}
