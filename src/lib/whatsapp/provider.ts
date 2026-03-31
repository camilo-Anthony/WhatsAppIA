/**
 * WhatsApp Provider — Tipos normalizados y interface abstracta.
 * 
 * NormalizedMessage es el formato universal que usa TODO el sistema.
 * Ni la cola, ni el dispatcher, ni el agente saben si
 * el mensaje vino de Baileys o Cloud API.
 */

// ==========================================
// MENSAJE NORMALIZADO
// ==========================================

export interface NormalizedMessage {
    id: string
    type: "whatsapp"
    provider: "baileys" | "cloud_api"
    userId: string
    connectionId: string
    senderPhone: string
    senderName?: string
    content: {
        type: "text" | "image" | "audio" | "document" | "button_reply"
        text?: string
        mediaUrl?: string
        caption?: string
        mimeType?: string
    }
    timestamp: Date
    metadata?: Record<string, unknown>
}

// ==========================================
// INTERFACE ABSTRACTA
// ==========================================

export interface WhatsAppProvider {
    sendMessage(to: string, text: string): Promise<void>
    sendMedia?(to: string, media: Buffer, type: string): Promise<void>
}
