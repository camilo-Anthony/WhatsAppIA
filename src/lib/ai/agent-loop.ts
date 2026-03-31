/**
 * Agent Loop — Loop agéntico multi-step con observabilidad.
 * 
 * Flujo:
 * 1. Construir contexto + herramientas + memoria del usuario
 * 2. Llamar Groq con tools[]
 * 3. Si respuesta = texto → fin
 * 4. Si respuesta = tool_call → ejecutar via Tool Router
 * 5. Si loop detectado (misma tool + mismos args) → fin
 * 6. Agregar resultado → volver a paso 2
 * 7. Máximo MAX_ITERATIONS iteraciones
 * 8. Guardar AgentRun para observabilidad
 */

import { buildContext } from "./context"
import { generateResponse, type AIMessage, type AIToolDefinition } from "./providers/groq"
import { getGroqTools } from "@/lib/mcp/tool-registry"
import { routeToolCall } from "@/lib/mcp/tool-router"
import { prisma } from "@/lib/db"

// ==========================================
// CONFIGURACIÓN
// ==========================================

const MAX_ITERATIONS = 5

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

export interface AgentStep {
    stepId: number
    type: "thinking" | "tool_call" | "tool_result" | "final_response"
    toolName?: string
    toolArgs?: Record<string, unknown>
    toolResult?: string
    content?: string
    durationMs: number
    tokensUsed: number
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
    // Observabilidad
    runId: string
    steps: AgentStep[]
    totalDurationMs: number
}

// ==========================================
// LOOP PRINCIPAL
// ==========================================

export async function agentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
    const { userId, clientPhone, messageContent, conversationId } = options
    const startTime = Date.now()
    const steps: AgentStep[] = []

    // 1. Construir contexto (system prompt + historial + memoria)
    const contextMessages = await buildContext({
        userId,
        clientPhone,
        incomingMessage: messageContent,
    })

    // 2. Cargar herramientas del usuario
    const groqTools = await getGroqTools(userId)
    const tools: AIToolDefinition[] = groqTools.length > 0 ? groqTools : []
    console.log(
        `[AgentLoop] ${tools.length} herramientas disponibles para usuario ${userId}${
            tools.length > 0 ? ": " + tools.map((t) => t.function.name).join(", ") : ""
        }`
    )

    // Historial de mensajes para el loop
    const messages: AIMessage[] = [...contextMessages]
    const toolsUsed: string[] = []
    let totalTokens = { prompt: 0, completion: 0, total: 0 }
    let lastToolCallSignature = ""

    // 3. Loop agéntico
    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
        const stepStart = Date.now()
        console.log(`[AgentLoop] Iteración ${iteration}/${MAX_ITERATIONS}`)

        // Llamar al modelo
        const response = await generateResponse(messages, {
            tools: tools.length > 0 ? tools : undefined,
        })

        // Fallback: A veces Llama 3 escupe las herramientas como XML en el texto en lugar del array nativo
        if (response.content && response.content.includes("<function=")) {
            const regex = /<function=([^>]+)>([\s\S]*?)<\/function>/g
            let match
            while ((match = regex.exec(response.content)) !== null) {
                response.toolCalls.push({
                    id: `call_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                    type: "function",
                    function: {
                        name: match[1],
                        arguments: match[2],
                    },
                })
            }
            response.content = response.content.replace(/<function=(?:[^>]+)>[\s\S]*?<\/function>/g, "").trim()
        }

        // Acumular tokens
        totalTokens.prompt += response.tokensUsed.prompt
        totalTokens.completion += response.tokensUsed.completion
        totalTokens.total += response.tokensUsed.total

        // Caso A: Respuesta de texto (sin tool calls) → FIN
        if (response.toolCalls.length === 0) {
            const content = response.content || "Lo siento, no pude generar una respuesta."

            steps.push({
                stepId: steps.length + 1,
                type: "final_response",
                content,
                durationMs: Date.now() - stepStart,
                tokensUsed: response.tokensUsed.total,
            })

            console.log(
                `[AgentLoop] Completado en ${iteration} iteración(es), ${toolsUsed.length} tool(s), ${totalTokens.total} tokens`
            )

            const result: AgentLoopResult = {
                response: content,
                toolsUsed,
                iterations: iteration,
                tokensUsed: totalTokens,
                runId: "",
                steps,
                totalDurationMs: Date.now() - startTime,
            }

            // Guardar observabilidad
            result.runId = await saveAgentRun(options, result)

            return result
        }

        // Caso B: Tool calls → verificar loop detection
        const currentSignature = JSON.stringify(
            response.toolCalls.map((tc) => ({
                name: tc.function.name,
                args: tc.function.arguments,
            }))
        )

        if (currentSignature === lastToolCallSignature) {
            console.warn("[AgentLoop] Loop detectado — misma herramienta con mismos args. Forzando respuesta final.")

            // Generar respuesta final sin tools
            const finalResponse = await generateResponse(messages)
            totalTokens.prompt += finalResponse.tokensUsed.prompt
            totalTokens.completion += finalResponse.tokensUsed.completion
            totalTokens.total += finalResponse.tokensUsed.total

            const result: AgentLoopResult = {
                response: finalResponse.content || "Lo siento, no pude completar la operación.",
                toolsUsed,
                iterations: iteration,
                tokensUsed: totalTokens,
                runId: "",
                steps,
                totalDurationMs: Date.now() - startTime,
            }

            result.runId = await saveAgentRun(options, result)
            return result
        }

        lastToolCallSignature = currentSignature

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

            console.log(
                `[AgentLoop] Ejecutando: ${toolName}(${JSON.stringify(toolArgs).substring(0, 100)})`
            )

            steps.push({
                stepId: steps.length + 1,
                type: "tool_call",
                toolName,
                toolArgs,
                durationMs: 0, // Se actualiza después
                tokensUsed: 0,
            })

            const toolStart = Date.now()

            // Ejecutar via Tool Router
            const toolResult = await routeToolCall({
                userId,
                toolName,
                arguments: toolArgs,
                conversationId,
            })

            toolsUsed.push(toolName)

            steps.push({
                stepId: steps.length + 1,
                type: "tool_result",
                toolName,
                toolResult: toolResult.result.substring(0, 500),
                durationMs: Date.now() - toolStart,
                tokensUsed: 0,
            })

            // Agregar resultado como mensaje de herramienta
            messages.push({
                role: "tool",
                content: toolResult.result,
                tool_call_id: toolCall.id,
            })

            console.log(
                `[AgentLoop] ${toolName}: ${toolResult.success ? "" : ""} (${toolResult.durationMs}ms)`
            )
        }
    }

    // Límite de iteraciones alcanzado
    console.warn(`[AgentLoop] Máximo de iteraciones alcanzado (${MAX_ITERATIONS})`)

    const finalResponse = await generateResponse(messages)
    totalTokens.prompt += finalResponse.tokensUsed.prompt
    totalTokens.completion += finalResponse.tokensUsed.completion
    totalTokens.total += finalResponse.tokensUsed.total

    const result: AgentLoopResult = {
        response: finalResponse.content || "Lo siento, no pude completar la operación.",
        toolsUsed,
        iterations: MAX_ITERATIONS,
        tokensUsed: totalTokens,
        runId: "",
        steps,
        totalDurationMs: Date.now() - startTime,
    }

    result.runId = await saveAgentRun(options, result)
    return result
}

// ==========================================
// OBSERVABILIDAD — Guardar AgentRun
// ==========================================

async function saveAgentRun(
    options: AgentLoopOptions,
    result: AgentLoopResult
): Promise<string> {
    try {
        const run = await prisma.agentRun.create({
            data: {
                userId: options.userId,
                conversationId: options.conversationId,
                messageContent: options.messageContent,
                response: result.response,
                iterations: result.iterations,
                totalTokens: result.tokensUsed.total,
                totalDurationMs: result.totalDurationMs,
                toolsUsed: JSON.parse(JSON.stringify(result.toolsUsed)),
                steps: JSON.parse(JSON.stringify(result.steps)),
                status: "completed",
            },
        })
        return run.id
    } catch (err) {
        console.error("[AgentLoop] Error guardando AgentRun:", err)
        return "error"
    }
}
