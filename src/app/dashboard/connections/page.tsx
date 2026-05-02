"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { QRCodeSVG } from "qrcode.react"
import { 
    Plus, 
    X, 
    QrCode, 
    Layers, 
    UserCheck, 
    Smartphone, 
    Check, 
    AlertTriangle, 
    Info, 
    Trash2,
    CheckCircle2
} from "lucide-react"
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
    assistantConfigId: string | null
    isAssistantActive: boolean
    assistantConfig: { id: string; name: string } | null
}

interface AssistantProfile {
    id: string
    name: string
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
    profiles,
    onDelete,
    onStatusChange,
}: {
    conn: Connection
    profiles: AssistantProfile[]
    onDelete: (id: string) => void
    onStatusChange: () => void
}) {
    const [qrCode, setQrCode] = useState<string | null>(null)
    const [status, setStatus] = useState(conn.status)
    const [details, setDetails] = useState(conn)
    const [isAssistantActive, setIsAssistantActive] = useState(conn.isAssistantActive)
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(conn.assistantConfigId)

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

    const toggleAssistant = async () => {
        const newValue = !isAssistantActive
        setIsAssistantActive(newValue)
        try {
            await fetch(`/api/connections/${conn.id}/assistant`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isAssistantActive: newValue, assistantConfigId: selectedProfileId }),
            })
        } catch (error) {
            console.error("Error toggling assistant:", error)
            setIsAssistantActive(!newValue) // revert
        }
    }

    const changeProfile = async (profileId: string | null) => {
        setSelectedProfileId(profileId)
        try {
            await fetch(`/api/connections/${conn.id}/assistant`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assistantConfigId: profileId }),
            })
        } catch (error) {
            console.error("Error changing profile:", error)
            setSelectedProfileId(conn.assistantConfigId) // revert
        }
    }

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

            {status === "PENDING" && conn.mode === "QR" && (
                <div className={styles.qrSection}>
                    {qrCode ? (
                        <div className={styles.qrCodeWrapper}>
                            <QRCodeSVG value={qrCode} size={200} level="M" includeMargin />
                            <p className={styles.qrInstructionMargin}>Escanea este código con WhatsApp</p>
                            <small className={styles.monoText}>
                                Abre WhatsApp {">"} Dispositivos vinculados {">"} Vincular un dispositivo
                            </small>
                        </div>
                    ) : (
                        <div className={styles.qrPlaceholder}>
                            <span className={`spinner ${styles.spinnerLarge}`} />
                            <p>Generando código QR...</p>
                            <small className={styles.monoText}>
                                Por favor espera, conectando con WhatsApp
                            </small>
                        </div>
                    )}
                </div>
            )}

            {/* Assistant Controls */}
            {status === "CONNECTED" && (
                <div className={styles.assistantControls}>
                    <div className={styles.assistantToggleRow}>
                        <span className={styles.assistantLabel}>Asistente IA</span>
                        <button
                            className={`toggle ${isAssistantActive ? "toggle-on" : ""}`}
                            onClick={toggleAssistant}
                            title={isAssistantActive ? "Desactivar IA" : "Activar IA"}
                        >
                            <span className="toggle-dot" />
                        </button>
                    </div>
                    {isAssistantActive && (
                        <div className={styles.profileSelectorRow}>
                            <select
                                className={styles.profileSelectSmall}
                                value={selectedProfileId || ""}
                                onChange={(e) => changeProfile(e.target.value || null)}
                            >
                                <option value="">Sin perfil asignado</option>
                                {profiles.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
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
                {details.lastActive && (
                    <div className={styles.detailRow}>
                        <span>Última actividad:</span>
                        <span>{new Date(details.lastActive).toLocaleString("es")}</span>
                    </div>
                )}
            </div>

            <div className={styles.cardActions}>
                <button className="btn btn-danger btn-sm" onClick={() => onDelete(conn.id)}>
                    <Trash2 size={14} /> Eliminar
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
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose()
        }
        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [onClose])

    const options = [
        {
            type: "QR" as ConnectionType,
            icon: <QrCode size={28} />,
            title: "Código QR",
            subtitle: "Pruebas",
            description: "Escanea con tu celular como en WhatsApp Web.",
            pros: ["Instantáneo", "Usa tu número actual"],
            cons: ["Requiere celular con internet", "Riesgo de bloqueo por spam"],
            tag: "Pruebas",
            recommended: false,
        },
        {
            type: "OWN_ACCOUNT" as ConnectionType,
            icon: <Layers size={28} />,
            title: "API Oficial",
            subtitle: "Tu cuenta",
            description: "Conecta tu WABA desde Meta Business Manager.",
            pros: ["100% oficial y seguro", "Control total de la cuenta"],
            cons: ["Requiere verificar negocio", "Meta cobra por conversación"],
            tag: "Oficial",
            recommended: true,
        },
        {
            type: "MANAGED" as ConnectionType,
            icon: <UserCheck size={28} />,
            title: "Cloud API",
            subtitle: "Integrada",
            description: "Registra un nuevo número desde nuestra plataforma.",
            pros: ["Sin riesgos de bloqueo", "Configuración más sencilla"],
            cons: ["Solo disponible vía API (sin app)"],
            tag: "Oficial",
            recommended: true,
        },
    ]

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={`${styles.modal} ${styles.modalWideGrid}`} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>Nueva Conexión</h2>
                    <button className={styles.modalClose} onClick={onClose} aria-label="Cerrar modal">
                        <X size={20} />
                    </button>
                </div>

                <p className={styles.modalSubtitle}>Selecciona cómo quieres conectar tu número de WhatsApp</p>

                <div className={styles.typeGridCards}>
                    {options.map((opt) => (
                        <div
                            key={opt.type}
                            className={`${styles.typeCardCol} ${opt.recommended ? styles.typeCardColRecommended : ""}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => onSelect(opt.type)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(opt.type) }}
                        >
                            {opt.recommended && (
                                <span className={styles.recommendedBadgeCol}>Recomendado</span>
                            )}
                            
                            <div className={styles.typeCardColIcon}>
                                {opt.icon}
                            </div>
                            
                            <div className={styles.typeCardColHeader}>
                                <h3 className={styles.typeCardColTitle}>{opt.title}</h3>
                                <span className={styles.typeCardColSubtitle}>{opt.subtitle}</span>
                            </div>
                            
                            <p className={styles.typeCardColDesc}>{opt.description}</p>
                            
                            <div className={styles.typeCardColDetails}>
                                <div className={styles.typeCardColPros}>
                                    {opt.pros.map((p) => (
                                        <span key={p} className={styles.typeCardColPro}>
                                            <Check size={14} className={styles.detailIconSuccess} /> {p}
                                        </span>
                                    ))}
                                </div>
                                <div className={styles.typeCardColCons}>
                                    {opt.cons.map((c) => (
                                        <span key={c} className={styles.typeCardColCon}>
                                            <AlertTriangle size={14} className={styles.detailIconMuted} /> {c}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
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

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose()
        }
        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [onClose])

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
                    <button className={styles.modalClose} onClick={onClose} aria-label="Cerrar modal">
                        <X size={20} />
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
                            className={`btn btn-primary ${styles.fullWidthBtn}`}
                            onClick={submitPhone}
                            disabled={loading || !phoneNumber.trim()}
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
                            className={`${styles.formInput} ${styles.codeInput}`}
                            placeholder="123456"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            maxLength={6}
                        />

                        <button
                            className={`btn btn-primary ${styles.fullWidthBtn}`}
                            onClick={submitCode}
                            disabled={loading || !code.trim()}
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
                            <CheckCircle2 size={48} color="var(--color-success)" />
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
    const [profiles, setProfiles] = useState<AssistantProfile[]>([])
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

    const loadProfiles = useCallback(async () => {
        try {
            const res = await fetch("/api/assistant/config")
            if (res.ok) {
                const data = await res.json()
                if (data.profiles) {
                    setProfiles(data.profiles.map((p: AssistantProfile) => ({ id: p.id, name: p.name })))
                }
            }
        } catch (error) {
            console.error("Error loading profiles:", error)
        }
    }, [])

    useEffect(() => {
        loadConnections()
        loadProfiles()
    }, [loadConnections, loadProfiles])

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
                        <><Plus size={18} /> Nueva conexión</>
                    )}
                </button>
            </div>

            {loading ? (
                <div className={styles.grid}>
                    {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="card">
                            <div className={`skeleton ${styles.skeletonCard}`} />
                        </div>
                    ))}
                </div>
            ) : connections.length === 0 ? (
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>
                        <Smartphone size={64} color="var(--color-primary)" />
                    </div>
                    <h2>No tienes conexiones</h2>
                    <p>Conecta tu primer número de WhatsApp para empezar a automatizar</p>
                    <button className="btn btn-primary btn-lg" onClick={() => setShowSelector(true)}>
                        <Plus size={20} /> Conectar WhatsApp
                    </button>
                </div>
            ) : (
                <div className={styles.grid}>
                    {connections.map((conn) => (
                        <ConnectionCard
                            key={conn.id}
                            conn={conn}
                            profiles={profiles}
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
                            <div className={`skeleton ${styles.skeletonCard}`} />
                        </div>
                    ))}
                </div>
            </div>
        }>
            <ConnectionsContent />
        </Suspense>
    )
}
