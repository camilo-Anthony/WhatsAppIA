"use client"

import { useState, useEffect, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import styles from "./integrations.module.css"

// ==========================================
// DATOS DE INTEGRACIONES DISPONIBLES
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
        icon: (
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
        ),
        iconClass: "iconCalendar",
        available: true,
    },
    {
        provider: "GOOGLE_SHEETS",
        name: "Google Sheets",
        type: "CRM",
        description: "Registra leads, ventas y datos de clientes automáticamente en hojas de cálculo.",
        icon: (
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="8" y1="13" x2="16" y2="13"></line>
                <line x1="8" y1="17" x2="16" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
        ),
        iconClass: "iconSheets",
        available: false,
    },
    {
        provider: "NOTION",
        name: "Notion",
        type: "KNOWLEDGE",
        description: "Consulta y crea páginas en Notion. Base de conocimiento del negocio.",
        icon: (
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
        ),
        iconClass: "iconNotion",
        available: false,
    },
    {
        provider: "SLACK",
        name: "Slack",
        type: "NOTIFICATIONS",
        description: "Envía notificaciones a tu equipo cuando ocurran eventos importantes.",
        icon: (
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
        ),
        iconClass: "iconSlack",
        available: false,
    },
    {
        provider: "SHOPIFY",
        name: "Shopify",
        type: "ECOMMERCE",
        description: "Consulta productos, stock y pedidos directamente desde WhatsApp.",
        icon: (
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <path d="M16 10a4 4 0 0 1-8 0"></path>
            </svg>
        ),
        iconClass: "iconShopify",
        available: false,
    },
    {
        provider: "GOOGLE_DRIVE",
        name: "Google Drive",
        type: "STORAGE",
        description: "Almacena automáticamente archivos y documentos enviados por clientes.",
        icon: (
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
        ),
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
// COMPONENTE PRINCIPAL (con Suspense)
// ==========================================

export default function IntegrationsPage() {
    return (
        <Suspense fallback={<div className={styles.container}><p>Cargando...</p></div>}>
            <IntegrationsContent />
        </Suspense>
    )
}

// Traducciones de nombre de herramientas
const TOOL_LABELS: Record<string, string> = {
    check_availability: "Verificar disponibilidad",
    list_events: "Ver eventos",
    create_event: "Crear evento",
    cancel_event: "Cancelar evento",
    update_event: "Actualizar evento",
    get_event: "Obtener evento",
    send_message: "Enviar mensaje",
    get_contacts: "Ver contactos",
    create_record: "Crear registro",
    update_record: "Actualizar registro",
}

function IntegrationsContent() {
    const searchParams = useSearchParams()
    const [integrations, setIntegrations] = useState<Integration[]>([])
    const [loading, setLoading] = useState(true)
    const [connecting, setConnecting] = useState<string | null>(null)
    const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null)

    // Mostrar alertas de OAuth callback
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

    // Cargar integraciones
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

    useEffect(() => { loadIntegrations() }, [loadIntegrations])

    // Conectar integración (Google OAuth)
    const handleConnect = async (providerInfo: ProviderInfo) => {
        setConnecting(providerInfo.provider)
        try {
            // 1. Crear la integración en BD
            const createRes = await fetch("/api/integrations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: providerInfo.type,
                    provider: providerInfo.provider,
                }),
            })

            let integrationId: string
            if (createRes.status === 409) {
                // Ya existe, buscar el ID
                const existing = integrations.find((i) => i.provider === providerInfo.provider)
                if (!existing) throw new Error("No se encontró la integración")
                integrationId = existing.id
            } else {
                const created = await createRes.json()
                integrationId = created.integration.id
            }

            // 2. Obtener URL de OAuth
            const authRes = await fetch("/api/integrations/google/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider: providerInfo.provider,
                    integrationId,
                }),
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

    // Desconectar integración
    const handleDisconnect = async (integrationId: string) => {
        if (!confirm("¿Estás seguro de desconectar esta integración?")) return

        try {
            await fetch(`/api/integrations?id=${integrationId}`, { method: "DELETE" })
            await loadIntegrations()
            setAlert({ type: "success", message: "Integración desconectada." })
        } catch {
            setAlert({ type: "error", message: "Error al desconectar." })
        }
    }

    // Toggle activo/inactivo
    const handleToggle = async (integrationId: string, currentActive: boolean) => {
        try {
            await fetch("/api/integrations", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: integrationId, isActive: !currentActive }),
            })
            await loadIntegrations()
        } catch {
            setAlert({ type: "error", message: "Error al cambiar estado." })
        }
    }

    // Buscar estado de integración conectada
    const getConnectedIntegration = (provider: string): Integration | undefined => {
        return integrations.find((i) => i.provider === provider)
    }

    if (loading) {
        return <div className={styles.container}><p>Cargando integraciones...</p></div>
    }

    const connectedProviders = AVAILABLE_PROVIDERS.filter((p) => p.available)
    const comingSoonProviders = AVAILABLE_PROVIDERS.filter((p) => !p.available)

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Integraciones</h1>
                    <p className={styles.subtitle}>
                        Conecta aplicaciones externas para que tu agente ejecute acciones reales
                    </p>
                </div>
            </div>

            {alert && (
                <div className={`${styles.alert} ${alert.type === "success" ? styles.alertSuccess : styles.alertError}`}>
                    {alert.message}
                    <button onClick={() => setAlert(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: "1rem" }}>✕</button>
                </div>
            )}

            {/* Grid de integraciones disponibles */}
            <div className={styles.grid}>
                {connectedProviders.map((provider) => {
                    const connected = getConnectedIntegration(provider.provider)
                    const hasAccount = connected && connected.accounts.length > 0
                    const isConnected = hasAccount && connected.isActive

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
                                        <span className={`${styles.statusBadge} ${isConnected ? styles.statusConnected : styles.statusDisconnected}`}>
                                            <span className={styles.statusDot} />
                                            {isConnected ? "Conectado" : "Desconectado"}
                                        </span>
                                        <button
                                            className={`${styles.toggle} ${connected!.isActive ? styles.toggleOn : ""}`}
                                            onClick={() => handleToggle(connected!.id, connected!.isActive)}
                                            title={connected!.isActive ? "Desactivar" : "Activar"}
                                        >
                                            <span className={styles.toggleDot} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <p className={styles.cardDescription}>{provider.description}</p>


                            {/* Herramientas */}
                            {connected?.enabledTools && (
                                <div className={styles.toolsSection}>
                                    <div className={styles.toolsSectionTitle}>Herramientas activas</div>
                                    <ul className={styles.toolsList}>
                                        {(connected.enabledTools as string[]).map((tool) => (
                                            <li key={tool} className={styles.toolItem}>
                                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={styles.toolCheck}>
                                                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                                {TOOL_LABELS[tool] ?? tool}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Acciones */}
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
                                        Desvincular
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
                    <h2 className={styles.sectionTitle}>Próximamente</h2>
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
