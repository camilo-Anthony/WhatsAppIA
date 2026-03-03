import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function GET(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const page = parseInt(searchParams.get("page") || "1")
        const limit = parseInt(searchParams.get("limit") || "20")
        const search = searchParams.get("search") || ""

        const where = {
            userId: session.user.id,
            ...(search && {
                OR: [
                    { clientPhone: { contains: search } },
                    { clientName: { contains: search, mode: "insensitive" as const } },
                ],
            }),
        }

        const [conversations, total] = await Promise.all([
            prisma.conversation.findMany({
                where,
                orderBy: { updatedAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    messages: {
                        orderBy: { timestamp: "desc" },
                        take: 1,
                    },
                    _count: {
                        select: { messages: true },
                    },
                },
            }),
            prisma.conversation.count({ where }),
        ])

        return NextResponse.json({
            conversations,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        })
    } catch (error) {
        console.error("Get conversations error:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
