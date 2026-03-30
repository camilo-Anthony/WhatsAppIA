/**
 * Meta OAuth Callback
 * Recibe el código de autorización después de que el usuario
 * inicia sesión y autoriza la app en Meta.
 */

import { NextResponse, NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import {
    exchangeCodeForToken,
    getLongLivedToken,
    getConnectedWABAs,
    getPhoneNumbers,
} from "@/lib/whatsapp/meta-oauth"

export async function GET(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.redirect(new URL("/login", request.url))
        }

        const searchParams = request.nextUrl.searchParams
        const code = searchParams.get("code")
        const state = searchParams.get("state")
        const error = searchParams.get("error")

        // Si el usuario canceló o hubo un error
        if (error) {
            console.error("[Meta Callback] Error de OAuth:", error)
            return NextResponse.redirect(
                new URL(`/dashboard/connections?error=${encodeURIComponent(error)}`, request.url)
            )
        }

        if (!code || !state) {
            return NextResponse.redirect(
                new URL("/dashboard/connections?error=missing_params", request.url)
            )
        }

        // Verificar que el state pertenece a este usuario
        if (!state.startsWith(session.user.id)) {
            return NextResponse.redirect(
                new URL("/dashboard/connections?error=invalid_state", request.url)
            )
        }

        // Intercambiar código por token
        const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"
        const redirectUri = `${baseUrl}/api/whatsapp/meta/callback`

        const tokenData = await exchangeCodeForToken(code, redirectUri)

        // Obtener token de larga duración
        const longLivedToken = await getLongLivedToken(tokenData.access_token)

        // Obtener WABAs y números
        const wabas = await getConnectedWABAs(longLivedToken.access_token)

        // Recopilar todos los números de todos los WABAs
        const allPhoneNumbers = []
        for (const waba of wabas) {
            const phones = await getPhoneNumbers(waba.id, longLivedToken.access_token)
            for (const phone of phones) {
                allPhoneNumbers.push({
                    ...phone,
                    wabaId: waba.id,
                    wabaName: waba.name,
                })
            }
        }

        // Si hay exactamente un número, crear la conexión automáticamente
        if (allPhoneNumbers.length === 1) {
            const phone = allPhoneNumbers[0]
            const tokenExpiry = new Date(Date.now() + (longLivedToken.expires_in || 5184000) * 1000)

            await prisma.whatsAppConnection.create({
                data: {
                    userId: session.user.id,
                    mode: "OWN_ACCOUNT",
                    status: "CONNECTED",
                    phoneNumber: phone.display_phone_number,
                    displayName: phone.verified_name,
                    wabaId: phone.wabaId,
                    waPhoneNumberId: phone.id,
                    accessToken: longLivedToken.access_token,
                    tokenExpiresAt: tokenExpiry,
                },
            })

            return NextResponse.redirect(
                new URL("/dashboard/connections?success=connected", request.url)
            )
        }

        // Si hay múltiples números, guardar token temporalmente y redirigir a selección
        // Almacenamos info en query params (cifrado en producción real)
        const numbersParam = encodeURIComponent(JSON.stringify(allPhoneNumbers))
        const tokenParam = encodeURIComponent(longLivedToken.access_token)
        const expiresParam = longLivedToken.expires_in || 5184000

        return NextResponse.redirect(
            new URL(
                `/dashboard/connections?select_number=true&numbers=${numbersParam}&token=${tokenParam}&expires=${expiresParam}`,
                request.url
            )
        )
    } catch (error) {
        console.error("[Meta Callback] Error:", error)
        return NextResponse.redirect(
            new URL("/dashboard/connections?error=auth_failed", request.url)
        )
    }
}

/**
 * POST — Seleccionar un número específico después del OAuth.
 * Se usa cuando el usuario tiene múltiples números y debe elegir uno.
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const body = await request.json()
        const { phoneNumberId, displayPhone, verifiedName, wabaId, accessToken, expiresIn } = body

        if (!phoneNumberId || !accessToken) {
            return NextResponse.json({ error: "Datos incompletos" }, { status: 400 })
        }

        const tokenExpiry = new Date(Date.now() + (expiresIn || 5184000) * 1000)

        const connection = await prisma.whatsAppConnection.create({
            data: {
                userId: session.user.id,
                mode: "OWN_ACCOUNT",
                status: "CONNECTED",
                phoneNumber: displayPhone,
                displayName: verifiedName,
                wabaId,
                waPhoneNumberId: phoneNumberId,
                accessToken,
                tokenExpiresAt: tokenExpiry,
            },
        })

        return NextResponse.json({ connection, message: "Número conectado exitosamente" }, { status: 201 })
    } catch (error) {
        console.error("[Meta Callback POST] Error:", error)
        return NextResponse.json({ error: "Error al conectar número" }, { status: 500 })
    }
}
