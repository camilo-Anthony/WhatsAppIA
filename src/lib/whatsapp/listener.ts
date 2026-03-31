/**
 * WhatsApp Listener — Parsea eventos crudos de Baileys a NormalizedMessage.
 * 
 * Responsabilidad ÚNICA: convertir un WAMessage de Baileys al formato
 * normalizado del sistema. No encola, no deduplica, no procesa.
 */

import { jidNormalizedUser, type proto } from "@whiskeysockets/baileys"
import type { NormalizedMessage } from "./provider"

type WAMessage = proto.IWebMessageInfo

// ==========================================
// PARSER PRINCIPAL
// ==========================================

/**
 * Convierte un mensaje crudo de Baileys a NormalizedMessage.
 * Retorna null si el mensaje debe ignorarse (fromMe, grupos, vacío).
 */
export function handleBaileysMessage(
    rawMsg: WAMessage,
    connectionId: string,
    userId: string
): NormalizedMessage | null {
    // Filtros básicos
    if (!rawMsg.message || !rawMsg.key || rawMsg.key.fromMe) return null

    const remoteJid = rawMsg.key.remoteJid
    if (!remoteJid) return null

    // Solo chats personales (no grupos)
    const isPersonalChat =
        remoteJid.endsWith("@s.whatsapp.net") || remoteJid.endsWith("@lid")
    if (!isPersonalChat) return null

    // Parsear contenido
    const content = extractContent(rawMsg)
    if (!content) return null

    const normalizedJid = jidNormalizedUser(remoteJid)
    
    const senderPhone = normalizedJid
        .replace("@s.whatsapp.net", "")
        .replace("@lid", "")

    return {
        id: rawMsg.key?.id || `${remoteJid}-${Date.now()}`,
        type: "whatsapp",
        provider: "baileys",
        userId,
        connectionId,
        senderPhone,
        senderName: rawMsg.pushName || undefined,
        content,
        timestamp: new Date(),
        metadata: { remoteJid: normalizedJid }
    }
}

// ==========================================
// EXTRACCIÓN DE CONTENIDO (multi-tipo)
// ==========================================

function extractContent(
    msg: WAMessage
): NormalizedMessage["content"] | null {
    const m = msg.message!

    // Texto plano o texto citado
    if (m.conversation || m.extendedTextMessage) {
        return {
            type: "text",
            text: m.conversation || m.extendedTextMessage?.text || "",
        }
    }

    // Imagen con caption
    if (m.imageMessage) {
        return {
            type: "image",
            caption: m.imageMessage.caption || undefined,
            mimeType: m.imageMessage.mimetype || undefined,
        }
    }

    // Audio / nota de voz
    if (m.audioMessage) {
        return {
            type: "audio",
            mimeType: m.audioMessage.mimetype || undefined,
        }
    }

    // Documento
    if (m.documentMessage) {
        return {
            type: "document",
            mimeType: m.documentMessage.mimetype || undefined,
            caption: m.documentMessage.caption || undefined,
        }
    }

    // Video con caption
    if (m.videoMessage) {
        return {
            type: "image", // Tratamos video como image con caption por ahora
            caption: m.videoMessage.caption || undefined,
            mimeType: m.videoMessage.mimetype || undefined,
        }
    }

    // Botón de respuesta
    if (m.buttonsResponseMessage) {
        return {
            type: "button_reply",
            text: m.buttonsResponseMessage.selectedDisplayText || "",
        }
    }

    // Lista de selección
    if (m.listResponseMessage) {
        return {
            type: "button_reply",
            text: m.listResponseMessage.title || "",
        }
    }

    return null
}
