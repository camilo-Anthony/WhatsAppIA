import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { z } from "zod"

const fieldSchema = z.object({
    label: z.string().min(1, "El nombre del campo es requerido"),
    content: z.string(),
    order: z.number().optional(),
})

const updateFieldsSchema = z.object({
    fields: z.array(fieldSchema),
})

export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const fields = await prisma.infoField.findMany({
            where: { userId: session.user.id },
            orderBy: { order: "asc" },
        })

        return NextResponse.json({ fields })
    } catch (error) {
        console.error("Get info fields error:", error)
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
        const validation = fieldSchema.safeParse(body)

        if (!validation.success) {
            return NextResponse.json(
                { error: validation.error.issues[0].message },
                { status: 400 }
            )
        }

        const count = await prisma.infoField.count({
            where: { userId: session.user.id },
        })

        const field = await prisma.infoField.create({
            data: {
                userId: session.user.id,
                label: validation.data.label,
                content: validation.data.content,
                order: validation.data.order ?? count,
            },
        })

        return NextResponse.json({ field }, { status: 201 })
    } catch (error) {
        console.error("Create info field error:", error)
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
        const validation = updateFieldsSchema.safeParse(body)

        if (!validation.success) {
            return NextResponse.json(
                { error: validation.error.issues[0].message },
                { status: 400 }
            )
        }

        // Delete existing and replace with new
        await prisma.infoField.deleteMany({
            where: { userId: session.user.id },
        })

        const fields = await prisma.infoField.createMany({
            data: validation.data.fields.map((field, index) => ({
                userId: session.user.id,
                label: field.label,
                content: field.content,
                order: field.order ?? index,
            })),
        })

        return NextResponse.json({ count: fields.count })
    } catch (error) {
        console.error("Update info fields error:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
