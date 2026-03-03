import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { z } from "zod"

const dataSourceSchema = z.object({
    name: z.string().min(1, "El nombre es requerido"),
    type: z.enum(["DATABASE", "API", "ENDPOINT"]),
    config: z.record(z.string(), z.unknown()),
    isActive: z.boolean().optional(),
})

export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const sources = await prisma.dataSource.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: "desc" },
        })

        return NextResponse.json({ sources })
    } catch (error) {
        console.error("Get data sources error:", error)
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
        const validation = dataSourceSchema.safeParse(body)

        if (!validation.success) {
            return NextResponse.json(
                { error: validation.error.issues[0].message },
                { status: 400 }
            )
        }

        const source = await prisma.dataSource.create({
            data: {
                userId: session.user.id,
                name: validation.data.name,
                type: validation.data.type,
                config: validation.data.config as Record<string, string>,
                isActive: validation.data.isActive ?? true,
            },
        })

        return NextResponse.json({ source }, { status: 201 })
    } catch (error) {
        console.error("Create data source error:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
