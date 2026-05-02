/**
 * WhatsApp Client — SOLO conexión socket Baileys.
 * 
 * Responsabilidad ÚNICA: gestionar el socket, QR, auth y reconexión.
 * NO parsea mensajes (→ listener.ts)
 * NO encola ni deduplica (→ dispatcher.ts)
 * NO procesa IA nunca.
 */

import makeWASocket, {
    DisconnectReason,
    fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys"
import { Boom } from "@hapi/boom"
import path from "node:path"
import fs from "node:fs"
import { prisma } from "../db"
import { handleBaileysMessage } from "./listener"
import { dispatch } from "@/lib/queue/dispatcher"
import { usePostgresAuthState } from "./auth"

export class WhatsAppClient {
    public connectionId: string
    public userId: string
    public qrCode: string | null = null
    public status: "PENDING" | "CONNECTED" | "DISCONNECTED" = "PENDING"

    private socket: ReturnType<typeof makeWASocket> | null = null
    private authFolder: string

    constructor(connectionId: string, userId: string) {
        this.connectionId = connectionId
        this.userId = userId
        this.authFolder = path.join(process.cwd(), ".whatsapp_auth", connectionId)
    }

    public async initialize() {
        const { state, saveCreds } = await usePostgresAuthState(this.connectionId)
        const { version } = await fetchLatestBaileysVersion()

        this.socket = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            generateHighQualityLinkPreview: true,
            browser: ["WhatsApp IA", "Chrome", "1.0.0"],
        })

        this.socket.ev.on("creds.update", saveCreds)

        // =========================================
        // CONNECTION HANDLER
        // =========================================
        this.socket.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update

            if (qr) {
                this.qrCode = qr
                console.log(`[WA] QR generado para conexión ${this.connectionId}`)
            }

            if (connection === "close") {
                const shouldReconnect =
                    (lastDisconnect?.error as Boom)?.output?.statusCode !==
                    DisconnectReason.loggedOut

                this.status = "DISCONNECTED"
                this.qrCode = null

                if (shouldReconnect) {
                    console.log("[WA] Reconectando...")
                    setTimeout(() => this.initialize(), 3000)
                } else {
                    console.log("[WA] Sesión cerrada. Limpiando...")
                    this.cleanupAuthFolder()
                    await prisma.whatsAppConnection.update({
                        where: { id: this.connectionId },
                        data: { status: "DISCONNECTED" },
                    })
                }
            } else if (connection === "open") {
                console.log(`[WA] Conexión ${this.connectionId} abierta exitosamente`)
                this.status = "CONNECTED"
                this.qrCode = null

                const user = this.socket?.user
                const phone = user?.id ? user.id.split(":")[0] : null
                const name = user?.name || "WhatsApp User"

                await prisma.whatsAppConnection.update({
                    where: { id: this.connectionId },
                    data: {
                        status: "CONNECTED",
                        phoneNumber: phone,
                        displayName: name,
                        lastActive: new Date(),
                    },
                })
            }
        })

        // =========================================
        // MESSAGE HANDLER — Delega a listener + dispatcher
        // =========================================
        this.socket.ev.on("messages.upsert", (m) => {
            for (const rawMsg of m.messages) {
                const normalized = handleBaileysMessage(
                    rawMsg,
                    this.connectionId,
                    this.userId
                )
                if (normalized) {
                    dispatch(normalized).catch((err) => {
                        console.error(`[WA] Error en dispatch:`, err)
                    })
                }
            }
        })
    }

    public async sendMessage(jid: string, text: string) {
        if (!this.socket) throw new Error("Socket not initialized")
        console.log(`[WA] Intentando enviar a JID exacto: "${jid}"`)
        try {
            // Añadimos simulación de "escribiendo..." para calentar el socket
            await this.socket.sendPresenceUpdate("composing", jid)
            await new Promise((resolve) => setTimeout(resolve, 1000))
            await this.socket.sendPresenceUpdate("paused", jid)

            const result = await this.socket.sendMessage(jid, { text })
            
            // Logueamos solo un resumen de llaves para no inundar si es string largo
            console.log(`[WA] Envío completado. MessageId: ${result?.key?.id}, status: ${result?.status}`)
            
            return result
        } catch (error) {
            console.error(`[WA] Error crítico en socket.sendMessage:`, error)
            throw error
        }
    }

    public async logout() {
        if (this.socket) {
            await this.socket.logout()
            this.socket = null
        }
        this.cleanupAuthFolder()
    }

    private cleanupAuthFolder() {
        if (fs.existsSync(this.authFolder)) {
            fs.rmSync(this.authFolder, { recursive: true, force: true })
        }
    }
}
