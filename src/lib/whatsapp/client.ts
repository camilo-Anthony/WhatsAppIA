import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys"
import { Boom } from "@hapi/boom"
import path from "node:path"
import fs from "node:fs"
import { prisma } from "../db"
import { processIncomingMessage } from "../ai/engine"

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
                console.log(`[WA] QR generated for connection ${this.connectionId}`)
            }

            if (connection === "close") {
                const shouldReconnect =
                    (lastDisconnect?.error as Boom)?.output?.statusCode !==
                    DisconnectReason.loggedOut

                this.status = "DISCONNECTED"
                this.qrCode = null

                if (shouldReconnect) {
                    console.log("[WA] Reconnecting...")
                    setTimeout(() => this.initialize(), 3000)
                } else {
                    console.log("[WA] Logged out. Cleaning up...")
                    this.cleanupAuthFolder()
                    await prisma.whatsAppConnection.update({
                        where: { id: this.connectionId },
                        data: { status: "DISCONNECTED" },
                    })
                }
            } else if (connection === "open") {
                console.log(`[WA] Connection ${this.connectionId} opened successfully`)
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
        // MESSAGE HANDLER — AI Auto-Response
        // =========================================
        this.socket.ev.on("messages.upsert", async (m) => {
            console.log(`[WA DEBUG] messages.upsert fired — type: ${m.type}, count: ${m.messages.length}`)

            for (const msg of m.messages) {
                const jid = msg.key.remoteJid || "unknown"
                const fromMe = msg.key.fromMe
                const hasMessage = !!msg.message
                console.log(`[WA DEBUG] Message — jid: ${jid}, fromMe: ${fromMe}, hasMessage: ${hasMessage}, type: ${m.type}`)

                if (!msg.message || msg.key.fromMe) continue

                // Accept individual chats: @s.whatsapp.net (classic) and @lid (new format)
                // Reject groups (@g.us) and status broadcasts
                const remoteJid = msg.key.remoteJid
                if (!remoteJid) continue
                const isPersonalChat = remoteJid.endsWith("@s.whatsapp.net") || remoteJid.endsWith("@lid")
                if (!isPersonalChat) continue

                // Extract text content
                const textContent =
                    msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    msg.message.imageMessage?.caption ||
                    msg.message.videoMessage?.caption ||
                    null

                if (!textContent) continue // Skip non-text messages (images, stickers, etc.)

                // Prevent duplicate processing
                const msgId = msg.key.id || `${remoteJid}-${Date.now()}`
                if (this.processing.has(msgId)) continue
                this.processing.add(msgId)

                // Extract sender info
                const clientPhone = remoteJid.replace("@s.whatsapp.net", "").replace("@lid", "")
                const clientName = msg.pushName || undefined

                console.log(`[WA] Message from +${clientPhone}: "${textContent}"`)

                try {
                    // Process with AI engine
                    const result = await processIncomingMessage({
                        userId: this.userId,
                        connectionId: this.connectionId,
                        clientPhone,
                        clientName,
                        messageContent: textContent,
                    })

                    // Send the AI response back via WhatsApp
                    await this.socket?.sendMessage(msg.key.remoteJid!, {
                        text: result.response,
                    })

                    console.log(`[WA] Response to +${clientPhone}: "${result.response.substring(0, 80)}..." (${result.tokensUsed.total} tokens)`)

                } catch (error: unknown) {
                    const errorMessage = error instanceof Error ? error.message : "Unknown error"

                    if (errorMessage === "ASSISTANT_NOT_CONFIGURED") {
                        console.log(`[WA] Assistant not configured for user ${this.userId}`)
                    } else if (errorMessage === "ASSISTANT_INACTIVE") {
                        console.log(`[WA] Assistant is inactive for user ${this.userId}`)
                    } else if (errorMessage === "RATE_LIMITED") {
                        console.log(`[WA] Rate limited by Groq API`)
                        await this.socket?.sendMessage(msg.key.remoteJid!, {
                            text: "Estamos procesando muchas solicitudes en este momento. Por favor intenta de nuevo en unos segundos.",
                        })
                    } else {
                        console.error(`[WA] Error processing message:`, error)
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

