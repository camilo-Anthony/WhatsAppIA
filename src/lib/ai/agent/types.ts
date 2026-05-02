/**
 * Agent Types — Definiciones de tipos para el pipeline determinístico.
 *
 * Inspirado en ZeroClaw:
 *   - tools/traits.rs → ToolResult, ToolSpec, AgentTool
 *   - agent/agent.rs  → ConversationState, AgentConfig
 *   - agent/loop_detector.rs → LoopDetectionResult
 *   - agent/context_compressor.rs → CompressionResult
 *
 * @module agent/types
 */

// ==========================================
// TOOL SYSTEM (de tools/traits.rs)
// ==========================================

/** Resultado de ejecución de una herramienta */
export interface ToolResult {
    success: boolean
    output: string
    error?: string
}

/** Especificación de herramienta para el LLM */
export interface ToolSpec {
    name: string
    description: string
    parameters: Record<string, unknown>
}

/** Tool call parseado de la respuesta del LLM */
export interface ParsedToolCall {
    name: string
    arguments: Record<string, unknown>
    toolCallId?: string
}

/** Resultado de ejecución de tool call */
export interface ToolExecutionOutcome {
    name: string
    output: string
    success: boolean
    toolCallId?: string
    durationMs: number
}

// ==========================================
// CONVERSATION STATE (propio, multi-turn WhatsApp)
// ==========================================

/** Estados de la máquina de estados de conversación */
export type ConversationState =
    | "idle"             // Sin conversación activa, esperando input
    | "collecting_slots" // Recolectando datos faltantes uno a uno
    | "confirming"       // Mostrando resumen, esperando sí/no
    | "executing"        // Ejecutando tool, generando respuesta

/** Contexto persistido en PostgreSQL para cada conversación */
export interface ConversationContext {
    userId: string
    contactPhone: string
    state: ConversationState
    /** Intent pendiente (ej: "google_calendar__create_event") */
    pendingIntent?: string
    /** Datos ya recolectados (ej: { date: "2026-05-01", reason: "Consulta" }) */
    collectedSlots: Record<string, unknown>
    /** Slots que aún faltan (ej: ["time", "clientName"]) */
    missingSlots: string[]
    /** Timestamp de última actualización */
    lastUpdated: number
}

// ==========================================
// INTENT CLASSIFICATION (de agent/classifier.rs)
// ==========================================

/** Resultado de clasificación de intención */
export interface ClassificationResult {
    /** Intent detectado (nombre de tool o categoría: greeting, info, unknown) */
    intent: string
    /** Confianza 0-1 */
    confidence: number
    /** Datos extraídos del mensaje (ej: { date: "mañana", reason: "corte" }) */
    extractedSlots: Record<string, unknown>
    /** Slots requeridos que no se encontraron */
    missingSlots: string[]
}

// ==========================================
// LOOP DETECTION (de agent/loop_detector.rs)
// ==========================================

/** Resultado de detección de loop — escalación Warning → Block → Break */
export type LoopDetectionResult =
    | { type: "ok" }
    | { type: "warning"; message: string }
    | { type: "block"; message: string }
    | { type: "break"; message: string }

/** Registro de una tool call en la sliding window */
export interface ToolCallRecord {
    name: string
    argsHash: string
    resultHash: string
}

// ==========================================
// CONTEXT COMPRESSION (de agent/context_compressor.rs)
// ==========================================

/** Resultado de compresión de contexto */
export interface CompressionResult {
    compressed: boolean
    tokensBefore: number
    tokensAfter: number
    passesUsed: number
}

/** Configuración del compresor de contexto */
export interface ContextCompressionConfig {
    enabled: boolean
    /** Ratio del context window que dispara compresión (default 0.5) */
    thresholdRatio: number
    /** Mensajes protegidos al inicio (default 3) */
    protectFirstN: number
    /** Mensajes protegidos al final (default 4) */
    protectLastN: number
    /** Max chars para tool results en re-trim (default 2000) */
    toolResultRetrimChars: number
    /** Máximo de pasadas de compresión (default 3) */
    maxPasses: number
    /** Max chars del summary generado (default 4000) */
    summaryMaxChars: number
    /** Timeout en segundos para LLM summarization (default 30) */
    timeoutSecs: number
}

// ==========================================
// PROMPT BUILDER (de agent/system_prompt.rs + personality.rs)
// ==========================================

/** Sección del system prompt */
export interface PromptSection {
    name: string
    build(ctx: PromptContext): string
}

/** Contexto disponible para construir el prompt */
export interface PromptContext {
    /** behaviorPrompt del AssistantConfig (= IDENTITY.md) */
    identity: string
    /** Reglas determinísticas fijas (= SOUL.md) */
    soul: string
    /** Tools disponibles para este usuario */
    tools: ToolSpec[]
    /** Info del negocio (InfoFields) */
    businessInfo: Array<{ label: string; value: string }>
    /** Nombre del modelo LLM */
    modelName: string
    /** Timestamp actual */
    timestamp: string
}

// ==========================================
// AGENT PIPELINE
// ==========================================

/** Opciones de entrada al pipeline (compatible con AgentLoopOptions) */
export interface AgentPipelineOptions {
    userId: string
    connectionId: string
    conversationId: string
    clientPhone: string
    messageContent: string
}

/** Resultado del pipeline (compatible con AgentLoopResult) */
export interface AgentPipelineResult {
    response: string
    toolsUsed: string[]
    iterations: number
    tokensUsed: {
        prompt: number
        completion: number
        total: number
    }
    runId: string
    steps: AgentStep[]
    totalDurationMs: number
    /** Estado final de la conversación */
    finalState: ConversationState
}

/** Paso de ejecución para observabilidad */
export interface AgentStep {
    stepId: number
    type: "classify" | "collect_slot" | "confirm" | "tool_call" | "tool_result" | "response" | "error"
    toolName?: string
    toolArgs?: Record<string, unknown>
    toolResult?: string
    content?: string
    durationMs: number
    tokensUsed: number
}

// ==========================================
// DEFAULTS (de config schemas)
// ==========================================

export const DEFAULT_COMPRESSION_CONFIG: ContextCompressionConfig = {
    enabled: true,
    thresholdRatio: 0.5,
    protectFirstN: 3,
    protectLastN: 4,
    toolResultRetrimChars: 2000,
    maxPasses: 3,
    summaryMaxChars: 4000,
    timeoutSecs: 30,
}

/** Max iteraciones del tool loop (de ZeroClaw default) */
export const MAX_TOOL_ITERATIONS = 5

/** Tamaño de ventana del loop detector */
export const LOOP_DETECTOR_WINDOW_SIZE = 20

/** Repeticiones antes de escalar */
export const LOOP_DETECTOR_MAX_REPEATS = 3



/** Context window de Llama 3.3 70B */
export const MODEL_CONTEXT_WINDOW = 128_000
