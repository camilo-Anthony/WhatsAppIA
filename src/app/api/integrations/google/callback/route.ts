/**
 * Google OAuth Callback — Intercambia código por tokens y crea IntegrationAccount.
 */

import { NextResponse, NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { invalidateUserTools } from "@/lib/mcp/tool-registry"

export const dynamic = "force-dynamic"

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ""
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ""

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const stateParam = searchParams.get("state")
    const error = searchParams.get("error")
    const baseUrl = (process.env.NEXTAUTH_URL || "https://whatsappia-av8c.onrender.com").replace(/\/+$/, "")

    if (error) {
        console.error("[Google OAuth] Error:", error)
        return NextResponse.redirect(`${baseUrl}/dashboard/integrations?error=${error}`)
    }

    if (!code || !stateParam) {
        return NextResponse.redirect(`${baseUrl}/dashboard/integrations?error=missing_params`)
    }

    // Decodificar state
    let state: { userId: string; provider: string; integrationId: string }
    try {
        state = JSON.parse(Buffer.from(stateParam, "base64url").toString())
    } catch {
        return NextResponse.redirect(`${baseUrl}/dashboard/integrations?error=invalid_state`)
    }

    try {
        // Intercambiar código por tokens
        const redirectUri = `${baseUrl}/api/integrations/google/callback`

        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: redirectUri,
                grant_type: "authorization_code",
            }),
        })

        const tokens = await tokenResponse.json()

        if (!tokenResponse.ok) {
            console.error("[Google OAuth] Token error:", tokens)
            return NextResponse.redirect(`${baseUrl}/dashboard/integrations?error=token_exchange_failed`)
        }

        // Obtener info del usuario de Google
        const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        })
        const userInfo = await userInfoResponse.json()
        const accountLabel = userInfo.email || "Cuenta Google"

        // Verificar que la integración existe y pertenece al usuario
        const integration = await prisma.integration.findFirst({
            where: { id: state.integrationId, userId: state.userId },
        })

        if (!integration) {
            return NextResponse.redirect(`${baseUrl}/dashboard/integrations?error=integration_not_found`)
        }

        // Crear IntegrationAccount con los tokens
        await prisma.integrationAccount.create({
            data: {
                integrationId: integration.id,
                label: accountLabel,
                credentials: {
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                    tokenType: tokens.token_type,
                    expiresAt: tokens.expires_in
                        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
                        : null,
                },
                config: {
                    calendarId: "primary", // Default para Calendar
                    timezone: "America/Lima",
                },
                isDefault: true,
            },
        })

        // Activar la integración
        await prisma.integration.update({
            where: { id: integration.id },
            data: { isActive: true },
        })

        invalidateUserTools(state.userId)

        console.log(`[Google OAuth] Cuenta conectada: ${accountLabel} para ${state.provider}`)

        return NextResponse.redirect(`${baseUrl}/dashboard/integrations?success=connected`)
    } catch (error) {
        console.error("[Google OAuth] Error:", error)
        return NextResponse.redirect(`${baseUrl}/dashboard/integrations?error=unknown`)
    }
}
