import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { whatsappManager } from "@/lib/whatsapp/manager"

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const { id } = await params

        const connection = await prisma.whatsAppConnection.findUnique({
            where: {
                id,
                userId: session.user.id, // Tenant isolation
            },
        })

        if (!connection) {
            return NextResponse.json({ error: "Conexión no encontrada" }, { status: 404 })
        }

        let qrCode = null
        if (connection.status === "PENDING") {
            // Get from manager (waits up to 10s if connecting)
            qrCode = await whatsappManager.getQR(connection.id, session.user.id)

            // Re-fetch connection as status might have changed during getQR
            const updatedConnection = await prisma.whatsAppConnection.findUnique({
                where: { id },
                select: { status: true, phoneNumber: true, displayName: true }
            })

            if (updatedConnection) {
                Object.assign(connection, updatedConnection)
            }
        }

        return NextResponse.json({
            connection,
            qrCode,
        })
    } catch (error) {
        console.error("Get connection details error:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
