/**
 * Agent Loop — Loop agéntico que permite al modelo ejecutar herramientas.
 * 
 * Flujo:
 * 1. Construir contexto + herramientas del usuario
 * 2. Llamar Groq con tools[]
 * 3. Si respuesta = texto → fin
 * 4. Si respuesta = tool_call → ejecutar via Tool Router
 * 5. Agregar resultado → volver a paso 2
 * 6. Máximo MAX_ITERATIONS iteraciones
 */

import { buildContext } from "./context"
import { generateResponse, type AIMessage, type AIToolDefinition } from "./providers/groq"
import { getGroqTools } from "@/lib/mcp/tool-registry"
import { routeToolCall } from "@/lib/mcp/tool-router"

// ==========================================
// CONFIGURACIÓN
// ==========================================

const MAX_ITERATIONS = 2

// ==========================================
// TIPOS
// ==========================================

export interface AgentLoopOptions {
    userId: string
    connectionId: string
    conversationId: string
    clientPhone: string
    messageContent: string
}

export interface AgentLoopResult {
    response: string
    toolsUsed: string[]
    iterations: number
    tokensUsed: {
        prompt: number
        completion: number
        total: number
    }
}

// ==========================================
// LOOP PRINCIPAL
// ==========================================

export async function agentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
    const { userId, clientPhone, messageContent, conversationId } = options

    // 1. Construir contexto (system prompt + historial)
    const contextMessages = await buildContext({
        userId,
        clientPhone,
        incomingMessage: messageContent,
    })

    // 2. Cargar herramientas del usuario
    const groqTools = await getGroqTools(userId)
    const tools: AIToolDefinition[] = groqTools.length > 0 ? groqTools : []
    console.log(`[AgentLoop] ${tools.length} herramientas disponibles para usuario ${userId}${tools.length > 0 ? ': ' + tools.map(t => t.function.name).join(', ') : ''}`)

    // Historial de mensajes para el loop
    const messages: AIMessage[] = [...contextMessages]
    const toolsUsed: string[] = []
    let totalTokens = { prompt: 0, completion: 0, total: 0 }

    // 3. Loop agéntico
    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
        console.log(`[AgentLoop] Iteración ${iteration}/${MAX_ITERATIONS}`)

        // Llamar al modelo
        const response = await generateResponse(messages, {
            tools: tools.length > 0 ? tools : undefined,
        })

        // Acumular tokens
        totalTokens.prompt += response.tokensUsed.prompt
        totalTokens.completion += response.tokensUsed.completion
        totalTokens.total += response.tokensUsed.total

        // Caso A: Respuesta de texto (sin tool calls) → FIN
        if (response.toolCalls.length === 0) {
            const content = response.content || "Lo siento, no pude generar una respuesta."

            console.log(
                `[AgentLoop] Completado en ${iteration} iteración(es), ${toolsUsed.length} tool(s) usadas, ${totalTokens.total} tokens`
            )

            return {
                response: content,
                toolsUsed,
                iterations: iteration,
                tokensUsed: totalTokens,
            }
        }

        // Caso B: Tool calls → ejecutar herramientas
        // Agregar mensaje del asistente con tool_calls
        messages.push({
            role: "assistant",
            content: response.content,
            tool_calls: response.toolCalls,
        })

        // Ejecutar cada tool call
        for (const toolCall of response.toolCalls) {
            const toolName = toolCall.function.name
            let toolArgs: Record<string, unknown> = {}

            try {
                toolArgs = JSON.parse(toolCall.function.arguments)
            } catch {
                toolArgs = {}
            }

            console.log(`[AgentLoop] Ejecutando: ${toolName}(${JSON.stringify(toolArgs).substring(0, 100)})`)

            // Ejecutar via Tool Router
            const toolResult = await routeToolCall({
                userId,
                toolName,
                arguments: toolArgs,
                conversationId,
            })

            toolsUsed.push(toolName)

            // Agregar resultado como mensaje de herramienta
            messages.push({
                role: "tool",
                content: toolResult.result,
                tool_call_id: toolCall.id,
            })

            console.log(
                `[AgentLoop] ${toolName}: ${toolResult.success ? "✓" : "✗"} (${toolResult.durationMs}ms)`
            )
        }
    }

    // Límite de iteraciones alcanzado — generar respuesta final sin tools
    console.warn(`[AgentLoop] Máximo de iteraciones alcanzado (${MAX_ITERATIONS})`)

    const finalResponse = await generateResponse(messages)
    totalTokens.prompt += finalResponse.tokensUsed.prompt
    totalTokens.completion += finalResponse.tokensUsed.completion
    totalTokens.total += finalResponse.tokensUsed.total

    return {
        response: finalResponse.content || "Lo siento, no pude completar la operación.",
        toolsUsed,
        iterations: MAX_ITERATIONS,
        tokensUsed: totalTokens,
    }
}
