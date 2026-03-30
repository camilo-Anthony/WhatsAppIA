import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys"
import { Boom } from "@hapi/boom"
import path from "node:path"
import fs from "node:fs"
import { prisma } from "../db"

export class WhatsAppClient {
    public connectionId: string
    public userId: string
    public qrCode: string | null = null
    public status: "PENDING" | "CONNECTED" | "DISCONNECTED" = "PENDING"

    private socket: ReturnType<typeof makeWASocket> | null = null
    private authFolder: string
    private processing: Set<string> = new Set() // Prevent duplicate processing

    constructor(connectionId: string, userId: string) {
        this.connectionId = connectionId
        this.userId = userId
        this.authFolder = path.join(process.cwd(), ".whatsapp_auth", connectionId)
    }

    public async initialize() {
        const { state, saveCreds } = await useMultiFileAuthState(this.authFolder)
        const { version } = await fetchLatestBaileysVersion()

        this.socket = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            generateHighQualityLinkPreview: true,
            browser: ["WhatsApp IA", "Chrome", "1.0.0"],
        })

        this.socket.ev.on("creds.update", saveCreds)

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
        // MESSAGE HANDLER — Enqueue to Queue System
        // =========================================
        this.socket.ev.on("messages.upsert", async (m) => {
            for (const msg of m.messages) {
                if (!msg.message || msg.key.fromMe) continue

                const remoteJid = msg.key.remoteJid
                if (!remoteJid) continue
                const isPersonalChat = remoteJid.endsWith("@s.whatsapp.net") || remoteJid.endsWith("@lid")
                if (!isPersonalChat) continue

                // Extraer contenido de texto
                const textContent =
                    msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    msg.message.imageMessage?.caption ||
                    msg.message.videoMessage?.caption ||
                    null

                if (!textContent) continue

                // Prevenir procesamiento duplicado
                const msgId = msg.key.id || `${remoteJid}-${Date.now()}`
                if (this.processing.has(msgId)) continue
                this.processing.add(msgId)

                // Extraer info del remitente
                const clientPhone = remoteJid.replace("@s.whatsapp.net", "").replace("@lid", "")
                const clientName = msg.pushName || undefined

                console.log(`[WA] Mensaje de +${clientPhone}: "${textContent}"`)

                try {
                    // Intentar encolar en BullMQ (requiere Redis)
                    const { incomingQueue } = await import("../queue/incoming")
                    await incomingQueue.add("incoming-message", {
                        connectionId: this.connectionId,
                        userId: this.userId,
                        senderPhone: clientPhone,
                        senderName: clientName,
                        messageContent: textContent,
                        messageId: msgId,
                        source: "baileys" as const,
                    })

                    console.log(`[WA] Mensaje encolado para procesamiento — de: +${clientPhone}`)
                } catch {
                    // Fallback: procesar directamente sin Redis/BullMQ
                    console.log(`[WA] Redis no disponible, procesando directamente — de: +${clientPhone}`)
                    try {
                        const { processIncomingMessage } = await import("../ai/engine")
                        const result = await processIncomingMessage({
                            userId: this.userId,
                            connectionId: this.connectionId,
                            clientPhone,
                            clientName,
                            messageContent: textContent,
                        })

                        // Enviar respuesta directamente por el socket
                        if (result.response && this.socket) {
                            await this.socket.sendMessage(remoteJid, { text: result.response })
                            console.log(`[WA] Respuesta enviada a +${clientPhone}: "${result.response.substring(0, 80)}..."`)
                        }
                    } catch (directError) {
                        console.error(`[WA] Error en procesamiento directo:`, directError)
                    }
                } finally {
                    this.processing.delete(msgId)
                }
            }
        })
    }

    public async sendMessage(jid: string, text: string) {
        if (!this.socket) throw new Error("Socket not initialized")
        await this.socket.sendMessage(jid, { text })
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

