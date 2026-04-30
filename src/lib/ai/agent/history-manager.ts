/**
 * History Manager — Gestión del historial de conversación.
 *
 * Port de ZeroClaw `agent/history.rs`:
 *   - trimHistory: mantener máximo N mensajes, preservar system prompt
 *   - truncateToolResult: head(2/3) + tail(1/3) con marker
 *   - emergencyTrim: drop 1/3 de mensajes más viejos atómicamente
 *   - estimateTokens: heurística ~4 chars/token con 1.2x safety margin
 *
 * @module agent/history-manager
 */

import type { AIMessage } from "../providers/groq"

// ==========================================
// TOKEN ESTIMATION (de context_compressor.rs L82-94)
// ==========================================

/**
 * Estima tokens para un historial de mensajes.
 * Heurística: ~4 chars/token + 4 framing tokens por mensaje + 1.2x safety margin.
 * (Port de context_compressor.rs → estimate_tokens)
 */
export function estimateTokens(messages: AIMessage[]): number {
    const raw = messages.reduce((sum, m) => {
        const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content)
        return sum + Math.ceil(content.length / 4) + 4
    }, 0)
    return Math.ceil(raw * 1.2)
}

// ==========================================
// TOOL RESULT TRUNCATION (de history.rs L28-77)
// ==========================================

/**
 * Trunca un resultado de tool a `maxChars`, manteniendo head(2/3) + tail(1/3)
 * con un marker en el medio. Devuelve el input sin cambios si está dentro del límite.
 * (Port de history.rs → truncate_tool_result)
 */
export function truncateToolResult(output: string, maxChars: number): string {
    if (maxChars === 0 || output.length <= maxChars) {
        return output
    }

    const headLen = Math.floor((maxChars * 2) / 3)
    const tailLen = maxChars - headLen

    const headEnd = headLen
    const tailStart = output.length - tailLen

    // Guard contra overlap cuando maxChars es muy pequeño
    if (headEnd >= tailStart) {
        return output.substring(0, maxChars)
    }

    const truncatedChars = tailStart - headEnd
    return `${output.substring(0, headEnd)}\n\n[... ${truncatedChars} characters truncated ...]\n\n${output.substring(tailStart)}`
}

// ==========================================
// HISTORY TRIMMING (de history.rs L148-165)
// ==========================================

/**
 * Recorta historial de conversación para prevenir crecimiento ilimitado.
 * Preserva el system prompt (primer mensaje si role=system) y los mensajes más recientes.
 * (Port de history.rs → trim_history)
 */
export function trimHistory(history: AIMessage[], maxHistory: number): AIMessage[] {
    const hasSystem = history.length > 0 && history[0].role === "system"
    const nonSystemCount = hasSystem ? history.length - 1 : history.length

    if (nonSystemCount <= maxHistory) {
        return history
    }

    const start = hasSystem ? 1 : 0
    const toRemove = nonSystemCount - maxHistory

    const result = [...history]
    result.splice(start, toRemove)

    // Reparar tool results huérfanos
    return removeOrphanedToolMessages(result)
}

// ==========================================
// FAST TRIM TOOL RESULTS (de history.rs L82-97)
// ==========================================

/**
 * Trim agresivo de tool results viejos para recuperar espacio.
 * Mantiene los últimos `protectLastN` mensajes intactos.
 * Retorna total de caracteres ahorrados.
 * (Port de history.rs → fast_trim_tool_results)
 */
export function fastTrimToolResults(
    history: AIMessage[],
    protectLastN: number,
    trimTo: number = 2000
): number {
    let saved = 0
    const cutoff = Math.max(0, history.length - protectLastN)

    for (let i = 0; i < cutoff; i++) {
        const msg = history[i]
        if (msg.role === "tool" && typeof msg.content === "string" && msg.content.length > trimTo) {
            const originalLen = msg.content.length
            msg.content = truncateToolResult(msg.content, trimTo)
            saved += originalLen - msg.content.length
        }
    }

    return saved
}

// ==========================================
// EMERGENCY TRIM (de history.rs L99-132)
// ==========================================

/**
 * Emergencia: eliminar mensajes viejos no-system, no-recientes del historial.
 * Grupos de tool (assistant + consecutive tool messages) se eliminan atómicamente.
 * Retorna número de mensajes eliminados.
 * (Port de history.rs → emergency_history_trim)
 */
export function emergencyHistoryTrim(
    history: AIMessage[],
    keepRecent: number
): { trimmed: AIMessage[]; dropped: number } {
    const result = [...history]
    let dropped = 0
    const targetDrop = Math.floor(result.length / 3)

    let i = 0
    while (dropped < targetDrop && i < result.length - keepRecent) {
        if (result[i].role === "system") {
            i++
            continue
        }

        if (result[i].role === "assistant") {
            // Contar tool messages siguientes — eliminar como grupo atómico
            let toolCount = 0
            while (
                i + 1 + toolCount < result.length - keepRecent &&
                result[i + 1 + toolCount].role === "tool"
            ) {
                toolCount++
            }
            result.splice(i, 1 + toolCount)
            dropped += 1 + toolCount
        } else {
            result.splice(i, 1)
            dropped++
        }
    }

    return {
        trimmed: removeOrphanedToolMessages(result),
        dropped,
    }
}

// ==========================================
// ORPHAN REPAIR (de history_pruner.rs)
// ==========================================

/**
 * Elimina mensajes de tipo "tool" que no tienen un "assistant" tool_call precedente.
 * Previene errores 400 "unexpected tool_use_id in tool_result blocks".
 */
function removeOrphanedToolMessages(history: AIMessage[]): AIMessage[] {
    const result: AIMessage[] = []

    for (let i = 0; i < history.length; i++) {
        if (history[i].role === "tool") {
            // Verificar que el mensaje anterior es un assistant (con tool calls)
            const prev = result[result.length - 1]
            if (!prev || (prev.role !== "assistant" && prev.role !== "tool")) {
                // Huérfano — omitir
                continue
            }
        }
        result.push(history[i])
    }

    return result
}
