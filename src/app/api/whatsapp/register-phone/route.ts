/**
 * Registro de Número de Teléfono
 * Registra un número del cliente en el WABA de la plataforma.
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import {
    registerPhoneNumber,
    requestVerificationCode,
} from "@/lib/whatsapp/phone-registration"

export async function POST(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const body = await request.json()
        const { phoneNumber, displayName, verificationMethod = "SMS" } = body

        if (!phoneNumber) {
            return NextResponse.json(
                { error: "Número de teléfono requerido" },
                { status: 400 }
            )
        }

        // 1. Registrar número en el WABA de la plataforma
        const registration = await registerPhoneNumber(
            phoneNumber,
            displayName || session.user.name || "WhatsApp User"
        )

        // 2. Solicitar código de verificación
        await requestVerificationCode(
            registration.phoneNumberId,
            verificationMethod as "SMS" | "VOICE"
        )

        // 3. Crear conexión en estado pendiente
        const connection = await prisma.whatsAppConnection.create({
            data: {
                userId: session.user.id,
                mode: "MANAGED",
                status: "PENDING",
                phoneNumber,
                displayName: displayName || null,
                waPhoneNumberId: registration.phoneNumberId,
                wabaId: process.env.META_WABA_ID || null,
            },
        })

        return NextResponse.json({
            connection,
            phoneNumberId: registration.phoneNumberId,
            message: `Código de verificación enviado por ${verificationMethod} a ${phoneNumber}`,
        }, { status: 201 })
    } catch (error) {
        console.error("[Registro] Error:", error)
        const message = error instanceof Error ? error.message : "Error al registrar número"
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
