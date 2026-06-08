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

        // Buscar o crear conversación de Sandbox para mantener el historial
        let conversation = await prisma.conversation.findFirst({
            where: {
                userId: session.user.id,
                clientPhone: "sandbox",
            },
        })

        const expectedName = session.user.name || "Creador del Agente"

        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: {
                    userId: session.user.id,
                    clientPhone: "sandbox",
                    clientName: expectedName,
                    isArchived: true, // Lo mantenemos archivado para que no sature el inbox principal
                },
            })
        } else if (conversation.clientName !== expectedName) {
            conversation = await prisma.conversation.update({
                where: { id: conversation.id },
                data: { clientName: expectedName },
            })
        }

        // Guardar mensaje entrante
        await prisma.message.create({
            data: {
                conversationId: conversation.id,
                connectionId: connection.id,
                direction: "INCOMING",
                content: message,
            },
        })

        const result = await agentPipeline({
            userId: session.user.id,
            connectionId: connection.id,
            conversationId: conversation.id,
            clientPhone: "sandbox",
            messageContent: message,
        })

        // Guardar respuesta saliente
        if (result.response) {
            await prisma.message.create({
                data: {
                    conversationId: conversation.id,
                    connectionId: connection.id,
                    direction: "OUTGOING",
                    content: result.response,
                },
            })
        }

        return NextResponse.json(result)
    } catch (error) {
        console.error("Sandbox agent chat error:", error)
        return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
    }
}
