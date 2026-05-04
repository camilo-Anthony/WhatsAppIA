import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function PUT(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const body = await request.json()
        const { name, company } = body

        if (!name || typeof name !== "string" || name.trim().length === 0) {
            return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 })
        }

        const updated = await prisma.user.update({
            where: { id: session.user.id },
            data: {
                name: name.trim(),
                company: company?.trim() || null,
            },
            select: {
                id: true,
                name: true,
                company: true,
                email: true,
            },
        })

        return NextResponse.json({ user: updated })
    } catch (error) {
        console.error("Update profile error:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
