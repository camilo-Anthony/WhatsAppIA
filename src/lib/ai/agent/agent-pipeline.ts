/**
 * Agent Pipeline — Loop de control determinístico del agente.
 *
 * Este módulo es el cerebro del agente: coordina todos los demás módulos
 * para procesar cada mensaje de forma predecible.
 *
 * Flujo (6 pasos):
 * 1. Cargar config + tools + estado de conversación
 * 2. Construir system prompt modular (prompt-builder)
 * 3. Clasificar intención (intent-classifier)
 * 4. State machine: idle → collecting → confirming → executing
 * 5. Ejecutar tools con loop detection + error handling
 * 6. Comprimir contexto si necesario (history-manager)
 *
 * @module agent/agent-pipeline
 */

import { prisma } from "@/lib/db"
import { generateResponse, type AIMessage, type AIToolDefinition } from "../providers/llm"
import { getUserTools } from "@/lib/mcp/tool-registry"
import { routeToolCall } from "@/lib/mcp/tool-router"
import { getMemories, saveMemory, decayMemories } from "@/lib/agent-memory"
import { LightRAGClient } from "../rag/lightrag-client"
import {
    escapePromptContent,
    sanitizeModelInput,
    SECURITY_REFUSAL_MESSAGE,
    validateModelOutput,
} from "@/lib/security/guardrails"

// Agent modules
import type {
    AgentPipelineOptions,
    AgentPipelineResult,
    AgentStep,
    ToolSpec,
} from "./types"
import { buildSystemPrompt, createPromptContext } from "./prompt-builder"
import { classifyIntent, quickClassify } from "./intent-classifier"
import {
    getConversationState,
    transitionState,
    resetToIdle,
    isCancellationMessage,
    isConfirmationMessage,
} from "./conversation-state"
import { LoopDetector } from "./loop-detector"
import { trimHistory, fastTrimToolResults } from "./history-manager"
import {
    classifyError,
    withRetry,
    LOOP_BREAK_MESSAGE,
} from "./error-handler"

// ==========================================
// PIPELINE PRINCIPAL
// ==========================================

export async function agentPipeline(
    options: AgentPipelineOptions
): Promise<AgentPipelineResult> {
    const result = await agentPipelineInner(options)
    
    // Trigger learning asynchronously — saves facts to PostgreSQL (agent_memories)
    try {
        const { userId, clientPhone, messageContent } = options
        const connectionScope = await prisma.whatsAppConnection.findUnique({
            where: { id: options.connectionId },
            select: { assistantConfigId: true },
        })
        const assistantConfigId = connectionScope?.assistantConfigId ?? null
        if (result.response && !isTrivialMessage(messageContent)) {
            const lowerRes = result.response.toLowerCase()
            if (!lowerRes.includes("cancelado") && !lowerRes.includes("error") && !lowerRes.includes("no autorizado")) {
                learnFromInteraction(
                    userId,
                    assistantConfigId,
                    clientPhone,
                    messageContent,
                    result.response
                ).catch(err => console.error("[DynamicLearning] Background task error:", err))
            }
        }
        // Degradar memorias antiguas ~1 de cada 10 interacciones (limpieza automática)
        if (Math.random() < 0.1) {
            decayMemories(userId, assistantConfigId).catch(() => {})
        }
    } catch (e) {
        console.error("[DynamicLearning] Error resolving connection for learning:", e)
    }

    return result
}

async function agentPipelineInner(
    options: AgentPipelineOptions
): Promise<AgentPipelineResult> {
    const { userId, connectionId, conversationId, clientPhone, messageContent: rawMessage } = options
    const startTime = Date.now()
    const steps: AgentStep[] = []
    const totalTokens = { prompt: 0, completion: 0, total: 0 }
    let stepCounter = 0

    // ── 0. VALIDACIÓN DE ENTRADA ─────────────────────────────

    // Mensajes vacíos o solo espacios/emojis sin texto útil
    const trimmedMessage = rawMessage?.trim() || ""
    if (trimmedMessage.length === 0) {
        return errorResult(
            "Por ahora solo puedo leer mensajes de texto. ¿En qué te puedo ayudar?",
            startTime,
            steps
        )
    }

    const MAX_MESSAGE_LENGTH = 2000
    const inputSecurity = sanitizeModelInput(trimmedMessage, { maxLength: MAX_MESSAGE_LENGTH })

    if (inputSecurity.decision === "block" || inputSecurity.decision === "quarantine") {
        console.warn(`[AgentPipeline] Entrada bloqueada por seguridad: ${inputSecurity.reasons.join(", ")}`)
        return errorResult(SECURITY_REFUSAL_MESSAGE, startTime, steps)
    }

    const messageContent = inputSecurity.sanitized

    try {
        // ── 1. CARGAR CONFIG + TOOLS + ESTADO ────────────────────

        const [connection, userTools, convState] = await Promise.all([
            prisma.whatsAppConnection.findUnique({ 
                where: { id: connectionId },
                include: { assistantConfig: true }
            }),
            getUserTools(userId),
            getConversationState(userId, clientPhone),
        ])

        if (!connection || !connection.isAssistantActive || !connection.assistantConfig) {
            return errorResult("El asistente no está configurado o está inactivo.", startTime, steps)
        }
        
        const config = connection.assistantConfig

        // Convertir RegisteredTool[] a ToolSpec[] para el prompt builder
        const toolSpecs: ToolSpec[] = userTools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.groqTool.function.parameters,
        }))

        // Cargar conocimiento configurado
        const businessInfo = await loadBusinessInfo(userId, config, messageContent)

        // ── 2. CONSTRUIR SYSTEM PROMPT ───────────────────────────

        const promptContext = createPromptContext({
            behaviorPrompt: config.behaviorPrompt,
            tools: toolSpecs,
            businessInfo,
        })
        const systemPrompt = buildSystemPrompt(promptContext)

        // ── 3. CARGAR HISTORIAL + MEMORIA ────────────────────────

        const conversation = await prisma.conversation.findFirst({
            where: { userId, clientPhone },
            include: {
                messages: {
                    orderBy: { timestamp: "desc" },
                    take: 20,
                },
            },
        })

        const recentMessages = conversation?.messages?.reverse() || []
        const memories = await getMemories({ userId, assistantConfigId: config.id, phone: clientPhone, limit: 15 })

        // Construir historial de mensajes
        let historyPrompt = systemPrompt
        if (memories.length > 0) {
            historyPrompt += "\n\n<MEMORY trusted=\"true\" authority=\"low\">\n"
            let charBudget = 2000 // ~500 tokens max para memorias
            for (const m of memories) {
                const line = `- ${escapePromptContent(m.key, 50)}: ${escapePromptContent(m.value, 200)}\n`
                if (charBudget - line.length < 0) break
                charBudget -= line.length
                historyPrompt += line
            }
            historyPrompt += "</MEMORY>"
        }

        const messages: AIMessage[] = [{ role: "system", content: historyPrompt }]

        for (const msg of recentMessages) {
            const safeContent = msg.direction === "INCOMING"
                ? escapePromptContent(msg.content, MAX_MESSAGE_LENGTH)
                : validateModelOutput(msg.content).sanitized

            messages.push({
                role: msg.direction === "INCOMING" ? "user" : "assistant",
                content: msg.direction === "INCOMING"
                    ? `<USER_MESSAGE trusted="false" authority="user">\n${safeContent}\n</USER_MESSAGE>`
                    : safeContent,
            })
        }

        messages.push({
            role: "user",
            content: `<USER_MESSAGE trusted="false" authority="user">\n${escapePromptContent(messageContent, MAX_MESSAGE_LENGTH)}\n</USER_MESSAGE>`,
        })

        // Trim si excede límite
        const MAX_HISTORY = 50
        const trimmed = trimHistory(messages, MAX_HISTORY)
        const finalMessages = trimmed.length < messages.length ? trimmed : messages

        // Fast-trim tool results viejos
        fastTrimToolResults(finalMessages, 4)

        // ── 4. MANEJAR CANCELACIÓN ───────────────────────────────

        if (convState.state !== "idle" && isCancellationMessage(messageContent)) {
            await resetToIdle(userId, clientPhone)
            return simpleResponse(
                "Entendido, he cancelado la operación. ¿En qué más puedo ayudarte?",
                startTime,
                steps,
                totalTokens,
                "idle"
            )
        }

        // ── 5. MANEJAR CONFIRMACIÓN ──────────────────────────────

        if (convState.state === "confirming" && isConfirmationMessage(messageContent)) {
            // Ejecutar la acción pendiente con los slots recolectados
            if (convState.pendingIntent) {
                const execResult = await executeToolAction(
                    userId,
                    convState.pendingIntent,
                    convState.collectedSlots,
                    finalMessages,
                    toolSpecs,
                    steps,
                    stepCounter,
                    totalTokens
                )

                await resetToIdle(userId, clientPhone)
                return {
                    ...execResult,
                    runId: conversationId,
                    totalDurationMs: Date.now() - startTime,
                    finalState: "idle",
                }
            }
        }

        if (convState.state === "confirming" && !isConfirmationMessage(messageContent)) {
            await resetToIdle(userId, clientPhone)
            
            const cancelResponse = "Entendido, he cancelado la acción. ¿En qué más puedo ayudarte?"
            steps.push({
                stepId: stepCounter++,
                type: "response",
                content: cancelResponse,
                durationMs: Date.now() - startTime,
                tokensUsed: 0,
            })
            
            return {
                response: cancelResponse,
                toolsUsed: [],
                iterations: 1,
                tokensUsed: totalTokens,
                steps,
                runId: conversationId,
                totalDurationMs: Date.now() - startTime,
                finalState: "idle"
            }
        }

        // ── 6. CLASIFICAR INTENCIÓN ──────────────────────────────

        // Quick classification (sin LLM) para ahorrar tokens
        let classification = quickClassify(messageContent)

        if (!classification) {
            // Si estamos recolectando slots, el intent es "followup"
            if (convState.state === "collecting_slots") {
                classification = {
                    intent: "followup",
                    confidence: 0.9,
                    extractedSlots: {},
                    missingSlots: [],
                }
            } else {
                // LLM classification
                const classifyStart = Date.now()
                classification = await withRetry(() =>
                    classifyIntent(messageContent, convState, toolSpecs)
                )
                steps.push({
                    stepId: stepCounter++,
                    type: "classify",
                    content: `intent=${classification.intent} (${classification.confidence})`,
                    durationMs: Date.now() - classifyStart,
                    tokensUsed: 0,
                })
            }
        }

        // ── 7. PROCESAR SEGÚN INTENT ─────────────────────────────

        const { intent, extractedSlots } = classification

        // 7a. Greeting → responder con LLM (sin tools)
        if (intent === "greeting" || intent === "info" || intent === "unknown") {
            return await generateSimpleLLMResponse(
                finalMessages,
                startTime,
                steps,
                stepCounter,
                totalTokens
            )
        }

        // 7b. Followup (recolectando slots) → extraer datos y continuar
        if (intent === "followup" && convState.state === "collecting_slots") {
            return await handleSlotCollection(
                userId,
                clientPhone,
                messageContent,
                convState,
                finalMessages,
                toolSpecs,
                startTime,
                steps,
                stepCounter,
                totalTokens
            )
        }

        // 7c. Tool action → verificar slots y ejecutar/recolectar
        const matchedTool = toolSpecs.find((t) => t.name === intent || t.name.endsWith(`__${intent}`))
        if (matchedTool) {
            // Reasignar intent al nombre real de la tool (con prefijo) por si el LLM lo omitió
            const actualIntent = matchedTool.name;
            // Merge slots extraídos
            const allSlots = { ...convState.collectedSlots, ...extractedSlots }
            const missing = classification.missingSlots

            if (missing.length > 0) {
                // Faltan datos → transicionar a collecting_slots
                await transitionState(userId, clientPhone, "collecting_slots", {
                    pendingIntent: actualIntent,
                    collectedSlots: allSlots,
                    missingSlots: missing,
                })

                // Preguntar por el primer slot faltante
                return await askForSlot(
                    missing[0],
                    actualIntent,
                    allSlots,
                    finalMessages,
                    startTime,
                    steps,
                    stepCounter,
                    totalTokens
                )
            }

            // Todos los slots presentes → confirmar
            const isReadOnly = isReadOnlyTool(actualIntent)

            if (isReadOnly) {
                // Read-only tools se ejecutan directo
                const execResult = await executeToolAction(
                    userId,
                    actualIntent,
                    allSlots,
                    finalMessages,
                    toolSpecs,
                    steps,
                    stepCounter,
                    totalTokens
                )
                await resetToIdle(userId, clientPhone)
                return {
                    ...execResult,
                    runId: conversationId,
                    totalDurationMs: Date.now() - startTime,
                    finalState: "idle",
                }
            } else {
                // Write tools → pedir confirmación
                await transitionState(userId, clientPhone, "confirming", {
                    pendingIntent: actualIntent,
                    collectedSlots: allSlots,
                    missingSlots: [],
                })

                return await askForConfirmation(
                    actualIntent,
                    allSlots,
                    finalMessages,
                    startTime,
                    steps,
                    stepCounter,
                    totalTokens
                )
            }
        }

        // 7d. Fallback → LLM sin tools
        return await generateSimpleLLMResponse(
            finalMessages,
            startTime,
            steps,
            stepCounter,
            totalTokens
        )

    } catch (error) {
        const classified = classifyError(error)
        console.error(`[AgentPipeline] ${classified.type}:`, classified.message)

        return errorResult(classified.userMessage, startTime, steps)
    }
}

// ==========================================
// TOOL EXECUTION WITH LOOP DETECTION
// ==========================================

async function executeToolAction(
    userId: string,
    toolName: string,
    args: Record<string, unknown>,
    messages: AIMessage[],
    toolSpecs: ToolSpec[],
    steps: AgentStep[],
    stepCounter: number,
    totalTokens: { prompt: number; completion: number; total: number }
): Promise<Omit<AgentPipelineResult, "runId" | "totalDurationMs" | "finalState">> {
    const startTime = Date.now()
    const loopDetector = new LoopDetector()
    const toolsUsed: string[] = []
    const groqTools: AIToolDefinition[] = toolSpecs.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
    }))

    // Ejecutar tool directamente
    const execStart = Date.now()

    steps.push({
        stepId: stepCounter++,
        type: "tool_call",
        toolName,
        toolArgs: args,
        durationMs: 0,
        tokensUsed: 0,
    })

    const result = await withRetry(() =>
        routeToolCall({
            userId,
            toolName,
            arguments: args,
        })
    )

    toolsUsed.push(toolName)

    steps.push({
        stepId: stepCounter++,
        type: "tool_result",
        toolName,
        toolResult: result.result.substring(0, 500),
        content: result.success ? "success" : "error",
        durationMs: Date.now() - execStart,
        tokensUsed: 0,
    })

    // Loop detection
    const loopResult = loopDetector.record(toolName, args, result.result)
    if (loopResult.type === "break") {
        return {
            response: LOOP_BREAK_MESSAGE,
            toolsUsed,
            iterations: 1,
            tokensUsed: totalTokens,
            steps,
        }
    }

    // Generar respuesta final basada en el resultado del tool
    const toolCallId = `call_${Date.now()}`
    
    const toolResultMessages: AIMessage[] = [
        ...messages,
        {
            role: "assistant",
            content: null,
            tool_calls: [{
                id: toolCallId,
                type: "function",
                function: {
                    name: toolName,
                    arguments: JSON.stringify(args),
                },
            }],
        },
        {
            role: "tool",
            content: result.result,
            tool_call_id: toolCallId,
        },
    ]

    const llmResponse = await withRetry(() =>
        generateResponse(toolResultMessages, {
            temperature: 0.7,
            maxTokens: 512,
            tools: groqTools,
        })
    )

    totalTokens.prompt += llmResponse.tokensUsed.prompt
    totalTokens.completion += llmResponse.tokensUsed.completion
    totalTokens.total += llmResponse.tokensUsed.total

    const finalResponse = finalizeModelResponse(
        llmResponse.content || "Listo, la accion fue completada."
    )

    steps.push({
        stepId: stepCounter++,
        type: "response",
        content: finalResponse.substring(0, 200),
        durationMs: Date.now() - startTime,
        tokensUsed: llmResponse.tokensUsed.total,
    })

    return {
        response: finalResponse,
        toolsUsed,
        iterations: 1,
        tokensUsed: totalTokens,
        steps,
    }
}

// ==========================================
// SLOT COLLECTION
// ==========================================

async function handleSlotCollection(
    userId: string,
    clientPhone: string,
    message: string,
    convState: Awaited<ReturnType<typeof getConversationState>>,
    messages: AIMessage[],
    toolSpecs: ToolSpec[],
    startTime: number,
    steps: AgentStep[],
    stepCounter: number,
    totalTokens: { prompt: number; completion: number; total: number }
): Promise<AgentPipelineResult> {
    // Usar LLM para extraer datos del mensaje del usuario
    const extraction = await withRetry(() =>
        classifyIntent(message, convState, toolSpecs)
    )

    const newSlots = { ...convState.collectedSlots, ...extraction.extractedSlots }
    const remaining = convState.missingSlots.filter(
        (s) => !(s in extraction.extractedSlots)
    )

    if (remaining.length > 0) {
        // Aún faltan datos
        await transitionState(userId, clientPhone, "collecting_slots", {
            collectedSlots: newSlots,
            missingSlots: remaining,
        })

        return await askForSlot(
            remaining[0],
            convState.pendingIntent || "",
            newSlots,
            messages,
            startTime,
            steps,
            stepCounter,
            totalTokens
        )
    }

    // Todos los datos completos → confirmar
    const intent = convState.pendingIntent || ""
    const isReadOnly_ = isReadOnlyTool(intent)

    if (isReadOnly_) {
        const execResult = await executeToolAction(
            userId,
            intent,
            newSlots,
            messages,
            toolSpecs,
            steps,
            stepCounter,
            totalTokens
        )
        await resetToIdle(userId, clientPhone)
        return {
            ...execResult,
            runId: "",
            totalDurationMs: Date.now() - startTime,
            finalState: "idle",
        }
    }

    await transitionState(userId, clientPhone, "confirming", {
        collectedSlots: newSlots,
        missingSlots: [],
    })

    return await askForConfirmation(
        intent,
        newSlots,
        messages,
        startTime,
        steps,
        stepCounter,
        totalTokens
    )
}

// ==========================================
// LLM HELPERS
// ==========================================

async function generateSimpleLLMResponse(
    messages: AIMessage[],
    startTime: number,
    steps: AgentStep[],
    stepCounter: number,
    totalTokens: { prompt: number; completion: number; total: number }
): Promise<AgentPipelineResult> {
    const llmStart = Date.now()
    const response = await withRetry(() =>
        generateResponse(messages, {
            temperature: 0.7,
            maxTokens: 512,
        })
    )

    totalTokens.prompt += response.tokensUsed.prompt
    totalTokens.completion += response.tokensUsed.completion
    totalTokens.total += response.tokensUsed.total

    const finalResponse = finalizeModelResponse(response.content || "En que puedo ayudarte?")
    response.content = finalResponse

    steps.push({
        stepId: stepCounter,
        type: "response",
        content: finalResponse.substring(0, 200),
        durationMs: Date.now() - llmStart,
        tokensUsed: response.tokensUsed.total,
    })

    return {
        response: response.content || "¿En qué puedo ayudarte?",
        toolsUsed: [],
        iterations: 1,
        tokensUsed: totalTokens,
        runId: "",
        steps,
        totalDurationMs: Date.now() - startTime,
        finalState: "idle",
    }
}

async function askForSlot(
    slotName: string,
    intentName: string,
    collectedSlots: Record<string, unknown>,
    messages: AIMessage[],
    startTime: number,
    steps: AgentStep[],
    stepCounter: number,
    totalTokens: { prompt: number; completion: number; total: number }
): Promise<AgentPipelineResult> {
    // Agregar instrucción específica para pedir el slot
    const safeIntentName = escapePromptContent(intentName, 120)
    const safeSlotName = escapePromptContent(slotName, 120)
    const safeSlots = escapePromptContent(JSON.stringify(collectedSlots), 1500)

    const askMessages: AIMessage[] = [
        ...messages,
        {
            role: "system",
            content: `El usuario quiere ejecutar "${intentName}". Ya tengo estos datos: ${JSON.stringify(collectedSlots)}. Necesito preguntarle por: "${slotName}". Haz UNA sola pregunta natural y concisa para obtener ese dato. NO menciones nombres técnicos de campos.`,
        },
    ]

    askMessages[askMessages.length - 1].content =
        `El usuario quiere ejecutar "${safeIntentName}". Ya tengo estos datos saneados: ${safeSlots}. Necesito preguntarle por: "${safeSlotName}". Haz UNA sola pregunta natural y concisa para obtener ese dato. No menciones nombres tecnicos de campos.`

    return await generateSimpleLLMResponse(
        askMessages,
        startTime,
        steps,
        stepCounter,
        totalTokens
    )
}

async function askForConfirmation(
    intentName: string,
    slots: Record<string, unknown>,
    messages: AIMessage[],
    startTime: number,
    steps: AgentStep[],
    stepCounter: number,
    totalTokens: { prompt: number; completion: number; total: number }
): Promise<AgentPipelineResult> {
    const safeIntentName = escapePromptContent(intentName, 120)
    const safeSlots = escapePromptContent(JSON.stringify(slots), 1500)

    const confirmMessages: AIMessage[] = [
        ...messages,
        {
            role: "system",
            content: `El usuario quiere ejecutar "${intentName}" con estos datos: ${JSON.stringify(slots)}. Muestra un resumen claro y natural de la acción que voy a realizar y pregunta "¿Confirmas?". Sé conciso, máximo 2-3 oraciones.`,
        },
    ]

    confirmMessages[confirmMessages.length - 1].content =
        `El usuario quiere ejecutar "${safeIntentName}" con estos datos saneados: ${safeSlots}. Muestra un resumen claro y natural de la accion que voy a realizar y pregunta "Confirmas?". Se conciso, maximo 2-3 oraciones.`

    const result = await generateSimpleLLMResponse(
        confirmMessages,
        startTime,
        steps,
        stepCounter,
        totalTokens
    )

    return { ...result, finalState: "confirming" }
}

// ==========================================
// HELPERS
// ==========================================

async function loadBusinessInfo(
    userId: string,
    config: { id: string; infoMode: string; simpleInfo: string | null },
    userQuery?: string
): Promise<Array<{ label: string; value: string }>> {
    if (config.infoMode === "RAG" && userQuery) {
        try {
            const ragClient = new LightRAGClient()
            const context = await ragClient.query(config.id, userQuery, "hybrid")
            if (context && context.trim().length > 0) {
                return [{ label: "Información relevante de base de conocimiento", value: context }]
            }
        } catch (err) {
            console.error("[loadBusinessInfo] Error al consultar LightRAG:", err)
        }
        return []
    }

    if (config.simpleInfo) {
        config.simpleInfo = escapePromptContent(config.simpleInfo, 2000)
    }

    if (config.infoMode === "SIMPLE") {
        return config.simpleInfo
            ? [{ label: "Información", value: config.simpleInfo }]
            : []
    }

    let fields = await prisma.infoField.findMany({
        where: { userId, assistantConfigId: config.id },
        orderBy: { order: "asc" },
    })

    if (fields.length === 0) {
        fields = await prisma.infoField.findMany({
            where: { userId, assistantConfigId: null },
            orderBy: { order: "asc" },
        })
    }

    for (const field of fields) {
        field.label = escapePromptContent(field.label, 80)
        field.content = escapePromptContent(field.content, 2000)
    }

    return fields.map((f) => ({ label: f.label, value: f.content }))
}

function isReadOnlyTool(toolName: string): boolean {
    const readOnlyPatterns = [
        "check_availability",
        "list_events",
        "search",
        "get_",
        "list_",
        "fetch_",
        "read_",
        "query_",
    ]
    const lower = toolName.toLowerCase()
    return readOnlyPatterns.some((p) => lower.includes(p))
}

function finalizeModelResponse(response: string): string {
    const validation = validateModelOutput(response)

    if (!validation.allowed) {
        console.warn(`[AgentPipeline] Salida del modelo bloqueada: ${validation.reasons.join(", ")}`)
    }

    let finalStr = validation.sanitized || SECURITY_REFUSAL_MESSAGE
    
    // Eliminar etiquetas XML que el modelo pequeño pueda alucinar (ej: <USER_RESPONSE>)
    finalStr = finalStr.replace(/<[^>]+>/g, "").trim()
    
    // Eliminar asteriscos si envuelven absolutamente todo el mensaje
    finalStr = finalStr.replace(/^\*+([^*]+)\*+$/g, "$1").trim()

    return finalStr
}

function errorResult(
    message: string,
    startTime: number,
    steps: AgentStep[]
): AgentPipelineResult {
    return {
        response: message,
        toolsUsed: [],
        iterations: 0,
        tokensUsed: { prompt: 0, completion: 0, total: 0 },
        runId: "",
        steps,
        totalDurationMs: Date.now() - startTime,
        finalState: "idle",
    }
}

function simpleResponse(
    message: string,
    startTime: number,
    steps: AgentStep[],
    totalTokens: { prompt: number; completion: number; total: number },
    state: AgentPipelineResult["finalState"]
): AgentPipelineResult {
    return {
        response: message,
        toolsUsed: [],
        iterations: 0,
        tokensUsed: totalTokens,
        runId: "",
        steps,
        totalDurationMs: Date.now() - startTime,
        finalState: state,
    }
}

/**
 * Aprendizaje dinámico: Extrae hechos de la interacción y los guarda en PostgreSQL (agent_memories).
 * Cada hecho se almacena como key-value aislado por teléfono del cliente.
 */
async function learnFromInteraction(
    userId: string,
    assistantConfigId: string | null,
    clientPhone: string,
    userMessage: string,
    assistantResponse: string
): Promise<void> {
    try {
        const extractionPrompt = `Analiza esta interacción y extrae datos factuales del usuario.
Responde SOLO en formato JSON array. Cada elemento debe tener "key" (categoría corta) y "value" (dato concreto).
Categorías válidas: nombre, telefono, empresa, cargo, preferencia, direccion, email, dato_clave.
Si no hay información relevante, responde: []

Ejemplo de respuesta:
[{"key": "nombre", "value": "Camilo"}, {"key": "empresa", "value": "HostalApp"}]

Interacción:
Usuario: ${userMessage}
Asistente: ${assistantResponse}

JSON:`

        const response = await generateResponse([
            { role: "system", content: "Extrae hechos factuales en formato JSON array. Solo hechos confirmados del usuario. Responde SOLO el JSON, nada más." },
            { role: "user", content: extractionPrompt }
        ], {
            temperature: 0.1,
            maxTokens: 256
        })

        const raw = response.content?.trim()
        if (!raw || raw === "[]" || raw.length < 5) return

        // Parse JSON from response (handle markdown code blocks)
        let jsonStr = raw
        const jsonMatch = raw.match(/\[[\s\S]*\]/)
        if (jsonMatch) jsonStr = jsonMatch[0]

        const facts: Array<{ key: string; value: string }> = JSON.parse(jsonStr)
        if (!Array.isArray(facts) || facts.length === 0) return

        console.log(`[DynamicLearning] ${facts.length} hechos extraídos para ${clientPhone}`)

        for (const fact of facts) {
            if (fact.key && fact.value) {
                await saveMemory({
                    userId,
                    assistantConfigId,
                    phone: clientPhone,
                    key: fact.key,
                    value: fact.value,
                    category: "fact",
                })
            }
        }

        console.log(`[DynamicLearning] Hechos guardados en PostgreSQL para ${clientPhone}`)
    } catch (error) {
        console.error("[DynamicLearning] Error en aprendizaje dinámico:", error)
    }
}

/**
 * Detecta mensajes triviales que NO contienen información útil para aprender.
 * Evita gastar tokens de Groq en extracción de hechos vacía.
 */
function isTrivialMessage(msg: string): boolean {
    const clean = msg.trim().toLowerCase()
    
    // Muy corto (menos de 10 chars) → trivial
    if (clean.length < 10) return true
    
    // Solo emojis/símbolos
    if (/^[\p{Emoji}\s\p{P}]+$/u.test(clean)) return true
    
    // Palabras triviales comunes en WhatsApp
    const trivialPatterns = [
        /^(hola|hi|hey|buenas?|buenos?\s*(d[ií]as?|tardes?|noches?))\s*[!.?]*$/,
        /^(ok|okey|okay|dale|vale|listo|perfecto|genial|gracias|grax|thx|thanks)\s*[!.?]*$/,
        /^(s[ií]|no|claro|ya|bueno|bien|exacto|correcto)\s*[!.?]*$/,
        /^(chao|bye|adi[oó]s|hasta\s*luego|nos\s*vemos)\s*[!.?]*$/,
        /^(ja+|je+|ji+|jo+|ha+|he+|lol|xd+|jaj[aj]*)\s*[!.?]*$/,
        /^[👍👌🙏❤️😊😂🤣💪✅]+$/,
    ]
    
    return trivialPatterns.some(p => p.test(clean))
}
