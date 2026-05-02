/**
 * Conversation State — Estado multi-turn persistido en PostgreSQL.
 *
 * Gestiona el estado multi-turn de conversaciones de WhatsApp.
 * Usa PostgreSQL (campo JSON en Conversation) en vez de Redis.
 *
 * Flujo: idle → collecting_slots → confirming → executing → idle
 *
 * @module agent/conversation-state
 */

import { prisma } from "@/lib/db"
import type { ConversationContext, ConversationState } from "./types"

// ==========================================
// STATE OPERATIONS (PostgreSQL)
// ==========================================

/**
 * Obtener el estado actual de una conversación.
 * Si no existe o expiró, retorna un estado "idle" limpio.
 */
export async function getConversationState(
    userId: string,
    contactPhone: string
): Promise<ConversationContext> {
    const conversation = await prisma.conversation.findFirst({
        where: { userId, clientPhone: contactPhone },
        select: { metadata: true },
    })

    if (!conversation?.metadata) {
        return createFreshState(userId, contactPhone)
    }

    try {
        const meta = conversation.metadata as any
        if (!meta.conversationState) {
            return createFreshState(userId, contactPhone)
        }

        const state = meta.conversationState as ConversationContext

        // Verificar TTL (30 min de inactividad = reset a idle)
        const TTL_MS = 30 * 60 * 1000
        if (state.lastUpdated && Date.now() - state.lastUpdated > TTL_MS) {
            return createFreshState(userId, contactPhone)
        }

        return state
    } catch {
        return createFreshState(userId, contactPhone)
    }
}

/**
 * Guardar el estado de una conversación en PostgreSQL.
 */
export async function setConversationState(ctx: ConversationContext): Promise<void> {
    ctx.lastUpdated = Date.now()

    const conversation = await prisma.conversation.findFirst({
        where: { userId: ctx.userId, clientPhone: ctx.contactPhone },
        select: { id: true, metadata: true },
    })

    if (!conversation) return

    const existingMeta = (conversation.metadata as any) || {}

    await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
            metadata: {
                ...existingMeta,
                conversationState: ctx,
            },
        },
    })
}

/**
 * Limpiar el estado de una conversación (volver a idle).
 */
export async function clearConversationState(
    userId: string,
    contactPhone: string
): Promise<void> {
    const conversation = await prisma.conversation.findFirst({
        where: { userId, clientPhone: contactPhone },
        select: { id: true, metadata: true },
    })

    if (!conversation) return

    const existingMeta = (conversation.metadata as any) || {}
    delete existingMeta.conversationState

    await prisma.conversation.update({
        where: { id: conversation.id },
        data: { metadata: existingMeta },
    })
}

/**
 * Transicionar a un nuevo estado, preservando el contexto existente.
 */
export async function transitionState(
    userId: string,
    contactPhone: string,
    newState: ConversationState,
    updates?: Partial<Pick<ConversationContext, "pendingIntent" | "collectedSlots" | "missingSlots">>
): Promise<ConversationContext> {
    const ctx = await getConversationState(userId, contactPhone)

    ctx.state = newState

    if (updates?.pendingIntent !== undefined) ctx.pendingIntent = updates.pendingIntent
    if (updates?.collectedSlots !== undefined) ctx.collectedSlots = { ...ctx.collectedSlots, ...updates.collectedSlots }
    if (updates?.missingSlots !== undefined) ctx.missingSlots = updates.missingSlots

    await setConversationState(ctx)
    return ctx
}

/**
 * Resetear a idle con todos los datos limpios.
 * Se usa después de ejecutar una acción o al cancelar.
 */
export async function resetToIdle(
    userId: string,
    contactPhone: string
): Promise<ConversationContext> {
    const fresh = createFreshState(userId, contactPhone)
    await setConversationState(fresh)
    return fresh
}

// ==========================================
// HELPERS
// ==========================================

function createFreshState(userId: string, contactPhone: string): ConversationContext {
    return {
        userId,
        contactPhone,
        state: "idle",
        pendingIntent: undefined,
        collectedSlots: {},
        missingSlots: [],
        lastUpdated: Date.now(),
    }
}

/**
 * Detectar si el usuario quiere cancelar la operación actual.
 * Busca palabras clave de cancelación en español.
 */
export function isCancellationMessage(message: string): boolean {
    const normalized = message.toLowerCase().trim()
    const cancelWords = [
        "no",
        "cancelar",
        "cancela",
        "olvidalo",
        "olvídalo",
        "dejalo",
        "déjalo",
        "no quiero",
        "nada",
        "mejor no",
        "ya no",
        "parar",
        "detener",
    ]
    return cancelWords.some((word) => normalized === word || normalized.startsWith(word + " "))
}

/**
 * Detectar si el usuario confirma una acción.
 */
export function isConfirmationMessage(message: string): boolean {
    const normalized = message.toLowerCase().trim()
    const confirmWords = [
        "si",
        "sí",
        "ok",
        "okay",
        "dale",
        "confirmo",
        "confirmar",
        "correcto",
        "perfecto",
        "listo",
        "va",
        "claro",
        "adelante",
        "hazlo",
        "procede",
    ]
    return confirmWords.some((word) => normalized === word || normalized.startsWith(word + " ") || normalized.startsWith(word + ","))
}
