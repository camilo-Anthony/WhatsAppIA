"use client"

import { useState, useEffect, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import {
    Calendar,
    FileText,
    Book,
    MessageSquareMore,
    ShoppingBag,
    Folder,
    CheckCircle2,
    AlertCircle,
    X
} from "lucide-react"
import styles from "./integrations.module.css"

// ==========================================
// PROVEEDORES DISPONIBLES
// ==========================================

interface ProviderInfo {
    provider: string
    name: string
    type: string
    description: string
    icon: React.ReactNode
    iconClass: string
    available: boolean
}

const AVAILABLE_PROVIDERS: ProviderInfo[] = [
    {
        provider: "GOOGLE_CALENDAR",
        name: "Google Calendar",
        type: "CALENDAR",
        description: "Gestiona citas y disponibilidad. El agente podrá agendar, consultar y cancelar eventos.",
        icon: <Calendar size={24} />,
        iconClass: "iconCalendar",
        available: true,
    },
    {
        provider: "GOOGLE_SHEETS",
        name: "Google Sheets",
        type: "CRM",
        description: "Registra leads, ventas y datos de clientes automáticamente en hojas de cálculo.",
        icon: <FileText size={24} />,
        iconClass: "iconSheets",
        available: false,
    },
    {
        provider: "NOTION",
        name: "Notion",
        type: "KNOWLEDGE",
        description: "Consulta y crea páginas en Notion. Base de conocimiento del negocio.",
        icon: <Book size={24} />,
        iconClass: "iconNotion",
        available: false,
    },
    {
        provider: "SLACK",
        name: "Slack",
        type: "NOTIFICATIONS",
        description: "Envía notificaciones a tu equipo cuando ocurran eventos importantes.",
        icon: <MessageSquareMore size={24} />,
        iconClass: "iconSlack",
        available: false,
    },
    {
        provider: "SHOPIFY",
        name: "Shopify",
        type: "ECOMMERCE",
        description: "Consulta productos, stock y pedidos directamente desde WhatsApp.",
        icon: <ShoppingBag size={24} />,
        iconClass: "iconShopify",
        available: false,
    },
    {
        provider: "GOOGLE_DRIVE",
        name: "Google Drive",
        type: "STORAGE",
        description: "Almacena automáticamente archivos y documentos enviados por clientes.",
        icon: <Folder size={24} />,
        iconClass: "iconDrive",
        available: false,
    },
]

// ==========================================
// TIPOS
// ==========================================

interface Integration {
    id: string
    type: string
    provider: string
    isActive: boolean
    enabledTools: string[] | null
    allowedScopes: string[] | null
    accounts: Array<{
        id: string
        label: string
        isDefault: boolean
        createdAt: string
    }>
    _count: { toolLogs: number }
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function IntegrationsPage() {
    return (
        <Suspense fallback={<div className={styles.container}><p>Cargando...</p></div>}>
            <IntegrationsContent />
        </Suspense>
    )
}

function IntegrationsContent() {
    const searchParams = useSearchParams()
    const [integrations, setIntegrations] = useState<Integration[]>([])
    const [loading, setLoading] = useState(true)
    const [connecting, setConnecting] = useState<string | null>(null)
    const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null)

    // Alertas de OAuth callback
    useEffect(() => {
        const success = searchParams.get("success")
        const error = searchParams.get("error")

        if (success === "connected") {
            setAlert({ type: "success", message: "Integración conectada exitosamente." })
        } else if (error) {
            const errorMessages: Record<string, string> = {
                token_exchange_failed: "Error al conectar con Google. Intenta de nuevo.",
                integration_not_found: "Integración no encontrada.",
                missing_params: "Parámetros faltantes en la respuesta de Google.",
                invalid_state: "Estado inválido. Intenta de nuevo.",
            }
            setAlert({ type: "error", message: errorMessages[error] || `Error: ${error}` })
        }
    }, [searchParams])

    const loadIntegrations = useCallback(async () => {
        try {
            const res = await fetch("/api/integrations")
            const data = await res.json()
            setIntegrations(data.integrations || [])
        } catch {
            console.error("Error cargando integraciones")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadIntegrations()
    }, [loadIntegrations])

    const handleConnect = async (providerInfo: ProviderInfo) => {
        setConnecting(providerInfo.provider)
        try {
            const createRes = await fetch("/api/integrations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: providerInfo.type, provider: providerInfo.provider }),
            })

            let integrationId: string
            if (createRes.status === 409) {
                const existing = integrations.find((i) => i.provider === providerInfo.provider)
                if (!existing) throw new Error("No se encontró la integración")
                integrationId = existing.id
            } else {
                const created = await createRes.json()
                integrationId = created.integration.id
            }

            const authRes = await fetch("/api/integrations/google/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider: providerInfo.provider, integrationId }),
            })

            const authData = await authRes.json()
            if (authData.authUrl) {
                window.location.href = authData.authUrl
            } else {
                setAlert({ type: "error", message: "No se pudo generar la URL de autorización." })
            }
        } catch (error) {
            console.error("Error conectando:", error)
            setAlert({ type: "error", message: "Error al conectar la integración." })
        } finally {
            setConnecting(null)
        }
    }

    const handleDisconnect = async (integrationId: string) => {
        if (!confirm("¿Estás seguro de desconectar esta integración? Las herramientas asociadas dejarán de funcionar.")) return
        try {
            await fetch(`/api/integrations?id=${integrationId}`, { method: "DELETE" })
            await loadIntegrations()
            setAlert({ type: "success", message: "Integración desconectada." })
        } catch {
            setAlert({ type: "error", message: "Error al desconectar." })
        }
    }

    const getConnectedIntegration = (provider: string): Integration | undefined => {
        return integrations.find((i) => i.provider === provider)
    }

    if (loading) {
        return <div className={styles.container}><p>Cargando integraciones...</p></div>
    }

    const availableProviders = AVAILABLE_PROVIDERS.filter((p) => p.available)
    const comingSoonProviders = AVAILABLE_PROVIDERS.filter((p) => !p.available)

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Integraciones</h1>
                    <p className={styles.subtitle}>
                        Conecta aplicaciones externas a tu cuenta. Luego configura qué herramientas puede usar tu asistente desde <strong>Asistente &gt; Herramientas</strong>.
                    </p>
                </div>
            </div>

            {alert && (
                <div className={`${styles.alert} ${alert.type === "success" ? styles.alertSuccess : styles.alertError}`}>
                    {alert.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                    <span>{alert.message}</span>
                    <button onClick={() => setAlert(null)} className={styles.alertClose}>
                        <X size={16} />
                    </button>
                </div>
            )}

            <div className={styles.grid}>
                {availableProviders.map((provider) => {
                    const connected = getConnectedIntegration(provider.provider)
                    const hasAccount = connected && connected.accounts.length > 0

                    return (
                        <div key={provider.provider} className={styles.integrationCard}>
                            <div className={styles.cardHeader}>
                                <div className={`${styles.iconWrapper} ${styles[provider.iconClass]}`}>
                                    {provider.icon}
                                </div>
                                <div>
                                    <h3 className={styles.cardTitle}>{provider.name}</h3>
                                    <span className={styles.cardCategory}>{provider.type}</span>
                                </div>
                                {hasAccount && (
                                    <div className={styles.toggleCorner}>
                                        <span className={`${styles.statusBadge} ${styles.statusConnected}`}>
                                            <span className={styles.statusDot} />
                                            Conectado
                                        </span>
                                    </div>
                                )}
                            </div>

                            <p className={styles.cardDescription}>{provider.description}</p>

                            {hasAccount && connected.accounts[0] && (
                                <div className={styles.accountLabel}>
                                    Cuenta: {connected.accounts[0].label}
                                </div>
                            )}

                            <div className={styles.cardActions}>
                                {!hasAccount ? (
                                    <button
                                        className={styles.btnConnect}
                                        onClick={() => handleConnect(provider)}
                                        disabled={connecting === provider.provider}
                                    >
                                        {connecting === provider.provider ? "Conectando..." : "Conectar"}
                                    </button>
                                ) : (
                                    <button
                                        className={styles.btnDisconnect}
                                        onClick={() => handleDisconnect(connected!.id)}
                                    >
                                        Desvincular cuenta
                                    </button>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Próximamente */}
            {comingSoonProviders.length > 0 && (
                <div className={styles.comingSoon}>
                    <h3 className={styles.sectionTitle}>Próximamente</h3>
                    <div className={styles.comingSoonGrid}>
                        {comingSoonProviders.map((provider) => (
                            <div key={provider.provider} className={styles.comingSoonCard}>
                                <div className={styles.comingSoonIcon}>{provider.icon}</div>
                                <p className={styles.comingSoonName}>{provider.name}</p>
                                <span className={styles.comingSoonLabel}>Próximamente</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
