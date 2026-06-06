import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { agentPipeline } from "@/lib/ai/agent/agent-pipeline"

export async function POST(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const { assistantConfigId, message } = await request.json()
        if (!assistantConfigId || !message) {
            return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 })
        }

        // Verificar que el perfil pertenece al usuario
        const profile = await prisma.assistantConfig.findFirst({
            where: {
                id: assistantConfigId,
                userId: session.user.id,
            },
        })

        if (!profile) {
            return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })
        }

        // Buscar o crear conexión sandbox para que el pipeline se ejecute correctamente
        let connection = await prisma.whatsAppConnection.findFirst({
            where: {
                userId: session.user.id,
                assistantConfigId,
            },
        })

        if (!connection) {
            connection = await prisma.whatsAppConnection.create({
                data: {
                    userId: session.user.id,
                    status: "CONNECTED",
                    displayName: "Playground Sandbox",
                    phoneNumber: "sandbox-num",
                    mode: "QR",
                    assistantConfigId,
                },
            })
        }

        const result = await agentPipeline({
            userId: session.user.id,
            connectionId: connection.id,
            conversationId: "sandbox-conversation",
            clientPhone: "sandbox-client-phone",
            messageContent: message,
        })

        return NextResponse.json(result)
    } catch (error) {
        console.error("Sandbox agent chat error:", error)
        return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
    }
}
