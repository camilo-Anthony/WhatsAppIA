/**
 * Loop Detector — Detección de patrones repetitivos en tool calls.
 *
 * Port directo de ZeroClaw `agent/loop_detector.rs`.
 * Monitorea una sliding window de tool calls recientes y detecta 3 patrones:
 *
 * 1. Exact Repeat — misma tool + mismos args 3+ veces consecutivas
 * 2. Ping-Pong — dos tools alternando (A→B→A→B) 4+ ciclos
 * 3. No Progress — misma tool 5+ veces con args diferentes pero mismo resultado
 *
 * Escalación: Warning → Block → Break (circuit breaker)
 *
 * @module agent/loop-detector
 */

import type { LoopDetectionResult, ToolCallRecord } from "./types"
import {
    LOOP_DETECTOR_WINDOW_SIZE,
    LOOP_DETECTOR_MAX_REPEATS,
} from "./types"
import { createHash } from "crypto"

// ==========================================
// HASH HELPERS
// ==========================================

/**
 * Hash determinístico para un valor JSON.
 * Ordena keys recursivamente para que {a:1,b:2} y {b:2,a:1} sean iguales.
 * (Port de loop_detector.rs → hash_value + canonicalise)
 */
function hashValue(value: unknown): string {
    const canonical = canonicalise(value)
    return createHash("md5").update(JSON.stringify(canonical)).digest("hex")
}

/** Ordena keys de objetos recursivamente para hash determinístico */
function canonicalise(value: unknown): unknown {
    if (value === null || value === undefined) return value
    if (Array.isArray(value)) return value.map(canonicalise)
    if (typeof value === "object") {
        const sorted: Record<string, unknown> = {}
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            sorted[key] = canonicalise((value as Record<string, unknown>)[key])
        }
        return sorted
    }
    return value
}

function hashString(s: string): string {
    return createHash("md5").update(s).digest("hex")
}

// ==========================================
// LOOP DETECTOR
// ==========================================

export class LoopDetector {
    private window: ToolCallRecord[] = []
    private readonly windowSize: number
    private readonly maxRepeats: number
    private enabled: boolean

    constructor(config?: {
        enabled?: boolean
        windowSize?: number
        maxRepeats?: number
    }) {
        this.enabled = config?.enabled ?? true
        this.windowSize = config?.windowSize ?? LOOP_DETECTOR_WINDOW_SIZE
        this.maxRepeats = config?.maxRepeats ?? LOOP_DETECTOR_MAX_REPEATS
    }

    /**
     * Registrar una tool call completada y verificar patrones.
     *
     * @param name — nombre de la herramienta (ej: "google_calendar__create_event")
     * @param args — argumentos JSON enviados a la herramienta
     * @param result — output textual de la herramienta
     * @returns Resultado de detección (ok, warning, block, break)
     */
    record(name: string, args: Record<string, unknown>, result: string): LoopDetectionResult {
        if (!this.enabled) {
            return { type: "ok" }
        }

        const record: ToolCallRecord = {
            name,
            argsHash: hashValue(args),
            resultHash: hashString(result),
        }

        // Mantener sliding window
        if (this.window.length >= this.windowSize) {
            this.window.shift()
        }
        this.window.push(record)

        // Ejecutar detectores en orden de severidad (más severo primero)
        const exactRepeat = this.detectExactRepeat()
        if (exactRepeat) return exactRepeat

        const pingPong = this.detectPingPong()
        if (pingPong) return pingPong

        const noProgress = this.detectNoProgress()
        if (noProgress) return noProgress

        return { type: "ok" }
    }

    /** Resetear la ventana de detección */
    reset(): void {
        this.window = []
    }

    // ── Pattern 1: Exact Repeat ──────────────────────────────────

    /**
     * Detecta misma tool + mismos args llamados N+ veces consecutivas.
     *
     * Escalación:
     * - N == maxRepeats     → Warning
     * - N == maxRepeats + 1 → Block
     * - N >= maxRepeats + 2 → Break (circuit breaker)
     */
    private detectExactRepeat(): LoopDetectionResult | null {
        if (this.window.length < this.maxRepeats) return null

        const last = this.window[this.window.length - 1]
        let consecutive = 0

        for (let i = this.window.length - 1; i >= 0; i--) {
            const r = this.window[i]
            if (r.name === last.name && r.argsHash === last.argsHash) {
                consecutive++
            } else {
                break
            }
        }

        if (consecutive >= this.maxRepeats + 2) {
            return {
                type: "break",
                message: `Circuit breaker: tool '${last.name}' called ${consecutive} times consecutively with identical arguments`,
            }
        }
        if (consecutive > this.maxRepeats) {
            return {
                type: "block",
                message: `Blocked: tool '${last.name}' called ${consecutive} times consecutively with identical arguments`,
            }
        }
        if (consecutive >= this.maxRepeats) {
            return {
                type: "warning",
                message: `Warning: tool '${last.name}' has been called ${consecutive} times consecutively with identical arguments. Try a different approach.`,
            }
        }

        return null
    }

    // ── Pattern 2: Ping-Pong ─────────────────────────────────────

    /**
     * Detecta dos tools alternando (A→B→A→B) durante 4+ ciclos completos.
     *
     * Escalación:
     * - 4 ciclos  → Warning
     * - 5 ciclos  → Block
     * - 6+ ciclos → Break
     */
    private detectPingPong(): LoopDetectionResult | null {
        const MIN_CYCLES = 4
        const needed = MIN_CYCLES * 2

        if (this.window.length < needed) return null

        const tail = this.window.slice(-needed).reverse()
        const aName = tail[0].name
        const bName = tail[1].name

        if (aName === bName) return null

        const isPingPong = tail.every((r, i) =>
            i % 2 === 0 ? r.name === aName : r.name === bName
        )

        if (!isPingPong) return null

        // Contar ciclos totales para escalación
        let cycles = MIN_CYCLES
        const extended = [...this.window].reverse()
        for (let i = needed; i + 1 < extended.length; i += 2) {
            if (extended[i].name === aName && extended[i + 1].name === bName) {
                cycles++
            } else {
                break
            }
        }

        if (cycles >= MIN_CYCLES + 2) {
            return {
                type: "break",
                message: `Circuit breaker: tools '${aName}' and '${bName}' have been alternating for ${cycles} cycles`,
            }
        }
        if (cycles > MIN_CYCLES) {
            return {
                type: "block",
                message: `Blocked: tools '${aName}' and '${bName}' have been alternating for ${cycles} cycles`,
            }
        }
        return {
            type: "warning",
            message: `Warning: tools '${aName}' and '${bName}' appear to be alternating (${cycles} cycles). Consider a different strategy.`,
        }
    }

    // ── Pattern 3: No Progress ───────────────────────────────────

    /**
     * Detecta misma tool llamada 5+ veces con args diferentes
     * pero produciendo el mismo resultado hash cada vez.
     *
     * Escalación:
     * - 5 calls → Warning
     * - 6 calls → Block
     * - 7+ calls → Break
     */
    private detectNoProgress(): LoopDetectionResult | null {
        const MIN_CALLS = 5

        if (this.window.length < MIN_CALLS) return null

        const last = this.window[this.window.length - 1]
        const sameToolSameResult: ToolCallRecord[] = []

        for (let i = this.window.length - 1; i >= 0; i--) {
            const r = this.window[i]
            if (r.name === last.name && r.resultHash === last.resultHash) {
                sameToolSameResult.push(r)
            } else {
                break
            }
        }

        const count = sameToolSameResult.length
        if (count < MIN_CALLS) return null

        // Verificar que tienen args DIFERENTES (si son iguales, exact_repeat lo maneja)
        const uniqueArgs = new Set(sameToolSameResult.map((r) => r.argsHash))
        if (uniqueArgs.size < 2) return null

        if (count >= MIN_CALLS + 2) {
            return {
                type: "break",
                message: `Circuit breaker: tool '${last.name}' called ${count} times with different arguments but identical results — no progress`,
            }
        }
        if (count > MIN_CALLS) {
            return {
                type: "block",
                message: `Blocked: tool '${last.name}' called ${count} times with different arguments but identical results`,
            }
        }
        return {
            type: "warning",
            message: `Warning: tool '${last.name}' called ${count} times with different arguments but identical results. The current approach may not be making progress.`,
        }
    }
}
