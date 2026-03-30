/**
 * Meta OAuth — Iniciar flujo de autorización
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getMetaLoginUrl } from "@/lib/whatsapp/meta-oauth"
import { v4 as uuidv4 } from "uuid"

export async function POST() {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        // Generar estado único para seguridad CSRF
        const state = `${session.user.id}:${uuidv4()}`

        // URL de callback
        const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"
        const redirectUri = `${baseUrl}/api/whatsapp/meta/callback`

        const loginUrl = getMetaLoginUrl(state, redirectUri)

        return NextResponse.json({
            loginUrl,
            state,
        })
    } catch (error) {
        console.error("[Meta Auth] Error:", error)
        return NextResponse.json(
            { error: "Error al generar URL de autorización" },
            { status: 500 }
        )
    }
}
