/**
 * API de Integraciones — CRUD
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { invalidateUserTools } from "@/lib/mcp/tool-registry"

export const dynamic = "force-dynamic"

// GET — Listar integraciones del usuario
export async function GET() {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const integrations = await prisma.integration.findMany({
        where: { userId: session.user.id },
        include: {
            accounts: {
                select: {
                    id: true,
                    label: true,
                    isDefault: true,
                    createdAt: true,
                },
            },
            _count: {
                select: { toolLogs: true },
            },
        },
        orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ integrations })
}

// POST — Crear integración
export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const body = await request.json()
    const { type, provider } = body

    // Verificar que no exista ya
    const existing = await prisma.integration.findUnique({
        where: {
            userId_provider: {
                userId: session.user.id,
                provider,
            },
        },
    })

    if (existing) {
        return NextResponse.json({ error: "Esta integración ya existe" }, { status: 409 })
    }

    // Scopes por defecto según tipo
    const defaultScopes = getDefaultScopes(type)
    const defaultTools = getDefaultTools(provider)

    const integration = await prisma.integration.create({
        data: {
            userId: session.user.id,
            type,
            provider,
            allowedScopes: defaultScopes,
            enabledTools: defaultTools,
        },
    })

    invalidateUserTools(session.user.id)

    return NextResponse.json({ integration }, { status: 201 })
}

// DELETE — Eliminar integración
export async function DELETE(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
        return NextResponse.json({ error: "ID requerido" }, { status: 400 })
    }

    // Verificar que pertenece al usuario
    const integration = await prisma.integration.findFirst({
        where: { id, userId: session.user.id },
    })

    if (!integration) {
        return NextResponse.json({ error: "Integración no encontrada" }, { status: 404 })
    }

    await prisma.integration.delete({ where: { id } })
    invalidateUserTools(session.user.id)

    return NextResponse.json({ deleted: true })
}

// PATCH — Actualizar integración (toggle active, update tools/scopes)
export async function PATCH(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const body = await request.json()
    const { id, isActive, enabledTools, allowedScopes } = body

    if (!id) {
        return NextResponse.json({ error: "ID requerido" }, { status: 400 })
    }

    const integration = await prisma.integration.findFirst({
        where: { id, userId: session.user.id },
    })

    if (!integration) {
        return NextResponse.json({ error: "Integración no encontrada" }, { status: 404 })
    }

    const updated = await prisma.integration.update({
        where: { id },
        data: {
            ...(isActive !== undefined && { isActive }),
            ...(enabledTools !== undefined && { enabledTools }),
            ...(allowedScopes !== undefined && { allowedScopes }),
        },
    })

    invalidateUserTools(session.user.id)

    return NextResponse.json({ integration: updated })
}

// ==========================================
// HELPERS
// ==========================================

function getDefaultScopes(type: string): string[] {
    switch (type) {
        case "CALENDAR":
            return ["calendar.read", "calendar.write"]
        case "CRM":
            return ["crm.read", "crm.write"]
        case "STORAGE":
            return ["storage.read", "storage.write"]
        case "KNOWLEDGE":
            return ["knowledge.read"]
        default:
            return []
    }
}

function getDefaultTools(provider: string): string[] {
    switch (provider) {
        case "GOOGLE_CALENDAR":
            return ["check_availability", "list_events", "create_event", "cancel_event"]
        case "GOOGLE_SHEETS":
            return ["read_sheet", "write_sheet", "create_sheet"]
        case "NOTION":
            return ["search_pages", "read_page", "create_page"]
        case "SLACK":
            return ["send_message", "create_channel"]
        default:
            return []
    }
}
