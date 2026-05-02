import { WhatsAppClient } from "./client"
import { prisma } from "../db"
import { sendTextMessage } from "./cloud-api"

class WhatsAppManager {
    private clients: Map<string, WhatsAppClient> = new Map()
    private isInitialized = false

    public async initAllActiveConnections() {
        if (this.isInitialized) return
        this.isInitialized = true

        // Inicializar workers de cola (importación dinámica para evitar init durante build)
        try {
            const { initializeQueueWorkers } = await import("../queue/worker")
            await initializeQueueWorkers()
        } catch (error) {
            console.error("[WA Manager] Error inicializando workers de cola:", error)
        }

        try {
            // Solo restaurar conexiones QR (Baileys) — Cloud API no necesita sockets
            const activeConnections = await prisma.whatsAppConnection.findMany({
                where: {
                    status: { in: ["CONNECTED", "PENDING"] },
                    mode: "QR",
                },
            })

            console.log(`[WA Manager] Encontradas ${activeConnections.length} conexiones QR activas para restaurar.`)

            for (const conn of activeConnections) {
                this.getOrCreateClient(conn.id, conn.userId)
            }
        } catch (error) {
            console.error("[WA Manager] Error al iniciar conexiones activas:", error)
            this.isInitialized = false
        }
    }

    /**
     * Crea o recupera un cliente Baileys (solo para conexiones QR).
     */
    public getOrCreateClient(connectionId: string, userId: string): WhatsAppClient {
        if (this.clients.has(connectionId)) {
            return this.clients.get(connectionId)!
        }

        const client = new WhatsAppClient(connectionId, userId)
        this.clients.set(connectionId, client)

        // Inicializar conexión de forma asíncrona
        client.initialize().catch((err) => {
            console.error(`[WA Manager] Error inicializando cliente ${connectionId}:`, err)
        })

        return client
    }

    /**
     * Envía un mensaje por el transporte correcto según el tipo de conexión.
     */
    public async sendMessage(connectionId: string, recipientJid: string, text: string) {
        const connection = await prisma.whatsAppConnection.findUnique({
            where: { id: connectionId },
        })

        if (!connection) {
            throw new Error(`Conexión ${connectionId} no encontrada`)
        }

        if (connection.mode === "QR") {
            // Enviar por Baileys
            const client = this.clients.get(connectionId)
            if (!client) {
                throw new Error(`Cliente Baileys no encontrado para ${connectionId}`)
            }
            await client.sendMessage(recipientJid, text)
        } else {
            // Enviar por Cloud API
            await this.sendMessageViaCloudAPI(connection, recipientJid, text)
        }
    }

    /**
     * Envía un mensaje usando la Cloud API de WhatsApp.
     */
    private async sendMessageViaCloudAPI(
        connection: {
            id: string
            waPhoneNumberId: string | null
            accessToken: string | null
            tokenExpiresAt: Date | null
            [key: string]: unknown
        },
        recipientJid: string,
        text: string
    ) {
        if (!connection.waPhoneNumberId || !connection.accessToken) {
            throw new Error(`Conexión ${connection.id} sin credenciales Cloud API`)
        }

        // Verificar expiración del token
        if (connection.tokenExpiresAt && connection.tokenExpiresAt < new Date()) {
            await prisma.whatsAppConnection.update({
                where: { id: connection.id },
                data: { status: "TOKEN_EXPIRED" },
            })
            throw new Error("TOKEN_EXPIRED")
        }

        // Extraer teléfono del JID
        const recipientPhone = recipientJid.replace("@s.whatsapp.net", "").replace("@lid", "")

        await sendTextMessage(
            connection.waPhoneNumberId,
            connection.accessToken,
            recipientPhone,
            text
        )

        // Actualizar última actividad
        await prisma.whatsAppConnection.update({
            where: { id: connection.id },
            data: { lastActive: new Date() },
        })
    }

    public async removeClient(connectionId: string) {
        const client = this.clients.get(connectionId)
        if (client) {
            await client.logout()
            this.clients.delete(connectionId)
        }
    }

    public getClient(connectionId: string): WhatsAppClient | undefined {
        return this.clients.get(connectionId)
    }

    public async getQR(connectionId: string, userId: string): Promise<string | null> {
        let client = this.clients.get(connectionId)

        if (!client) {
            client = this.getOrCreateClient(connectionId, userId)
        }

        // Esperar hasta 10 segundos para que se genere el QR
        let retries = 0
        while (!client.qrCode && client.status === "PENDING" && retries < 20) {
            await new Promise((resolve) => setTimeout(resolve, 500))
            retries++
        }

        return client.qrCode
    }
}

// Persistir entre recargas HMR de Next.js
const globalForWA = globalThis as unknown as {
    whatsappManager: WhatsAppManager | undefined
}

export const whatsappManager = globalForWA.whatsappManager ?? new WhatsAppManager()

if (process.env.NODE_ENV !== "production") globalForWA.whatsappManager = whatsappManager
