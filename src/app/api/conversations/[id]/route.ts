import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

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

        const conversation = await prisma.conversation.findFirst({
            where: {
                id,
                userId: session.user.id, // Tenant isolation
            },
            include: {
                messages: {
                    orderBy: { timestamp: "asc" },
                },
            },
        })

        if (!conversation) {
            return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 })
        }

        return NextResponse.json({ conversation })
    } catch (error) {
        console.error("Get conversation error:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
