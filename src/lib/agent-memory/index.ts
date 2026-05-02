/**
 * Agent Memory — API pública para memoria del agente.
 * 
 * Memoria persistente en PostgreSQL para preferencias y hechos del usuario.
 * Límite: 20 memorias más relevantes por consulta.
 */

import { prisma } from "@/lib/db"

// ==========================================
// TIPOS
// ==========================================

export interface Memory {
    key: string
    value: string
    category: string
    score: number
    updatedAt: Date
}

interface GetMemoriesOptions {
    userId: string
    phone?: string
    limit?: number
}

interface SaveMemoryOptions {
    userId: string
    phone?: string | null
    key: string
    value: string
    category?: "preference" | "fact" | "instruction" | "general"
}

// ==========================================
// LONG-TERM MEMORY (PostgreSQL)
// ==========================================

/**
 * Recupera las memorias más relevantes del agente para un usuario/cliente.
 * Combina memorias globales (phone=null) y específicas del cliente.
 * Ordenadas por score DESC, updatedAt DESC. Limitadas a 20.
 */
export async function getMemories(opts: GetMemoriesOptions): Promise<Memory[]> {
    const { userId, phone, limit = 20 } = opts

    const where: Record<string, unknown> = { userId }

    if (phone) {
        // Memorias del cliente + memorias globales
        where.OR = [{ phone }, { phone: null }]
    } else {
        where.phone = null
    }

    const memories = await prisma.agentMemory.findMany({
        where,
        orderBy: [
            { score: "desc" },
            { updatedAt: "desc" },
        ],
        take: limit,
        select: {
            key: true,
            value: true,
            category: true,
            score: true,
            updatedAt: true,
        },
    })

    return memories
}

/**
 * Guarda o actualiza una memoria. Resetea score a 1.0 al actualizar.
 */
export async function saveMemory(opts: SaveMemoryOptions): Promise<void> {
    const { userId, phone = null, key, value, category = "general" } = opts

    // Prisma compound unique doesn't support null in where, so manual check
    const existing = await prisma.agentMemory.findFirst({
        where: { userId, phone, key },
    })

    if (existing) {
        await prisma.agentMemory.update({
            where: { id: existing.id },
            data: {
                value,
                score: 1.0,
                updatedAt: new Date(),
            },
        })
    } else {
        await prisma.agentMemory.create({
            data: {
                userId,
                phone,
                key,
                value,
                category,
                score: 1.0,
            },
        })
    }
}

/**
 * Elimina una memoria específica.
 */
export async function deleteMemory(
    userId: string,
    key: string,
    phone?: string | null
): Promise<void> {
    await prisma.agentMemory.deleteMany({
        where: { userId, phone: phone ?? null, key },
    })
}

/**
 * Degrada el score de todas las memorias antiguas (llamar periódicamente).
 * Memorias con score < 0.1 se eliminan automáticamente.
 */
export async function decayMemories(userId: string): Promise<void> {
    // Reducir score en 10%
    await prisma.$executeRaw`
        UPDATE agent_memories
        SET score = score * 0.9
        WHERE "userId" = ${userId}
    `

    // Eliminar memorias con score muy bajo
    await prisma.agentMemory.deleteMany({
        where: { userId, score: { lt: 0.1 } },
    })
}
