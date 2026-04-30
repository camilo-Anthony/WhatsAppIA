/**
 * Error Handler — Manejo de errores del pipeline del agente.
 *
 * Cubre los errores identificados en el análisis de ZeroClaw:
 *   - Groq rate limit (429) → retry con exponential backoff
 *   - Context length exceeded → comprimir y reintentar
 *   - Tool execution failure → error limpio, no crash
 *   - Network timeout → retry 2 veces, luego disculpa
 *   - Invalid JSON from LLM → retry con temperature más baja
 *   - Loop detected → abort turn, responder error amigable
 *
 * @module agent/error-handler
 */

// ==========================================
// ERROR TYPES
// ==========================================

export type AgentErrorType =
    | "RATE_LIMIT"
    | "CONTEXT_OVERFLOW"
    | "TOOL_FAILURE"
    | "NETWORK_ERROR"
    | "INVALID_JSON"
    | "LOOP_DETECTED"
    | "MAX_ITERATIONS"
    | "UNKNOWN"

export interface AgentError {
    type: AgentErrorType
    message: string
    retryable: boolean
    userMessage: string
}

// ==========================================
// ERROR CLASSIFICATION
// ==========================================

/**
 * Clasifica un error y determina si es retryable + mensaje para el usuario.
 */
export function classifyError(error: unknown): AgentError {
    const message = error instanceof Error ? error.message : String(error)
    const lower = message.toLowerCase()

    // Rate limit (429)
    if (lower.includes("429") || lower.includes("rate limit") || lower.includes("too many requests")) {
        return {
            type: "RATE_LIMIT",
            message,
            retryable: true,
            userMessage: "Estoy procesando muchas solicitudes en este momento. Dame unos segundos e intenta de nuevo.",
        }
    }

    // Context overflow
    if (lower.includes("context length") || lower.includes("token") && lower.includes("exceed")) {
        return {
            type: "CONTEXT_OVERFLOW",
            message,
            retryable: true,
            userMessage: "La conversación se ha vuelto muy larga. Déjame resumirla para poder continuar.",
        }
    }

    // Network errors
    if (lower.includes("econnrefused") || lower.includes("timeout") || lower.includes("fetch failed") || lower.includes("network")) {
        return {
            type: "NETWORK_ERROR",
            message,
            retryable: true,
            userMessage: "Tuve un problema de conexión. Intenta enviar tu mensaje de nuevo.",
        }
    }

    // Invalid JSON from LLM
    if (lower.includes("json") && (lower.includes("parse") || lower.includes("unexpected token"))) {
        return {
            type: "INVALID_JSON",
            message,
            retryable: true,
            userMessage: "Tuve un problema procesando tu mensaje. ¿Podrías reformularlo?",
        }
    }

    // Unknown
    return {
        type: "UNKNOWN",
        message,
        retryable: false,
        userMessage: "Ocurrió un error inesperado. Por favor intenta de nuevo.",
    }
}

// ==========================================
// RETRY WITH BACKOFF
// ==========================================

/**
 * Ejecuta una función con retry y exponential backoff.
 *
 * @param fn — Función async a ejecutar
 * @param maxRetries — Máximo de reintentos (default 2)
 * @param baseDelayMs — Delay base en ms (default 1000)
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 2,
    baseDelayMs: number = 1000
): Promise<T> {
    let lastError: unknown

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn()
        } catch (error) {
            lastError = error
            const classified = classifyError(error)

            if (!classified.retryable || attempt === maxRetries) {
                throw error
            }

            // Exponential backoff: 1s, 2s, 4s
            const delay = baseDelayMs * Math.pow(2, attempt)
            console.warn(
                `[ErrorHandler] Retry ${attempt + 1}/${maxRetries} after ${delay}ms — ${classified.type}: ${classified.message}`
            )
            await sleep(delay)
        }
    }

    throw lastError
}

// ==========================================
// CONTEXT OVERFLOW DETECTION
// ==========================================

/**
 * Extrae el límite real de context window de un mensaje de error.
 * Port de context_compressor.rs → parse_context_limit_from_error.
 */
export function parseContextLimitFromError(errorMsg: string): number | null {
    const patterns = [
        /maximum context length is (\d{4,})/i,
        /context (?:length|size|window) (?:is|of|:)?\s*(\d{4,})/i,
        /(\d{4,})\s*(?:tokens?\s*)?(?:context|limit)/i,
        /available context size\s*\(\s*(\d{4,})/i,
    ]

    for (const pattern of patterns) {
        const match = errorMsg.match(pattern)
        if (match && match[1]) {
            const limit = parseInt(match[1], 10)
            if (limit >= 1024 && limit <= 10_000_000) {
                return limit
            }
        }
    }

    return null
}

// ==========================================
// USER-FRIENDLY ERROR MESSAGES
// ==========================================

/** Mensaje amigable cuando el loop detector dispara un break */
export const LOOP_BREAK_MESSAGE =
    "No pude completar esa acción después de varios intentos. ¿Podrías describir lo que necesitas de otra manera?"

/** Mensaje cuando se exceden las iteraciones máximas */
export const MAX_ITERATIONS_MESSAGE =
    "Tu solicitud requiere más pasos de los que puedo procesar. ¿Podrías simplificar lo que necesitas?"

/** Mensaje cuando llega un tipo de media no soportado */
export const UNSUPPORTED_MEDIA_MESSAGE =
    "Por el momento solo puedo procesar mensajes de texto. ¿Podrías escribir lo que necesitas?"

// ==========================================
// HELPERS
// ==========================================

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
