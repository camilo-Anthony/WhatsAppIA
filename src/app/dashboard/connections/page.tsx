"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { QRCodeSVG } from "qrcode.react"
import styles from "./connections.module.css"

// ==========================================
// TIPOS
// ==========================================

interface Connection {
    id: string
    phoneNumber: string | null
    displayName: string | null
    mode: string
    status: string
    lastActive: string | null
    createdAt: string
    wabaId: string | null
    waPhoneNumberId: string | null
    tokenExpiresAt: string | null
}

type ConnectionType = "QR" | "OWN_ACCOUNT" | "MANAGED"
type RegistrationStep = "phone_input" | "verify_code" | "success"

// ==========================================
// UTILIDADES
// ==========================================

function getModeBadge(mode: string) {
    switch (mode) {
        case "QR":
            return { label: "QR", className: styles.badgeQR }
        case "OWN_ACCOUNT":
            return { label: "API Oficial (propia)", className: styles.badgeOwn }
        case "MANAGED":
            return { label: "API Oficial (plataforma)", className: styles.badgeManaged }
        default:
            return { label: mode, className: "" }
    }
}

function getStatusBadge(status: string) {
    switch (status) {
        case "CONNECTED":
            return { class: "badge-success", label: "Conectado", dot: "status-dot-connected" }
        case "PENDING":
            return { class: "badge-warning", label: "Pendiente", dot: "status-dot-pending" }
        case "EXPIRED":
            return { class: "badge-error", label: "Expirado", dot: "status-dot-disconnected" }
        case "REQUIRES_RECONNECTION":
            return { class: "badge-warning", label: "Requiere reconexión", dot: "status-dot-pending" }
        case "TOKEN_EXPIRED":
            return { class: "badge-error", label: "Token expirado", dot: "status-dot-disconnected" }
        case "ERROR":
            return { class: "badge-error", label: "Error", dot: "status-dot-disconnected" }
        default:
            return { class: "badge-error", label: "Desconectado", dot: "status-dot-disconnected" }
    }
}

// ==========================================
// COMPONENTE: TARJETA DE CONEXIÓN
// ==========================================

function ConnectionCard({
    conn,
    onDelete,
    onStatusChange,
}: {
    conn: Connection
    onDelete: (id: string) => void
    onStatusChange: () => void
}) {
    const [qrCode, setQrCode] = useState<string | null>(null)
    const [status, setStatus] = useState(conn.status)
    const [details, setDetails] = useState(conn)

    useEffect(() => {
        let interval: NodeJS.Timeout

        const checkStatus = async () => {
            if (status !== "PENDING" || conn.mode !== "QR") return

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

        if (status === "PENDING" && conn.mode === "QR") {
            checkStatus()
            interval = setInterval(checkStatus, 3000)
        }

        return () => {
            if (interval) clearInterval(interval)
        }
    }, [conn.id, conn.mode, status, qrCode, onStatusChange])

    const statusBadge = getStatusBadge(status)
    const modeBadge = getModeBadge(details.mode)

    return (
        <div className={`card ${styles.connectionCard}`}>
            <div className={styles.cardHeader}>
                <div className={styles.phoneInfo}>
                    <span className={`status-dot ${statusBadge.dot}`} />
                    <span className={styles.phoneNumber}>
                        {details.phoneNumber || "Sin número"}
                    </span>
                </div>
                <div className={styles.badges}>
                    <span className={`${styles.modeBadge} ${modeBadge.className}`}>
                        {modeBadge.label}
                    </span>
                    <span className={`badge ${statusBadge.class}`}>{statusBadge.label}</span>
                </div>
            </div>

            {/* QR code section for pending QR connections */}
            {status === "PENDING" && conn.mode === "QR" && (
                <div className={styles.qrSection}>
                    {qrCode ? (
                        <div className={styles.qrCodeWrapper}>
                            <QRCodeSVG value={qrCode} size={200} level="M" includeMargin />
                            <p style={{ marginTop: 16 }}>Escanea este código con WhatsApp</p>
                            <span style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
                                Abre WhatsApp {">"} Dispositivos vinculados {">"} Vincular un dispositivo
                            </span>
                        </div>
                    ) : (
                        <div className={styles.qrPlaceholder}>
                            <span className="spinner" style={{ marginBottom: 16, width: 32, height: 32 }} />
                            <p>Generando código QR...</p>
                            <span style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
                                Por favor espera, conectando con WhatsApp
                            </span>
                        </div>
                    )}
                </div>
            )}

            <div className={styles.cardDetails}>
                <div className={styles.detailRow}>
                    <span>Tipo:</span>
                    <span>{modeBadge.label}</span>
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
                {details.wabaId && (
                    <div className={styles.detailRow}>
                        <span>WABA ID:</span>
                        <span className={styles.monoText}>{details.wabaId}</span>
                    </div>
                )}
                {details.waPhoneNumberId && (
                    <div className={styles.detailRow}>
                        <span>Phone ID:</span>
                        <span className={styles.monoText}>{details.waPhoneNumberId}</span>
                    </div>
                )}
                {details.tokenExpiresAt && (
                    <div className={styles.detailRow}>
                        <span>Token expira:</span>
                        <span>{new Date(details.tokenExpiresAt).toLocaleDateString("es")}</span>
                    </div>
                )}
                {details.lastActive && (
                    <div className={styles.detailRow}>
                        <span>Última actividad:</span>
                        <span>{new Date(details.lastActive).toLocaleString("es")}</span>
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

// ==========================================
// COMPONENTE: SELECTOR DE TIPO DE CONEXIÓN
// ==========================================

function ConnectionTypeSelector({
    onSelect,
    onClose,
}: {
    onSelect: (type: ConnectionType) => void
    onClose: () => void
}) {
    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>Nueva Conexión</h2>
                    <button className={styles.modalClose} onClick={onClose}>
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                            <path
                                fillRule="evenodd"
                                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                clipRule="evenodd"
                            />
                        </svg>
                    </button>
                </div>

                <p className={styles.modalSubtitle}>Selecciona cómo quieres conectar tu número de WhatsApp</p>

                <div className={styles.typeGrid}>
                    {/* QR Option */}
                    <button className={styles.typeCard} onClick={() => onSelect("QR")}>
                        <div className={styles.typeIcon}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="3" y="3" width="7" height="7" rx="1" />
                                <rect x="14" y="3" width="7" height="7" rx="1" />
                                <rect x="3" y="14" width="7" height="7" rx="1" />
                                <rect x="14" y="14" width="3" height="3" />
                                <rect x="18" y="14" width="3" height="3" />
                                <rect x="14" y="18" width="3" height="3" />
                                <rect x="18" y="18" width="3" height="3" />
                            </svg>
                        </div>
                        <h3>Código QR (Web)</h3>
                        <p>Simula WhatsApp Web escaneando el QR con tu propio celular.</p>
                        <div className={styles.typeDetails}>
                            <div className={styles.detailItem}><span className={styles.detailIconSuccess}></span> Instantáneo y gratis</div>
                            <div className={styles.detailItem}><span className={styles.detailIconSuccess}></span> Usa tu número actual (app)</div>
                            <div className={styles.detailItem}><span className={styles.detailIconError}>!</span> Riesgo de bloqueo si hay spam masivo</div>
                            <div className={styles.detailItem}><span className={styles.detailIconError}>!</span> Tu celular debe tener internet</div>
                        </div>
                        <span className={styles.typeTag}>Pruebas rápidas</span>
                    </button>

                    {/* API Oficial propia */}
                    <button className={styles.typeCard} onClick={() => onSelect("OWN_ACCOUNT")}>
                        <div className={styles.typeIcon}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
                            </svg>
                        </div>
                        <h3>API Oficial (Tu cuenta)</h3>
                        <p>Únete mediante Meta Developers en tu Business Manager y conecta tu cuenta WABA.</p>
                        <div className={styles.typeDetails}>
                            <div className={styles.detailItem}><span className={styles.detailIconSuccess}></span> 100% oficial y antibloqueo</div>
                            <div className={styles.detailItem}><span className={styles.detailIconSuccess}></span> Conservas control total de la cuenta</div>
                            <div className={styles.detailItem}><span className={styles.detailIconWarning}></span> Requiere verificar negocio en Meta</div>
                            <div className={styles.detailItem}><span className={styles.detailIconWarning}></span> Meta cobra costos por conversación</div>
                        </div>
                        <span className={styles.typeTag}>Negocios 100% Seguros</span>
                    </button>

                    {/* API Oficial plataforma */}
                    <button className={styles.typeCard} onClick={() => onSelect("MANAGED")}>
                        <div className={styles.typeIcon}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                                <path d="M16 3.13a4 4 0 010 7.75M21 21v-2a4 4 0 00-3-3.87" />
                            </svg>
                        </div>
                        <h3>Cloud API (Integrada)</h3>
                        <p>Registras un nuevo número directamente en nuestra plataforma por SMS o llamada.</p>
                        <div className={styles.typeDetails}>
                            <div className={styles.detailItem}><span className={styles.detailIconSuccess}></span> Oficial, sin riesgos de bloqueo</div>
                            <div className={styles.detailItem}><span className={styles.detailIconSuccess}></span> Más fácil que configurar cuentas de Meta</div>
                            <div className={styles.detailItem}><span className={styles.detailIconWarning}></span> No se puede usar la App (solo API)</div>
                        </div>
                        <span className={styles.typeTag}>Administrado por nosotros</span>
                    </button>
                </div>
            </div>
        </div>
    )
}

// ==========================================
// COMPONENTE: REGISTRO DE TELÉFONO
// ==========================================

function PhoneRegistrationFlow({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const [step, setStep] = useState<RegistrationStep>("phone_input")
    const [phoneNumber, setPhoneNumber] = useState("")
    const [displayName, setDisplayName] = useState("")
    const [verificationMethod, setVerificationMethod] = useState<"SMS" | "VOICE">("SMS")
    const [code, setCode] = useState("")
    const [connectionId, setConnectionId] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    const submitPhone = async () => {
        if (!phoneNumber.trim()) return
        setLoading(true)
        setError("")

        try {
            const res = await fetch("/api/whatsapp/register-phone", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phoneNumber: phoneNumber.trim(),
                    displayName: displayName.trim() || undefined,
                    verificationMethod,
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || "Error al registrar número")
                return
            }

            setConnectionId(data.connection.id)
            setStep("verify_code")
        } catch {
            setError("Error de conexión")
        } finally {
            setLoading(false)
        }
    }

    const submitCode = async () => {
        if (!code.trim()) return
        setLoading(true)
        setError("")

        try {
            const res = await fetch("/api/whatsapp/verify-code", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    connectionId,
                    code: code.trim(),
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || "Error al verificar código")
                return
            }

            setStep("success")
            setTimeout(() => {
                onSuccess()
                onClose()
            }, 2000)
        } catch {
            setError("Error de conexión")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>
                        {step === "phone_input" && "Registrar Número"}
                        {step === "verify_code" && "Verificar Código"}
                        {step === "success" && "¡Registro Exitoso!"}
                    </h2>
                    <button className={styles.modalClose} onClick={onClose}>
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>

                {error && <div className={styles.errorBanner}>{error}</div>}

                {step === "phone_input" && (
                    <div className={styles.formSection}>
                        <p className={styles.formDescription}>
                            Ingresa tu número de teléfono. Se registrará dentro de nuestra plataforma
                            y recibirás un código de verificación.
                        </p>

                        <label className={styles.formLabel}>Número de teléfono (con código de país)</label>
                        <input
                            type="tel"
                            className={styles.formInput}
                            placeholder="+57 300 123 4567"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                        />

                        <label className={styles.formLabel}>Nombre para mostrar (opcional)</label>
                        <input
                            type="text"
                            className={styles.formInput}
                            placeholder="Mi Negocio"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                        />

                        <label className={styles.formLabel}>Método de verificación</label>
                        <div className={styles.radioGroup}>
                            <label className={styles.radioLabel}>
                                <input
                                    type="radio"
                                    name="method"
                                    value="SMS"
                                    checked={verificationMethod === "SMS"}
                                    onChange={() => setVerificationMethod("SMS")}
                                />
                                <span>SMS</span>
                            </label>
                            <label className={styles.radioLabel}>
                                <input
                                    type="radio"
                                    name="method"
                                    value="VOICE"
                                    checked={verificationMethod === "VOICE"}
                                    onChange={() => setVerificationMethod("VOICE")}
                                />
                                <span>Llamada telefónica</span>
                            </label>
                        </div>

                        <button
                            className="btn btn-primary"
                            onClick={submitPhone}
                            disabled={loading || !phoneNumber.trim()}
                            style={{ marginTop: 16, width: "100%" }}
                        >
                            {loading ? (
                                <>
                                    <span className="spinner" /> Registrando...
                                </>
                            ) : (
                                "Enviar código de verificación"
                            )}
                        </button>
                    </div>
                )}

                {step === "verify_code" && (
                    <div className={styles.formSection}>
                        <p className={styles.formDescription}>
                            Hemos enviado un código de verificación a <strong>{phoneNumber}</strong> por{" "}
                            {verificationMethod === "SMS" ? "SMS" : "llamada telefónica"}.
                        </p>

                        <label className={styles.formLabel}>Código de verificación</label>
                        <input
                            type="text"
                            className={styles.formInput}
                            placeholder="123456"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            maxLength={6}
                            style={{ letterSpacing: "0.5em", textAlign: "center", fontSize: "1.25rem" }}
                        />

                        <button
                            className="btn btn-primary"
                            onClick={submitCode}
                            disabled={loading || !code.trim()}
                            style={{ marginTop: 16, width: "100%" }}
                        >
                            {loading ? (
                                <>
                                    <span className="spinner" /> Verificando...
                                </>
                            ) : (
                                "Verificar código"
                            )}
                        </button>
                    </div>
                )}

                {step === "success" && (
                    <div className={styles.successSection}>
                        <div className={styles.successIcon}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2">
                                <path d="M9 12l2 2 4-4" />
                                <circle cx="12" cy="12" r="10" />
                            </svg>
                        </div>
                        <h3>¡Número registrado!</h3>
                        <p>Tu número {phoneNumber} ha sido verificado y conectado exitosamente.</p>
                    </div>
                )}
            </div>
        </div>
    )
}

// ==========================================
// PÁGINA PRINCIPAL
// ==========================================

function ConnectionsContent() {
    const [connections, setConnections] = useState<Connection[]>([])
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)
    const [showSelector, setShowSelector] = useState(false)
    const [showPhoneRegistration, setShowPhoneRegistration] = useState(false)
    const [metaLoading, setMetaLoading] = useState(false)
    const searchParams = useSearchParams()

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

    // Handle URL params from Meta OAuth callback
    useEffect(() => {
        const success = searchParams.get("success")
        const error = searchParams.get("error")

        if (success === "connected") {
            loadConnections()
        }

        if (error) {
            console.error("Connection error:", error)
        }
    }, [searchParams, loadConnections])

    const handleTypeSelect = async (type: ConnectionType) => {
        setShowSelector(false)

        if (type === "QR") {
            // Crear conexión QR (flujo existente)
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
        } else if (type === "OWN_ACCOUNT") {
            // Iniciar flujo OAuth de Meta
            setMetaLoading(true)
            try {
                const res = await fetch("/api/whatsapp/meta/auth", { method: "POST" })
                const data = await res.json()

                if (data.loginUrl) {
                    window.location.href = data.loginUrl
                }
            } catch (error) {
                console.error("Error initiating Meta OAuth:", error)
            } finally {
                setMetaLoading(false)
            }
        } else if (type === "MANAGED") {
            setShowPhoneRegistration(true)
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
                    <p className={styles.subtitle}>
                        Gestiona tus números de WhatsApp conectados
                    </p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => setShowSelector(true)}
                    disabled={creating || metaLoading}
                >
                    {creating || metaLoading ? (
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
                            <path
                                d="M32 16C23.72 16 17 22.72 17 31C17 33.84 17.77 36.5 19.13 38.81L17.13 46L24.44 44.05C26.68 45.28 29.25 45.97 32 45.97C40.28 45.97 47 39.25 47 30.97C47 22.72 40.28 16 32 16Z"
                                fill="var(--color-primary)"
                                fillOpacity="0.6"
                            />
                        </svg>
                    </div>
                    <h2>No tienes conexiones</h2>
                    <p>Conecta tu primer número de WhatsApp para empezar a automatizar</p>
                    <button className="btn btn-primary btn-lg" onClick={() => setShowSelector(true)}>
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

            {/* Modales */}
            {showSelector && (
                <ConnectionTypeSelector
                    onSelect={handleTypeSelect}
                    onClose={() => setShowSelector(false)}
                />
            )}

            {showPhoneRegistration && (
                <PhoneRegistrationFlow
                    onClose={() => setShowPhoneRegistration(false)}
                    onSuccess={loadConnections}
                />
            )}
        </div>
    )
}

export default function ConnectionsPage() {
    return (
        <Suspense fallback={
            <div className={styles.container}>
                <div className={styles.header}>
                    <div>
                        <h1 className={styles.title}>Conexiones WhatsApp</h1>
                        <p className={styles.subtitle}>Gestiona tus números de WhatsApp conectados</p>
                    </div>
                </div>
                <div className={styles.grid}>
                    {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="card">
                            <div className="skeleton" style={{ width: "100%", height: 200 }} />
                        </div>
                    ))}
                </div>
            </div>
        }>
            <ConnectionsContent />
        </Suspense>
    )
}
