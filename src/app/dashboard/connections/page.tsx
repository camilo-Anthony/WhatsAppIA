"use client"

import { useState, useEffect, useCallback } from "react"
import { QRCodeSVG } from "qrcode.react"
import styles from "./connections.module.css"

interface Connection {
    id: string
    phoneNumber: string | null
    displayName: string | null
    mode: string
    status: string
    lastActive: string | null
    createdAt: string
}

function ConnectionCard({ conn, onDelete, onStatusChange }: { conn: Connection, onDelete: (id: string) => void, onStatusChange: () => void }) {
    const [qrCode, setQrCode] = useState<string | null>(null)
    const [status, setStatus] = useState(conn.status)
    const [details, setDetails] = useState(conn)

    useEffect(() => {
        let interval: NodeJS.Timeout

        const checkStatus = async () => {
            if (status !== "PENDING") return

            try {
                const res = await fetch(`/api/whatsapp/connections/${conn.id}`)
                if (res.ok) {
                    const data = await res.json()

                    if (data.connection.status !== status) {
                        setStatus(data.connection.status)
                        setDetails(data.connection)
                        onStatusChange()
                    }

                    if (data.qrCode && data.qrCode !== qrCode) {
                        setQrCode(data.qrCode)
                    }
                }
            } catch (error) {
                console.error("Error polling connection:", error)
            }
        }

        if (status === "PENDING") {
            checkStatus() // Check immediately
            interval = setInterval(checkStatus, 3000) // Poll every 3 seconds
        }

        return () => {
            if (interval) clearInterval(interval)
        }
    }, [conn.id, status, qrCode, onStatusChange])

    const getStatusBadge = (s: string) => {
        switch (s) {
            case "CONNECTED":
                return { class: "badge-success", label: "Conectado", dot: "status-dot-connected" }
            case "PENDING":
                return { class: "badge-warning", label: "Pendiente", dot: "status-dot-pending" }
            case "EXPIRED":
                return { class: "badge-error", label: "Expirado", dot: "status-dot-disconnected" }
            default:
                return { class: "badge-error", label: "Desconectado", dot: "status-dot-disconnected" }
        }
    }

    const badge = getStatusBadge(status)

    return (
        <div className={`card ${styles.connectionCard}`}>
            <div className={styles.cardHeader}>
                <div className={styles.phoneInfo}>
                    <span className={`status-dot ${badge.dot}`} />
                    <span className={styles.phoneNumber}>
                        {details.phoneNumber || "Sin número"}
                    </span>
                </div>
                <span className={`badge ${badge.class}`}>{badge.label}</span>
            </div>

            {status === "PENDING" && (
                <div className={styles.qrSection}>
                    {qrCode ? (
                        <div className={styles.qrCodeWrapper}>
                            <QRCodeSVG value={qrCode} size={200} level="M" includeMargin />
                            <p style={{ marginTop: 16 }}>Escanea este código con WhatsApp</p>
                            <span style={{ fontSize: '0.875rem', color: "var(--color-text-muted)" }}>Abre WhatsApp {'>'} Dispositivos vinculados {'>'} Vincular un dispositivo</span>
                        </div>
                    ) : (
                        <div className={styles.qrPlaceholder}>
                            <span className="spinner" style={{ marginBottom: 16, width: 32, height: 32 }} />
                            <p>Generando código QR...</p>
                            <span style={{ fontSize: '0.875rem', color: "var(--color-text-muted)" }}>Por favor espera, conectando con WhatsApp</span>
                        </div>
                    )}
                </div>
            )}

            <div className={styles.cardDetails}>
                <div className={styles.detailRow}>
                    <span>Modo:</span>
                    <span>{details.mode === "QR" ? "Código QR" : details.mode}</span>
                </div>
                <div className={styles.detailRow}>
                    <span>Creado:</span>
                    <span>{new Date(details.createdAt).toLocaleDateString("es")}</span>
                </div>
                {details.displayName && (
                    <div className={styles.detailRow}>
                        <span>Nombre:</span>
                        <span>{details.displayName}</span>
                    </div>
                )}
            </div>

            <div className={styles.cardActions}>
                <button className="btn btn-danger btn-sm" onClick={() => onDelete(conn.id)}>
                    Eliminar
                </button>
            </div>
        </div>
    )
}

export default function ConnectionsPage() {
    const [connections, setConnections] = useState<Connection[]>([])
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)

    const loadConnections = useCallback(async () => {
        try {
            const res = await fetch("/api/whatsapp/connections")
            if (res.ok) {
                const data = await res.json()
                setConnections(data.connections)
            }
        } catch (error) {
            console.error("Error loading connections:", error)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadConnections()
    }, [loadConnections])

    const createConnection = async () => {
        setCreating(true)
        try {
            const res = await fetch("/api/whatsapp/connections", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "QR" }),
            })
            if (res.ok) {
                await loadConnections()
            }
        } catch (error) {
            console.error("Error creating connection:", error)
        } finally {
            setCreating(false)
        }
    }

    const deleteConnection = async (id: string) => {
        try {
            await fetch(`/api/whatsapp/connections?id=${id}`, { method: "DELETE" })
            await loadConnections()
        } catch (error) {
            console.error("Error deleting connection:", error)
        }
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Conexiones WhatsApp</h1>
                    <p className={styles.subtitle}>Gestiona tus números de WhatsApp conectados</p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={createConnection}
                    disabled={creating}
                >
                    {creating ? (
                        <>
                            <span className="spinner" />
                            Conectando...
                        </>
                    ) : (
                        "+ Nueva conexión"
                    )}
                </button>
            </div>

            {loading ? (
                <div className={styles.grid}>
                    {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="card">
                            <div className="skeleton" style={{ width: "100%", height: 200 }} />
                        </div>
                    ))}
                </div>
            ) : connections.length === 0 ? (
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>
                        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                            <rect width="64" height="64" rx="20" fill="var(--color-primary-light)" />
                            <path d="M32 16C23.72 16 17 22.72 17 31C17 33.84 17.77 36.5 19.13 38.81L17.13 46L24.44 44.05C26.68 45.28 29.25 45.97 32 45.97C40.28 45.97 47 39.25 47 30.97C47 22.72 40.28 16 32 16Z" fill="var(--color-primary)" fillOpacity="0.6" />
                        </svg>
                    </div>
                    <h2>No tienes conexiones</h2>
                    <p>Conecta tu primer número de WhatsApp para empezar a automatizar</p>
                    <button className="btn btn-primary btn-lg" onClick={createConnection}>
                        + Conectar WhatsApp
                    </button>
                </div>
            ) : (
                <div className={styles.grid}>
                    {connections.map((conn) => (
                        <ConnectionCard
                            key={conn.id}
                            conn={conn}
                            onDelete={deleteConnection}
                            onStatusChange={loadConnections}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
