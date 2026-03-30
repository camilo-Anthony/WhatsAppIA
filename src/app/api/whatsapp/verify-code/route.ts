/**
 * Verificación de Código
 * Completa el registro del número verificando el código enviado.
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import {
    verifyCode,
    registerNumberForMessaging,
} from "@/lib/whatsapp/phone-registration"

export async function POST(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const body = await request.json()
        const { connectionId, code } = body

        if (!connectionId || !code) {
            return NextResponse.json(
                { error: "connectionId y código requeridos" },
                { status: 400 }
            )
        }

        // Buscar la conexión pendiente
        const connection = await prisma.whatsAppConnection.findFirst({
            where: {
                id: connectionId,
                userId: session.user.id,
                mode: "MANAGED",
                status: "PENDING",
            },
        })

        if (!connection) {
            return NextResponse.json(
                { error: "Conexión pendiente no encontrada" },
                { status: 404 }
            )
        }

        if (!connection.waPhoneNumberId) {
            return NextResponse.json(
                { error: "Número no registrado correctamente" },
                { status: 400 }
            )
        }

        // 1. Verificar el código
        const verification = await verifyCode(connection.waPhoneNumberId, code)

        if (!verification.success) {
            return NextResponse.json(
                { error: "Código de verificación incorrecto" },
                { status: 400 }
            )
        }

        // 2. Registrar el número para mensajería
        await registerNumberForMessaging(connection.waPhoneNumberId)

        // 3. Actualizar la conexión a CONNECTED
        // Para MANAGED, el token es el de la plataforma
        const updatedConnection = await prisma.whatsAppConnection.update({
            where: { id: connectionId },
            data: {
                status: "CONNECTED",
                accessToken: process.env.META_PLATFORM_TOKEN || process.env.META_APP_SECRET || null,
            },
        })

        return NextResponse.json({
            connection: updatedConnection,
            message: "Número verificado y conectado exitosamente",
        })
    } catch (error) {
        console.error("[Verificación] Error:", error)
        const message = error instanceof Error ? error.message : "Error al verificar código"
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
