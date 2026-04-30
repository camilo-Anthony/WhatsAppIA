/**
 * Conversation State — Máquina de estados persistida en Redis.
 *
 * Gestiona el estado multi-turn de conversaciones de WhatsApp.
 * No existe en ZeroClaw (es single-session), es nuestra extensión
 * para manejar el flujo: idle → collecting_slots → confirming → executing → idle
 *
 * @module agent/conversation-state
 */

import { redis } from "@/lib/queue/redis"
import type { ConversationContext, ConversationState } from "./types"
import { CONVERSATION_STATE_TTL_SECONDS } from "./types"

// ==========================================
// REDIS KEY
// ==========================================

function stateKey(userId: string, contactPhone: string): string {
    return `conv:${userId}:${contactPhone}`
}

// ==========================================
// STATE OPERATIONS
// ==========================================

/**
 * Obtener el estado actual de una conversación.
 * Si no existe o expiró, retorna un estado "idle" limpio.
 */
export async function getConversationState(
    userId: string,
    contactPhone: string
): Promise<ConversationContext> {
    const key = stateKey(userId, contactPhone)
    const raw = await redis.get(key)

    if (!raw) {
        return createFreshState(userId, contactPhone)
    }

    try {
        const state = JSON.parse(raw) as ConversationContext
        return state
    } catch {
        // JSON corrupto — crear estado fresco
        return createFreshState(userId, contactPhone)
    }
}

/**
 * Guardar el estado de una conversación en Redis.
 * Se renueva el TTL con cada actualización.
 */
export async function setConversationState(ctx: ConversationContext): Promise<void> {
    const key = stateKey(ctx.userId, ctx.contactPhone)
    ctx.lastUpdated = Date.now()
    await redis.set(key, JSON.stringify(ctx), "EX", CONVERSATION_STATE_TTL_SECONDS)
}

/**
 * Limpiar el estado de una conversación (volver a idle).
 */
export async function clearConversationState(
    userId: string,
    contactPhone: string
): Promise<void> {
    const key = stateKey(userId, contactPhone)
    await redis.del(key)
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
