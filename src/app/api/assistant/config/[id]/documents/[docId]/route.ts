import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { LightRAGClient } from "@/lib/ai/rag/lightrag-client"

// DELETE: Eliminar un documento específico del RAG y de la base de datos
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string; docId: string }> }
) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const resolvedParams = await params
        const profileId = resolvedParams.id
        const docId = resolvedParams.docId

        // Verificar que el documento pertenece al usuario y al perfil del asistente
        const document = await prisma.knowledgeDocument.findFirst({
            where: {
                id: docId,
                assistantConfigId: profileId,
                userId: session.user.id,
            }
        })

        if (!document) {
            return NextResponse.json({ error: "Documento no encontrado o no pertenece a este usuario" }, { status: 404 })
        }

        try {
            // Eliminar del microservicio de LightRAG
            const ragClient = new LightRAGClient()
            await ragClient.deleteDocument(profileId, docId)
        } catch (ragError) {
            console.error(`[Documents DELETE] Advertencia al eliminar de LightRAG (continuando con DB):`, ragError)
            // Continuamos eliminando de la base de datos para no bloquear al usuario si el contenedor no responde
        }

        // Eliminar del base de datos
        await prisma.knowledgeDocument.delete({
            where: { id: docId }
        })

        return NextResponse.json({ success: true, docId })
    } catch (error) {
        console.error("[Documents DELETE] Error general:", error)
        return NextResponse.json({ error: "Error interno al eliminar el documento" }, { status: 500 })
    }
}
