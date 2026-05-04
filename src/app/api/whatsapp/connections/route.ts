import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { whatsappManager } from "@/lib/whatsapp/manager"

export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        // Ensure manager is initialized to handle active connections
        whatsappManager.initAllActiveConnections()

        const connections = await prisma.whatsAppConnection.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: "desc" },
        })

        return NextResponse.json({ connections })
    } catch (error) {
        console.error("Get connections error:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const body = await request.json()
        const { mode = "QR" } = body

        const connection = await prisma.whatsAppConnection.create({
            data: {
                userId: session.user.id,
                mode,
                status: "PENDING",
            },
        })

        // Initialize Baileys session
        whatsappManager.getOrCreateClient(connection.id, session.user.id)

        return NextResponse.json({
            connection,
            message: "Conexión creada. Escanea el código QR para vincular tu WhatsApp.",
        }, { status: 201 })
    } catch (error) {
        console.error("Create connection error:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}

export async function DELETE(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const connectionId = searchParams.get("id")

        if (!connectionId) {
            return NextResponse.json({ error: "ID requerido" }, { status: 400 })
        }

        // BUG-008: Validate ownership BEFORE any side effects
        const connection = await prisma.whatsAppConnection.findFirst({
            where: { id: connectionId, userId: session.user.id },
            select: { id: true },
        })

        if (!connection) {
            return NextResponse.json({ error: "Conexión no encontrada" }, { status: 404 })
        }

        // Now it's safe to remove the in-memory client
        await whatsappManager.removeClient(connectionId)

        await prisma.whatsAppConnection.delete({
            where: { id: connectionId },
        })

        return NextResponse.json({ message: "Conexión eliminada" })
    } catch (error) {
        console.error("Delete connection error:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
