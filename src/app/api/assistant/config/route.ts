import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { z } from "zod"

// Schema para crear/actualizar perfiles
const profileSchema = z.object({
    name: z.string().min(1, "El nombre es requerido").optional(),
    behaviorPrompt: z.string().min(10, "El prompt debe tener al menos 10 caracteres"),
    infoMode: z.enum(["SIMPLE", "ADVANCED"]),
    simpleInfo: z.string().optional(),
})

// GET: Obtener todos los perfiles del usuario
export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const profiles = await prisma.assistantConfig.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: "asc" },
            include: {
                connections: {
                    select: { id: true, phoneNumber: true, displayName: true, isAssistantActive: true },
                },
            },
        })

        const infoFields = await prisma.infoField.findMany({
            where: { userId: session.user.id },
            orderBy: { order: "asc" },
        })

        return NextResponse.json({ profiles, infoFields })
    } catch (error) {
        console.error("Get profiles error:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}

// POST: Crear un nuevo perfil
export async function POST(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const body = await request.json()
        const validation = profileSchema.safeParse(body)

        if (!validation.success) {
            return NextResponse.json(
                { error: validation.error.issues[0].message },
                { status: 400 }
            )
        }

        const profile = await prisma.assistantConfig.create({
            data: {
                userId: session.user.id,
                name: validation.data.name || "Nuevo Perfil",
                behaviorPrompt: validation.data.behaviorPrompt,
                infoMode: validation.data.infoMode,
                simpleInfo: validation.data.simpleInfo,
            },
        })

        return NextResponse.json({ profile }, { status: 201 })
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error)
        const errStack = error instanceof Error ? error.stack : ""
        console.error("Create profile error:", errMsg)
        console.error("Stack:", errStack)
        return NextResponse.json({ error: "Error interno", details: errMsg }, { status: 500 })
    }
}

// PUT: Actualizar un perfil existente (requiere ?id= en query params)
export async function PUT(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const profileId = searchParams.get("id")

        const body = await request.json()
        const validation = profileSchema.safeParse(body)

        if (!validation.success) {
            return NextResponse.json(
                { error: validation.error.issues[0].message },
                { status: 400 }
            )
        }

        // Si no hay ID, intentamos upsert del primer perfil (compatibilidad)
        if (!profileId) {
            const existing = await prisma.assistantConfig.findFirst({
                where: { userId: session.user.id },
                orderBy: { createdAt: "asc" },
            })

            if (existing) {
                const profile = await prisma.assistantConfig.update({
                    where: { id: existing.id },
                    data: {
                        name: validation.data.name,
                        behaviorPrompt: validation.data.behaviorPrompt,
                        infoMode: validation.data.infoMode,
                        simpleInfo: validation.data.simpleInfo,
                    },
                })
                return NextResponse.json({ profile })
            } else {
                const profile = await prisma.assistantConfig.create({
                    data: {
                        userId: session.user.id,
                        name: validation.data.name || "Perfil Principal",
                        behaviorPrompt: validation.data.behaviorPrompt,
                        infoMode: validation.data.infoMode,
                        simpleInfo: validation.data.simpleInfo,
                    },
                })
                return NextResponse.json({ profile }, { status: 201 })
            }
        }

        // Verificar que el perfil pertenece al usuario
        const existing = await prisma.assistantConfig.findFirst({
            where: { id: profileId, userId: session.user.id },
        })

        if (!existing) {
            return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })
        }

        const profile = await prisma.assistantConfig.update({
            where: { id: profileId },
            data: {
                name: validation.data.name,
                behaviorPrompt: validation.data.behaviorPrompt,
                infoMode: validation.data.infoMode,
                simpleInfo: validation.data.simpleInfo,
            },
        })

        return NextResponse.json({ profile })
    } catch (error) {
        console.error("Update profile error:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}

// DELETE: Eliminar un perfil (requiere ?id= en query params)
export async function DELETE(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const profileId = searchParams.get("id")

        if (!profileId) {
            return NextResponse.json({ error: "ID de perfil requerido" }, { status: 400 })
        }

        // Verificar pertenencia
        const existing = await prisma.assistantConfig.findFirst({
            where: { id: profileId, userId: session.user.id },
        })

        if (!existing) {
            return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })
        }

        // Desasociar conexiones que usan este perfil
        await prisma.whatsAppConnection.updateMany({
            where: { assistantConfigId: profileId },
            data: { assistantConfigId: null },
        })

        await prisma.assistantConfig.delete({
            where: { id: profileId },
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Delete profile error:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
