"use client"

import { useState, useEffect, useCallback } from "react"
import { Search, MessageSquare } from "lucide-react"
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
                        <Search size={16} className={styles.searchIcon} />
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
                            <MessageSquare size={48} style={{ color: "var(--color-text-muted)" }} />
                            <p>Selecciona una conversación</p>
                            <span>Elige una conversación de la lista para ver los mensajes</span>
                        </div>
                    ) : (
                        <>
                            {/* Chat Header */}
                            <div className={styles.chatHeader}>
                                <div className={styles.avatar}>
                                    {(
                                        conversations.find(c => c.id === selectedId)?.clientName?.[0] || 
                                        conversations.find(c => c.id === selectedId)?.clientPhone?.[0] || "?"
                                    ).toUpperCase()}
                                </div>
                                <div className={styles.chatHeaderInfo}>
                                    <h3>{conversations.find(c => c.id === selectedId)?.clientName || conversations.find(c => c.id === selectedId)?.clientPhone}</h3>
                                    <span>{conversations.find(c => c.id === selectedId)?.clientPhone}</span>
                                </div>
                            </div>
                            
                            {/* Chat Messages */}
                            {loadingMessages ? (
                                <div className={styles.loadingMessages}>
                                    <span className="spinner" />
                                    <p>Cargando mensajes...</p>
                                </div>
                            ) : messages.length === 0 ? (
                                <div className={styles.emptyMessages}>
                                    <p>Sin mensajes</p>
                                    <span>El historial de chat está vacío.</span>
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
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
