import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { z } from "zod"

const assignSchema = z.object({
    assistantConfigId: z.string().nullable(),
    isAssistantActive: z.boolean().optional(),
})

// PUT: Asignar perfil de asistente a una conexión o hacer toggle
export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const { id } = await params

        // Verificar que la conexión pertenece al usuario
        const connection = await prisma.whatsAppConnection.findFirst({
            where: { id, userId: session.user.id },
        })

        if (!connection) {
            return NextResponse.json({ error: "Conexión no encontrada" }, { status: 404 })
        }

        const body = await request.json()
        const validation = assignSchema.safeParse(body)

        if (!validation.success) {
            return NextResponse.json(
                { error: validation.error.issues[0].message },
                { status: 400 }
            )
        }

        const updateData: Record<string, unknown> = {}

        // Asignar perfil
        if (validation.data.assistantConfigId !== undefined) {
            // Si se asigna un perfil, verificar que pertenece al usuario
            if (validation.data.assistantConfigId !== null) {
                const profile = await prisma.assistantConfig.findFirst({
                    where: { id: validation.data.assistantConfigId, userId: session.user.id },
                })
                if (!profile) {
                    return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })
                }
            }
            updateData.assistantConfigId = validation.data.assistantConfigId
        }

        // Toggle de asistente activo
        if (validation.data.isAssistantActive !== undefined) {
            updateData.isAssistantActive = validation.data.isAssistantActive
        }

        const updated = await prisma.whatsAppConnection.update({
            where: { id },
            data: updateData,
            include: {
                assistantConfig: {
                    select: { id: true, name: true },
                },
            },
        })

        return NextResponse.json({ connection: updated })
    } catch (error) {
        console.error("Update connection assistant error:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
