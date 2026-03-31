/**
 * Google OAuth — Inicia flujo de autorización para integraciones Google.
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

export const dynamic = "force-dynamic"

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ""
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ""

const SCOPES_MAP: Record<string, string[]> = {
    GOOGLE_CALENDAR: [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events",
    ],
    GOOGLE_SHEETS: [
        "https://www.googleapis.com/auth/spreadsheets",
    ],
    GOOGLE_DRIVE: [
        "https://www.googleapis.com/auth/drive.file",
    ],
}

// POST — Generar URL de autorización
export async function POST(request: Request) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    if (!GOOGLE_CLIENT_ID) {
        return NextResponse.json({ error: "Google OAuth no configurado" }, { status: 500 })
    }

    const body = await request.json()
    const { provider, integrationId } = body

    const scopes = SCOPES_MAP[provider] || []
    if (scopes.length === 0) {
        return NextResponse.json({ error: "Provider no soportado" }, { status: 400 })
    }

    // Estado para CSRF + metadata
    const state = Buffer.from(JSON.stringify({
        userId: session.user.id,
        provider,
        integrationId,
        timestamp: Date.now(),
    })).toString("base64url")

    const baseUrl = process.env.NEXTAUTH_URL || "https://whatsappia-av8c.onrender.com"
    const redirectUri = `${baseUrl}/api/integrations/google/callback`

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
    authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID)
    authUrl.searchParams.set("redirect_uri", redirectUri)
    authUrl.searchParams.set("response_type", "code")
    authUrl.searchParams.set("scope", scopes.join(" "))
    authUrl.searchParams.set("access_type", "offline")
    authUrl.searchParams.set("prompt", "consent")
    authUrl.searchParams.set("state", state)

    return NextResponse.json({ authUrl: authUrl.toString() })
}

// GET — No usado directamente, solo existe el POST
export async function GET() {
    return NextResponse.json({
        message: "Usa POST para iniciar el flujo OAuth",
        configured: !!GOOGLE_CLIENT_ID && !!GOOGLE_CLIENT_SECRET,
    })
}
