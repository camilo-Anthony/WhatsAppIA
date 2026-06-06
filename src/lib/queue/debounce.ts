/**
 * Message Debounce — Acumula mensajes rápidos del mismo cliente.
 * 
 * Cuando un usuario de WhatsApp envía varios mensajes cortos seguidos
 * ("hola", "cuanto", "el precio"), este módulo los acumula y los envía
 * como un solo mensaje al pipeline de IA.
 * 
 * Usa solo Map en memoria (cero dependencias externas).
 * Los mensajes se guardan en PostgreSQL ANTES del debounce (en el webhook),
 * así que si el servidor se reinicia, no se pierden — solo no se combinan.
 * 
 * Flujo:
 * 1. Webhook guarda mensaje en PostgreSQL (seguro)
 * 2. Debounce acumula texto en RAM y programa timer de 6s
 * 3. Si llega otro mensaje → reinicia timer, acumula texto
 * 4. Si pasan 6s sin más mensajes → ejecuta callback con texto combinado
 * 5. Máximo 20s de espera total
 */

// Buffer en memoria por teléfono
const buffers = new Map<string, {
    messages: string[]
    meta: DebouncedMeta
    timer: NodeJS.Timeout
    firstAt: number
}>()

const DEBOUNCE_MS = 8000    // Espera 8 segundos de silencio
const MAX_WAIT_MS = 30000   // Máximo 30 segundos de espera total

interface DebouncedMeta {
    connectionId: string
    userId: string
    senderPhone: string
    senderName?: string
    messageId: string
    source: "baileys" | "cloud_api"
    remoteJid?: string
}

export interface DebouncedResult {
    connectionId: string
    userId: string
    senderPhone: string
    senderName?: string
    messageContent: string
    messageId: string
    source: "baileys" | "cloud_api"
    remoteJid?: string
}

type FlushCallback = (data: DebouncedResult) => Promise<void>

/**
 * Acumula un mensaje y programa su procesamiento.
 * Si ya hay mensajes pendientes del mismo teléfono, los combina.
 * 
 * IMPORTANTE: el mensaje ya fue guardado en PostgreSQL por el webhook.
 * Este debounce solo controla CUÁNDO se envía al pipeline de IA.
 */
export function debounceMessage(
    meta: DebouncedMeta,
    messageContent: string,
    onFlush: FlushCallback
): void {
    const key = meta.senderPhone
    const existing = buffers.get(key)

    if (existing) {
        // Ya hay mensajes pendientes — acumular y reiniciar timer
        existing.messages.push(messageContent)
        clearTimeout(existing.timer)

        // ¿Ya pasó el máximo de espera?
        const elapsed = Date.now() - existing.firstAt
        const waitTime = elapsed >= MAX_WAIT_MS ? 0 : DEBOUNCE_MS

        existing.timer = setTimeout(() => flush(key, onFlush), waitTime)
    } else {
        // Primer mensaje — crear buffer y programar timer
        const timer = setTimeout(() => flush(key, onFlush), DEBOUNCE_MS)
        buffers.set(key, {
            messages: [messageContent],
            meta,
            timer,
            firstAt: Date.now(),
        })
    }
}

/**
 * Envía todos los mensajes acumulados como uno solo.
 */
function flush(phone: string, onFlush: FlushCallback): void {
    const buf = buffers.get(phone)
    if (!buf) return

    buffers.delete(phone)

    const combined = buf.messages.join(" ")
    console.log(`[Debounce] Flush ${phone}: ${buf.messages.length} msgs → "${combined.substring(0, 80)}"`)

    onFlush({
        ...buf.meta,
        messageContent: combined,
    }).catch(err => {
        console.error("[Debounce] Error en flush callback:", err)
    })
}
