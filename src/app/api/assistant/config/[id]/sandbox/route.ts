import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { clearConversationState } from "@/lib/ai/agent/conversation-state"

/**
 * DELETE /api/assistant/config/[id]/sandbox
 * 
 * Elimina por completo el historial de chat (mensajes y conversaciones),
 * las trazas de ejecución (AgentRuns), las memorias aprendidas (AgentMemories)
 * y el estado multi-turn de la conversación para el cliente "sandbox".
 */
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const resolvedParams = await params
        const assistantConfigId = resolvedParams.id

        // Verificar que el perfil pertenece al usuario autenticado
        const profile = await prisma.assistantConfig.findFirst({
            where: {
                id: assistantConfigId,
                userId: session.user.id,
            },
        })

        if (!profile) {
            return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })
        }

        // 1. Buscar la conversación de sandbox para el usuario
        const sandboxConv = await prisma.conversation.findFirst({
            where: {
                userId: session.user.id,
                clientPhone: "sandbox",
            },
        })

        if (sandboxConv) {
            // Eliminar AgentRuns vinculados a esta conversación
            await prisma.agentRun.deleteMany({
                where: {
                    userId: session.user.id,
                    conversationId: sandboxConv.id,
                },
            })

            // Eliminar conversación (esto borra los mensajes asociados en cascada)
            await prisma.conversation.delete({
                where: { id: sandboxConv.id },
            })
        }

        // 2. Eliminar todas las memorias (hechos) de sandbox para este asistente
        await prisma.agentMemory.deleteMany({
            where: {
                userId: session.user.id,
                assistantConfigId,
                phone: "sandbox",
            },
        })

        // 3. Limpiar el estado de conversación (slots, intenciones pendientes, etc.)
        await clearConversationState(session.user.id, "sandbox")

        console.log(`[ClearSandbox] Se borraron todos los datos del Sandbox para el asistente ${assistantConfigId}`)

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[ClearSandbox DELETE] Error:", error)
        return NextResponse.json({ error: "Error interno al borrar los datos de sandbox" }, { status: 500 })
    }
}
