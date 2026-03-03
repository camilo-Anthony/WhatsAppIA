import { WhatsAppClient } from "./client"
import { prisma } from "../db"

class WhatsAppManager {
    private clients: Map<string, WhatsAppClient> = new Map()
    private isInitialized = false

    public async initAllActiveConnections() {
        if (this.isInitialized) return
        this.isInitialized = true

        try {
            const activeConnections = await prisma.whatsAppConnection.findMany({
                where: {
                    status: { in: ["CONNECTED", "PENDING"] },
                },
            })

            console.log(`[WA Manager] Found ${activeConnections.length} active connections to restore.`)

            for (const conn of activeConnections) {
                this.getOrCreateClient(conn.id, conn.userId)
            }
        } catch (error) {
            console.error("[WA Manager] Failed to init active connections:", error)
            this.isInitialized = false
        }
    }

    public getOrCreateClient(connectionId: string, userId: string): WhatsAppClient {
        if (this.clients.has(connectionId)) {
            return this.clients.get(connectionId)!
        }

        const client = new WhatsAppClient(connectionId, userId)
        this.clients.set(connectionId, client)

        // Asynchronously initialize the connection
        client.initialize().catch((err) => {
            console.error(`[WA Manager] Error initializing client ${connectionId}:`, err)
        })

        return client
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

        // Wait up to 10 seconds for the QR code to be generated
        let retries = 0
        while (!client.qrCode && client.status === "PENDING" && retries < 20) {
            await new Promise((resolve) => setTimeout(resolve, 500))
            retries++
        }

        return client.qrCode
    }
}

// Persist across Next.js HMR reloads (same pattern as PrismaClient)
const globalForWA = globalThis as unknown as {
    whatsappManager: WhatsAppManager | undefined
}

export const whatsappManager = globalForWA.whatsappManager ?? new WhatsAppManager()

if (process.env.NODE_ENV !== "production") globalForWA.whatsappManager = whatsappManager
