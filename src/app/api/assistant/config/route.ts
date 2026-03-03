import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { z } from "zod"

const configSchema = z.object({
    behaviorPrompt: z.string().min(10, "El prompt debe tener al menos 10 caracteres"),
    infoMode: z.enum(["SIMPLE", "ADVANCED"]),
    simpleInfo: z.string().optional(),
    isActive: z.boolean().optional(),
})

export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const config = await prisma.assistantConfig.findUnique({
            where: { userId: session.user.id },
        })

        const infoFields = await prisma.infoField.findMany({
            where: { userId: session.user.id },
            orderBy: { order: "asc" },
        })

        return NextResponse.json({ config, infoFields })
    } catch (error) {
        console.error("Get config error:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}

export async function PUT(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const body = await request.json()
        const validation = configSchema.safeParse(body)

        if (!validation.success) {
            return NextResponse.json(
                { error: validation.error.issues[0].message },
                { status: 400 }
            )
        }

        const config = await prisma.assistantConfig.upsert({
            where: { userId: session.user.id },
            update: validation.data,
            create: {
                userId: session.user.id,
                ...validation.data,
            },
        })

        return NextResponse.json({ config })
    } catch (error) {
        console.error("Update config error:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
