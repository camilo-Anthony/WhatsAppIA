"use client"

import { useState, useEffect, useCallback } from "react"
import styles from "./conversations.module.css"

interface Message {
    id: string
    direction: "INCOMING" | "OUTGOING"
    content: string
    timestamp: string
}

interface Conversation {
    id: string
    clientPhone: string
    clientName: string | null
    updatedAt: string
    messages: Message[]
    _count: { messages: number }
}

export default function ConversationsPage() {
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [search, setSearch] = useState("")
    const [loading, setLoading] = useState(true)
    const [loadingMessages, setLoadingMessages] = useState(false)

    const loadConversations = useCallback(async () => {
        try {
            const res = await fetch(`/api/conversations?search=${encodeURIComponent(search)}`)
            if (res.ok) {
                const data = await res.json()
                setConversations(data.conversations)
            }
        } catch (error) {
            console.error("Error loading conversations:", error)
        } finally {
            setLoading(false)
        }
    }, [search])

    useEffect(() => {
        loadConversations()
    }, [loadConversations])

    const loadMessages = async (conversationId: string) => {
        setSelectedId(conversationId)
        setLoadingMessages(true)

        try {
            const res = await fetch(`/api/conversations/${conversationId}`)
            if (res.ok) {
                const data = await res.json()
                setMessages(data.conversation.messages)
            }
        } catch (error) {
            console.error("Error loading messages:", error)
        } finally {
            setLoadingMessages(false)
        }
    }

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr)
        return date.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })
    }

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr)
        const today = new Date()
        const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
        if (diffDays === 0) return "Hoy"
        if (diffDays === 1) return "Ayer"
        return date.toLocaleDateString("es", { day: "2-digit", month: "short" })
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Conversaciones</h1>
                <p className={styles.subtitle}>Historial de mensajes con tus clientes</p>
            </div>

            <div className={styles.layout}>
                {/* Conversation List */}
                <div className={styles.listPanel}>
                    <div className={styles.searchBox}>
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className={styles.searchIcon}>
                            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                        </svg>
                        <input
                            type="text"
                            className={`input ${styles.searchInput}`}
                            placeholder="Buscar por número o nombre..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <div className={styles.conversationList}>
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className={styles.conversationItem}>
                                    <div className="skeleton" style={{ width: 40, height: 40, borderRadius: "50%" }} />
                                    <div style={{ flex: 1 }}>
                                        <div className="skeleton" style={{ width: "60%", height: 14, marginBottom: 4 }} />
                                        <div className="skeleton" style={{ width: "80%", height: 12 }} />
                                    </div>
                                </div>
                            ))
                        ) : conversations.length === 0 ? (
                            <div className={styles.emptyState}>
                                <p>No hay conversaciones aún</p>
                                <span>Las conversaciones aparecerán aquí cuando tus clientes envíen mensajes</span>
                            </div>
                        ) : (
                            conversations.map((conv) => (
                                <button
                                    key={conv.id}
                                    className={`${styles.conversationItem} ${selectedId === conv.id ? styles.conversationActive : ""}`}
                                    onClick={() => loadMessages(conv.id)}
                                >
                                    <div className={styles.avatar}>
                                        {(conv.clientName?.[0] || conv.clientPhone?.[0] || "?").toUpperCase()}
                                    </div>
                                    <div className={styles.convInfo}>
                                        <div className={styles.convName}>
                                            {conv.clientName || conv.clientPhone}
                                        </div>
                                        <div className={styles.convPreview}>
                                            {conv.messages[0]?.content?.slice(0, 50) || "Sin mensajes"}
                                        </div>
                                    </div>
                                    <div className={styles.convMeta}>
                                        <span className={styles.convTime}>{formatDate(conv.updatedAt)}</span>
                                        <span className={`badge badge-info ${styles.convCount}`}>
                                            {conv._count.messages}
                                        </span>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Message Thread */}
                <div className={styles.messagePanel}>
                    {!selectedId ? (
                        <div className={styles.emptyMessages}>
                            <svg width="48" height="48" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--color-text-muted)" }}>
                                <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                            </svg>
                            <p>Selecciona una conversación</p>
                            <span>Elige una conversación de la lista para ver los mensajes</span>
                        </div>
                    ) : loadingMessages ? (
                        <div className={styles.loadingMessages}>
                            <span className="spinner" />
                            <p>Cargando mensajes...</p>
                        </div>
                    ) : (
                        <div className={styles.messageList}>
                            {messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`${styles.message} ${msg.direction === "OUTGOING" ? styles.messageOut : styles.messageIn}`}
                                >
                                    <div className={styles.messageBubble}>
                                        <p>{msg.content}</p>
                                        <span className={styles.messageTime}>{formatTime(msg.timestamp)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
