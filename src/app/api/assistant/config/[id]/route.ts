import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { z } from "zod"

const profileSchema = z.object({
    name: z.string().min(1, "El nombre es requerido").optional(),
    behaviorPrompt: z.string().min(10, "El prompt debe tener al menos 10 caracteres").optional(),
    infoMode: z.enum(["SIMPLE", "ADVANCED"]).optional(),
    simpleInfo: z.string().optional(),
})

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const resolvedParams = await params
        const profileId = resolvedParams.id

        const profile = await prisma.assistantConfig.findFirst({
            where: {
                id: profileId,
                userId: session.user.id,
            },
            include: {
                connections: {
                    select: { id: true, phoneNumber: true, displayName: true },
                },
            },
        })

        if (!profile) {
            return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })
        }

        // Obtener los InfoFields asociados (actualmente están atados al usuario de forma global, 
        // pero se mantendrán por compatibilidad hasta que migremos InfoField para que dependan de AssistantConfig)
        const infoFields = await prisma.infoField.findMany({
            where: { userId: session.user.id },
            orderBy: { order: "asc" },
        })

        return NextResponse.json({ profile, infoFields })
    } catch (error) {
        console.error("Get single profile error:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const resolvedParams = await params
        const profileId = resolvedParams.id
        const body = await request.json()
        const validation = profileSchema.safeParse(body)

        if (!validation.success) {
            return NextResponse.json(
                { error: validation.error.issues[0].message },
                { status: 400 }
            )
        }

        // Verificar que el perfil pertenece al usuario
        const existingProfile = await prisma.assistantConfig.findFirst({
            where: {
                id: profileId,
                userId: session.user.id,
            },
        })

        if (!existingProfile) {
            return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })
        }

        const profile = await prisma.assistantConfig.update({
            where: { id: profileId },
            data: validation.data,
        })

        return NextResponse.json({ profile })
    } catch (error) {
        console.error("Update single profile error:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}

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
        const profileId = resolvedParams.id

        // Verificar que el perfil pertenece al usuario
        const existingProfile = await prisma.assistantConfig.findFirst({
            where: {
                id: profileId,
                userId: session.user.id,
            },
        })

        if (!existingProfile) {
            return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })
        }

        await prisma.assistantConfig.delete({
            where: { id: profileId },
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Delete single profile error:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
