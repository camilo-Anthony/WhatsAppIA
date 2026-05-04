"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
    Calendar,
    FileText,
    Book,
    MessageSquareMore,
    ShoppingBag,
    Folder,
    Database,
    ExternalLink
} from "lucide-react"
import Link from "next/link"
import styles from "./tools.module.css"
import assistantStyles from "../../assistant.module.css"

// ==========================================
// DEFINICIONES DE HERRAMIENTAS POR PROVEEDOR
// ==========================================

interface ToolDefinition {
    key: string
    label: string
    description: string
}

const TOOLS_BY_PROVIDER: Record<string, ToolDefinition[]> = {
    GOOGLE_CALENDAR: [
        { key: "check_availability", label: "Verificar disponibilidad", description: "Consultar horarios libres en el calendario" },
        { key: "list_events", label: "Ver eventos", description: "Listar eventos programados" },
        { key: "create_event", label: "Crear evento", description: "Agendar nuevas citas o eventos" },
        { key: "cancel_event", label: "Cancelar evento", description: "Eliminar eventos existentes" },
        { key: "update_event", label: "Actualizar evento", description: "Modificar fecha, hora o detalles de un evento" },
        { key: "get_event", label: "Obtener evento", description: "Consultar detalles de un evento específico" },
    ],
    GOOGLE_SHEETS: [
        { key: "read_sheet", label: "Leer hoja", description: "Consultar datos de una hoja de cálculo" },
        { key: "write_sheet", label: "Escribir en hoja", description: "Agregar o modificar datos" },
        { key: "create_sheet", label: "Crear hoja", description: "Crear una nueva hoja de cálculo" },
    ],
    NOTION: [
        { key: "search_pages", label: "Buscar páginas", description: "Buscar contenido en Notion" },
        { key: "read_page", label: "Leer página", description: "Consultar el contenido de una página" },
        { key: "create_page", label: "Crear página", description: "Crear una nueva página en Notion" },
    ],
    SLACK: [
        { key: "send_message", label: "Enviar mensaje", description: "Enviar un mensaje a un canal" },
        { key: "create_channel", label: "Crear canal", description: "Crear un nuevo canal de Slack" },
    ],
}

const PROVIDER_META: Record<string, { name: string; icon: React.ReactNode; iconClass: string }> = {
    GOOGLE_CALENDAR: { name: "Google Calendar", icon: <Calendar size={20} />, iconClass: "iconCalendar" },
    GOOGLE_SHEETS: { name: "Google Sheets", icon: <FileText size={20} />, iconClass: "iconSheets" },
    NOTION: { name: "Notion", icon: <Book size={20} />, iconClass: "iconNotion" },
    SLACK: { name: "Slack", icon: <MessageSquareMore size={20} />, iconClass: "iconSlack" },
    SHOPIFY: { name: "Shopify", icon: <ShoppingBag size={20} />, iconClass: "iconShopify" },
    GOOGLE_DRIVE: { name: "Google Drive", icon: <Folder size={20} />, iconClass: "iconDrive" },
}

// ==========================================
// TIPOS
// ==========================================

interface Integration {
    id: string
    type: string
    provider: string
    isActive: boolean
    enabledTools: string[] | null
    accounts: Array<{
        id: string
        label: string
        isDefault: boolean
        createdAt: string
    }>
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

import { use } from "react"

export default function ToolsPage({ params }: { params: Promise<{ id: string }> }) {
    const _params = use(params)
    const [integrations, setIntegrations] = useState<Integration[]>([])
    const [loading, setLoading] = useState(true)
    const [updatingTool, setUpdatingTool] = useState<string | null>(null)

    const _router = useRouter()

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

    // Integraciones que tienen al menos una cuenta conectada
    const connectedIntegrations = integrations.filter(
        (i) => i.accounts && i.accounts.length > 0
    )

    const handleToggleTool = async (integration: Integration, toolKey: string) => {
        const currentTools = integration.enabledTools || []
        const isEnabled = currentTools.includes(toolKey)
        const newTools = isEnabled
            ? currentTools.filter((t) => t !== toolKey)
            : [...currentTools, toolKey]

        setUpdatingTool(`${integration.id}-${toolKey}`)

        try {
            await fetch("/api/integrations", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: integration.id,
                    enabledTools: newTools,
                }),
            })
            await loadIntegrations()
        } catch {
            console.error("Error actualizando herramientas")
        } finally {
            setUpdatingTool(null)
        }
    }

    if (loading) {
        return (
            <div style={{ padding: "var(--space-6)" }}>
                <div className="skeleton" style={{ width: "100%", height: 200 }} />
            </div>
        )
    }

    return (
        <div className={assistantStyles.section}>
            {connectedIntegrations.length === 0 ? (
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>
                        <Database size={48} style={{ opacity: 0.4 }} />
                    </div>
                    <h3>Sin integraciones conectadas</h3>
                    <p>Conecta aplicaciones desde la página de <strong>Integraciones</strong> para habilitar herramientas para tu asistente.</p>
                    <Link href="/dashboard/integrations" className="btn btn-primary" style={{ marginTop: "var(--space-4)" }}>
                        <ExternalLink size={16} /> Ir a Integraciones
                    </Link>
                </div>
            ) : (
                <div className={styles.toolsIntegrationsList}>
                    {connectedIntegrations.map((integration) => {
                        const meta = PROVIDER_META[integration.provider]
                        const tools = TOOLS_BY_PROVIDER[integration.provider] || []
                        const enabledTools = integration.enabledTools || []

                        return (
                            <div key={integration.id} className={styles.integrationCard}>
                                <div className={styles.cardHeader}>
                                    <div className={`${styles.iconWrapper} ${styles[meta?.iconClass || "iconDefault"]}`}>
                                        {meta?.icon || <Database size={20} />}
                                    </div>
                                    <div>
                                        <h3 className={styles.cardTitle}>{meta?.name || integration.provider}</h3>
                                        <span className={styles.cardCategory}>
                                            {enabledTools.length} de {tools.length} herramientas activas
                                        </span>
                                    </div>
                                    <div className={styles.toggleCorner}>
                                        <span className={`${styles.statusBadge} ${styles.statusConnected}`}>
                                            <span className={styles.statusDot} />
                                            Conectado
                                        </span>
                                    </div>
                                </div>

                                <div className={styles.toolsGrid}>
                                    {tools.map((tool) => {
                                        const isEnabled = enabledTools.includes(tool.key)
                                        const isUpdating = updatingTool === `${integration.id}-${tool.key}`

                                        return (
                                            <div
                                                key={tool.key}
                                                className={`${styles.toolRow} ${isEnabled ? styles.toolRowActive : ""}`}
                                            >
                                                <div className={styles.toolInfo}>
                                                    <span className={styles.toolLabel}>{tool.label}</span>
                                                    <span className={styles.toolDescription}>{tool.description}</span>
                                                </div>
                                                <button
                                                    className={`toggle ${isEnabled ? "toggle-on" : ""}`}
                                                    onClick={() => handleToggleTool(integration, tool.key)}
                                                    disabled={isUpdating}
                                                    title={isEnabled ? "Desactivar" : "Activar"}
                                                >
                                                    <span className="toggle-dot" />
                                                </button>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
