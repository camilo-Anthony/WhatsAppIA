/**
 * Webhook de WhatsApp Cloud API
 * Recibe mensajes entrantes y verificación del webhook.
 */

import { NextResponse, NextRequest } from "next/server"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || ""

/**
 * GET — Verificación del webhook por Meta.
 * Meta envía un challenge que debemos devolver.
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const mode = searchParams.get("hub.mode")
    const token = searchParams.get("hub.verify_token")
    const challenge = searchParams.get("hub.challenge")

    if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
        console.log("[Webhook] Verificación exitosa")
        return new Response(challenge, { status: 200 })
    }

    console.warn("[Webhook] Verificación fallida — token inválido")
    return NextResponse.json({ error: "Verificación fallida" }, { status: 403 })
}

/**
 * POST — Recibe eventos de WhatsApp Cloud API.
 * Procesa mensajes entrantes y los encola.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()

        // Meta siempre envía un objeto con entry[]
        const entries = body.entry || []

        for (const entry of entries) {
            const changes = entry.changes || []

            for (const change of changes) {
                if (change.field !== "messages") continue

                const value = change.value
                if (!value?.messages) continue

                const metadata = value.metadata
                const phoneNumberId = metadata?.phone_number_id
                const displayPhone = metadata?.display_phone_number

                if (!phoneNumberId) continue

                // Buscar la conexión asociada a este phoneNumberId
                const connection = await prisma.whatsAppConnection.findFirst({
                    where: {
                        waPhoneNumberId: phoneNumberId,
                        status: "CONNECTED",
                    },
                })

                if (!connection) {
                    console.warn(`[Webhook] No se encontró conexión para phoneNumberId: ${phoneNumberId} (${displayPhone})`)
                    continue
                }

                // Procesar cada mensaje
                for (const message of value.messages) {
                    // Solo procesar mensajes de texto por ahora
                    if (message.type !== "text") continue

                    const senderPhone = message.from
                    const messageContent = message.text?.body
                    const messageId = message.id

                    if (!messageContent) continue

                    // Obtener nombre del contacto
                    const contacts = value.contacts || []
                    const contact = contacts.find(
                        (c: { wa_id: string; profile?: { name?: string } }) => c.wa_id === senderPhone
                    )
                    const senderName = contact?.profile?.name

                    console.log(`[Webhook] Mensaje de +${senderPhone}: "${messageContent}"`)

                    // Encolar mensaje (importación dinámica para evitar init durante build)
                    const { incomingQueue } = await import("@/lib/queue/incoming")
                    await incomingQueue.add("incoming-message", {
                        connectionId: connection.id,
                        userId: connection.userId,
                        senderPhone,
                        senderName,
                        messageContent,
                        messageId,
                        source: "cloud_api" as const,
                    })
                }
            }
        }

        // Meta requiere 200 OK siempre
        return NextResponse.json({ status: "ok" })
    } catch (error) {
        console.error("[Webhook] Error procesando evento:", error)
        // Devolver 200 de todas formas para que Meta no reintente
        return NextResponse.json({ status: "error" })
    }
}
