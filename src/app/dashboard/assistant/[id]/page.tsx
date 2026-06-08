"use client"


import { use, useCallback, useEffect, useState, useRef, useMemo } from "react"
import Link from "next/link"
import { Shield, X, BookOpen, Calendar, Hammer, Send, Trash, Smartphone, Play, Loader2, ExternalLink, FileText, Settings, MessageSquare, Brain, ChevronLeft, Save, Check } from "lucide-react"
import {
    ReactFlow,
    Background,
    Controls,
    Handle,
    Position,
    useNodesState,
    useEdgesState,
    type Node,
    type Edge,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import Brain3DGraph, { type GraphEdge, type GraphNode, type GraphPropertyValue } from "./Brain3DGraph"
import styles from "../assistant.module.css"
import {
    DEFAULT_STRUCTURED_DASHBOARD_CONFIG,
    composeStructuredDashboardConfigPrompt,
    normalizeStructuredDashboardConfig,
    parseStructuredDashboardConfigPrompt,
    type StructuredDashboardConfig,
} from "@/lib/ai/agent/dashboard-config"

interface AssistantProfile {
    id: string
    name: string
    behaviorPrompt: string
    infoMode: "SIMPLE" | "ADVANCED" | "RAG"
    simpleInfo: string
    connections?: Array<{ id: string; phoneNumber: string; displayName: string }>
}

interface Message {
    role: "user" | "assistant"
    content: string
    trace?: Array<{
        nodeId: string
        status: string
        durationMs?: number;
        tokensUsed?: number;
        toolName?: string;
        toolArgs?: Record<string, unknown>;
    }>
    /** Token usage metadata for the whole response */
    tokensUsed?: { prompt: number; completion: number; total: number }
    /** Number of agentic loop iterations */
    iterations?: number
    /** Total pipeline wall-clock time in ms */
    totalDurationMs?: number
    /** Tools invoked during this response */
    toolsUsed?: string[]
    /** LLM model name */
    model?: string
}

interface KnowledgeDocumentItem {
    id: string
    filename: string
    fileType: string
    fileSize: number
    processed: boolean
    error?: string | null
}

interface GraphData {
    nodes: GraphNode[]
    edges: GraphEdge[]
}

type SelectedGraphRelation = GraphEdge & {
    role: "incoming" | "outgoing"
    displayName: string
}

interface SelectedGraphNode extends GraphNode {
    properties: Record<string, GraphPropertyValue>
    relationships: SelectedGraphRelation[]
}

const DEFAULT_TOOL_PROMPTS: Record<string, string> = {
    GOOGLE_CALENDAR: "- Para agendar una cita o evento, el agente DEBE obtener: Fecha, Hora y Motivo.\n- Si faltan datos, pide un solo dato a la vez.\n- Confirma el día exacto de la semana (ej: mañana martes 15).\n- Muestra un resumen y solicita confirmación explícita (Sí/No) antes de agendar.",
    GOOGLE_SHEETS: "- Permite leer y escribir celdas y filas en hojas de cálculo activas.\n- Extrae de manera estructurada los campos necesarios e informa al usuario del éxito de la operación.",
    NOTION: "- Recupera y busca información sobre bases de conocimiento en páginas de Notion.\n- Usa los textos extraídos como fuente de verdad secundaria y no inventes hechos no incluidos.",
    SLACK: "- Envía notificaciones de alerta y mensajes directos a canales de Slack designados.\n- Se activa en eventos clave de conversión o finalización de flujos."
}

const CONSTRAINT_SUGGESTIONS = [
    "Nunca ofrezcas descuentos no autorizados",
    "No des consejos medicos ni legales",
    "Si el usuario se frustra, ofrece un humano",
    "No compartas datos de otros clientes",
    "No prometas tiempos de entrega exactos",
    "No aceptes pagos por chat",
    "No respondas temas politicos o religiosos",
    "Nunca inventes precios o disponibilidad",
]

// ==========================================
// CUSTOM NODES FOR REACT FLOW
// ==========================================

interface ChannelNodeData {
    phoneNumber: string
    pulse: boolean
}

interface AgentNodeData {
    identity: string
    mission: string
    selected: boolean
    pulse: boolean
    infoMode?: string
    knowledgeActive?: boolean
    activeToolsCount?: number
}

interface KnowledgeNodeData {
    simpleInfo: string
    active: boolean
    selected: boolean
    pulse: boolean
}

interface ToolNodeData {
    label: string
    description: string
    activeList: string[]
    active: boolean
    selected: boolean
    pulse: boolean
}

interface ObsidianNodeData {
    color?: string
    selected?: boolean
    label?: string
    properties?: {
        displayName?: GraphPropertyValue
    }
}

function ChannelNode({ data }: { data: ChannelNodeData }) {
    return (
        <div className={`${styles.studioNode} ${styles.nodeWhatsapp} ${data.pulse ? styles.nodePulseBlue : ""}`}>
            <Handle type="source" position={Position.Right} id="whatsapp-out" style={{ background: "var(--color-primary)" }} />
            <div className={styles.nodeHeader}>
                <div className={styles.nodeIconWrapper} style={{ color: "var(--color-success)" }}>
                    <Smartphone size={18} />
                </div>
                <div className={styles.nodeTitleSection}>
                    <h4 className={styles.nodeTitle}>Canal WhatsApp</h4>
                    <p className={styles.nodeSubtitle}>Entrada de mensajes</p>
                </div>
            </div>
            <div className={styles.nodeBody}>
                {data.phoneNumber ? `Conectado: ${data.phoneNumber}` : "Configurando..."}
            </div>
        </div>
    )
}

function AgentNode({ data }: { data: AgentNodeData }) {
    return (
        <div className={`${styles.studioNode} ${styles.nodeAgent} ${data.selected ? styles.studioNodeActive : ""} ${data.pulse ? styles.nodePulseBlue : ""}`}>
            <Handle type="target" position={Position.Left} id="agent-in" />
            <Handle type="source" position={Position.Right} id="agent-tools-out" style={{ background: "var(--color-primary)" }} />
            <Handle type="source" position={Position.Bottom} id="agent-knowledge-out" style={{ background: "var(--color-primary)" }} />
            <div className={styles.nodeHeader}>
                <div className={styles.nodeIconWrapper} style={{ color: "var(--color-primary)" }}>
                    <Shield size={18} />
                </div>
                <div className={styles.nodeTitleSection}>
                    <h4 className={styles.nodeTitle}>Cerebro IA</h4>
                    <p className={styles.nodeSubtitle}>Comportamiento y Reglas</p>
                </div>
            </div>
            <div className={styles.nodeBody}>
                Identidad: {data.identity || "Sin definir"}<br />
                Misión: {data.mission ? `${data.mission.substring(0, 30)}...` : "Sin definir"}
            </div>
        </div>
    )
}

function KnowledgeNode({ data }: { data: KnowledgeNodeData }) {
    return (
        <div className={`${styles.studioNode} ${styles.nodeKnowledge} ${data.selected ? styles.studioNodeActive : ""} ${data.pulse ? styles.nodePulseBlue : ""}`}>
            <Handle type="target" position={Position.Top} id="knowledge-in" />
            <div className={styles.nodeHeader}>
                <div className={styles.nodeIconWrapper} style={{ color: "var(--color-warning)" }}>
                    <BookOpen size={18} />
                </div>
                <div className={styles.nodeTitleSection}>
                    <h4 className={styles.nodeTitle}>Base Conocimiento</h4>
                    <p className={styles.nodeSubtitle}>RAG de datos comerciales</p>
                </div>
            </div>
            <div className={styles.nodeBody}>
                {data.simpleInfo ? `${data.simpleInfo.substring(0, 40)}...` : "Vacío"}
            </div>
            <div className={styles.nodeControls} onClick={(e) => e.stopPropagation()}>
                <span className={styles.nodeSubtitle}>Estado:</span>
                <span className={styles.nodeStatusBadge} style={{
                    background: data.active ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                    color: data.active ? "var(--color-success)" : "var(--color-error)"
                }}>
                    {data.active ? "Activo" : "Inactivo"}
                </span>
            </div>
        </div>
    )
}

function ToolNode({ data }: { data: ToolNodeData }) {
    return (
        <div className={`${styles.studioNode} ${styles.nodeTool} ${data.selected ? styles.studioNodeActive : ""} ${data.pulse ? styles.nodePulseGreen : ""}`}>
            <Handle type="target" position={Position.Left} id="tool-in" />
            <div className={styles.nodeHeader}>
                <div className={styles.nodeIconWrapper} style={{ color: "var(--color-info)" }}>
                    <Hammer size={18} />
                </div>
                <div className={styles.nodeTitleSection}>
                    <h4 className={styles.nodeTitle}>{data.label}</h4>
                    <p className={styles.nodeSubtitle}>MCP e Integraciones</p>
                </div>
            </div>
            <div className={styles.nodeBody} style={{ marginTop: "var(--space-1)", display: "flex", flexDirection: "column", gap: "4px" }}>
                {data.activeList && data.activeList.length > 0 ? (
                    data.activeList.map((tool) => (
                        <div key={tool} style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--color-text-primary)" }}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--color-success)" }} />
                            {tool}
                        </div>
                    ))
                ) : (
                    <span style={{ color: "var(--color-text-muted)" }}>Ninguna herramienta activa</span>
                )}
            </div>
            <div className={styles.nodeControls} onClick={(e) => e.stopPropagation()}>
                <span className={styles.nodeSubtitle}>Estado:</span>
                <span className={styles.nodeStatusBadge} style={{
                    background: data.active ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                    color: data.active ? "var(--color-success)" : "var(--color-error)"
                }}>
                    {data.active ? "Activo" : "Inactivo"}
                </span>
            </div>
        </div>
    )
}

function ObsidianNode({ data }: { data: ObsidianNodeData }) {
    return (
        <div className={styles.obsidianNodeWrapper}>
            <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 0, height: 0 }} />
            <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 0, height: 0 }} />
            <div className={`${styles.obsidianNodeDot} ${data.selected ? styles.obsidianNodeDotActive : ""}`} style={{
                background: data.color || "#6366f1",
                boxShadow: `0 0 10px ${data.color || "#6366f1"}b0`
            }} />
            <div className={`${styles.obsidianNodeLabel} ${data.selected ? styles.obsidianNodeLabelActive : ""}`}>
                {data.properties?.displayName || data.label}
            </div>
        </div>
    )
}

const nodeTypes = {
    channelNode: ChannelNode,
    agentNode: AgentNode,
    knowledgeNode: KnowledgeNode,
    toolNode: ToolNode,
    obsidianNode: ObsidianNode,
}



const translatePropKey = (key: string): string => {
    switch (key) {
        case "score": return "Relevancia"
        case "category": return "Categoría"
        case "key": return "Concepto"
        case "updatedAt": return "Fecha"
        case "fileType": return "Tipo"
        case "status": return "Estado"
        case "source": return "Origen"
        default: return key.charAt(0).toUpperCase() + key.slice(1)
    }
}

const formatPropValue = (key: string, val: unknown): string => {
    if (val === undefined || val === null) return "-"
    const strVal = String(val)
    if (key === "score") {
        const num = parseFloat(strVal)
        return isNaN(num) ? strVal : `${Math.round(num * 100)}%`
    }
    if (key === "updatedAt") {
        try {
            return new Date(strVal).toLocaleDateString("es-ES", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            })
        } catch (e) {
            return strVal
        }
    }
    return strVal
}

const formatRelationType = (type?: string): string => {
    if (!type) return "Conexión"
    const t = type.toUpperCase()
    if (t === "BRANCHES_TO") return "Pertenece a"
    if (t === "CORE_LINK") return "Enlace Cerebro"
    return t.replace(/_/g, " ")
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function AssistantBehaviorPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params)
    const [profile, setProfile] = useState<AssistantProfile | null>(null)
    const [behaviorConfig, setBehaviorConfig] = useState<StructuredDashboardConfig>(
        DEFAULT_STRUCTURED_DASHBOARD_CONFIG
    )
    const [loading, setLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [showSaveToast, setShowSaveToast] = useState(false)

    // Studio Canvas & Drawer States
    const [activeDrawer, setActiveDrawer] = useState<"agent" | "knowledge" | "tools" | null>(null)
    const [cerebroTab, setCerebroTab] = useState<"identity" | "style" | "limits">("identity")
    const [integrations, setIntegrations] = useState<{
        id: string
        provider: string
        isActive: boolean
        accounts?: { id: string }[]
    }[]>([])
    const [knowledgeActive, setKnowledgeActive] = useState(true)
    const [documents, setDocuments] = useState<KnowledgeDocumentItem[]>([])
    const [uploading, setUploading] = useState(false)

    // Chat Playground States
    const [messages, setMessages] = useState<Message[]>([])
    const [chatInput, setChatInput] = useState("")
    const [sending, setSending] = useState(false)
    const chatEndRef = useRef<HTMLDivElement>(null)
    const [isMobileChatOpen, setIsMobileChatOpen] = useState(false)

    // React Flow States
    const [nodes, setNodes] = useNodesState<Node>([])
    const [edges, setEdges] = useEdgesState<Edge>([])

    // Obsidian Graph States
    const [canvasView, setCanvasView] = useState<"studio" | "memory">("studio")
    const [graphLoading, setGraphLoading] = useState(false)
    const [graphData, setGraphData] = useState<GraphData | null>(null)
    const [graphSearchQuery, setGraphSearchQuery] = useState("")
    const [selectedGraphNode, setSelectedGraphNode] = useState<SelectedGraphNode | null>(null)

    const safeBehaviorConfig = normalizeStructuredDashboardConfig(behaviorConfig)

    // Load Integrations
    const loadIntegrations = useCallback(async () => {
        try {
            const res = await fetch("/api/integrations")
            if (res.ok) {
                const data = await res.json()
                setIntegrations(data.integrations || [])
            }
        } catch (error) {
            console.error("Error loading integrations:", error)
        }
    }, [])

    useEffect(() => {
        loadIntegrations()
    }, [loadIntegrations])

    const handleToggleIntegration = async (integrationId: string, currentActive: boolean) => {
        try {
            const res = await fetch("/api/integrations", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: integrationId,
                    isActive: !currentActive,
                }),
            })
            if (res.ok) {
                await loadIntegrations()
            }
        } catch (error) {
            console.error("Error toggling integration:", error)
        }
    }

    const calendarIntegration = integrations.find(i => i.provider === "GOOGLE_CALENDAR")
    const isCalendarConnected = !!(calendarIntegration && calendarIntegration.accounts && calendarIntegration.accounts.length > 0)
    const isCalendarActive = isCalendarConnected ? calendarIntegration.isActive : false

    const sheetsIntegration = integrations.find(i => i.provider === "GOOGLE_SHEETS")
    const isSheetsConnected = !!(sheetsIntegration && sheetsIntegration.accounts && sheetsIntegration.accounts.length > 0)
    const isSheetsActive = isSheetsConnected ? sheetsIntegration.isActive : false

    const notionIntegration = integrations.find(i => i.provider === "NOTION")
    const isNotionConnected = !!(notionIntegration && notionIntegration.accounts && notionIntegration.accounts.length > 0)
    const isNotionActive = isNotionConnected ? notionIntegration.isActive : false

    const slackIntegration = integrations.find(i => i.provider === "SLACK")
    const isSlackConnected = !!(slackIntegration && slackIntegration.accounts && slackIntegration.accounts.length > 0)
    const isSlackActive = isSlackConnected ? slackIntegration.isActive : false

    const hasActiveTools = isCalendarActive || isSheetsActive || isNotionActive || isSlackActive

    // Load Documents from RAG API
    const loadDocuments = useCallback(async () => {
        try {
            const res = await fetch(`/api/assistant/config/${resolvedParams.id}/documents`)
            if (res.ok) {
                const data = await res.json() as { documents?: KnowledgeDocumentItem[] }
                setDocuments(data.documents ?? [])
            }
        } catch (error) {
            console.error("Error loading documents:", error)
        }
    }, [resolvedParams.id])

    // Load Profile
    const loadProfile = useCallback(async () => {
        try {
            const res = await fetch(`/api/assistant/config/${resolvedParams.id}`)
            if (res.ok) {
                const data = await res.json()
                setProfile(data.profile)
                setBehaviorConfig(parseStructuredDashboardConfigPrompt(data.profile.behaviorPrompt || "").config)
                setKnowledgeActive(data.profile.infoMode === "SIMPLE" || data.profile.infoMode === "RAG")
                await loadDocuments()
            }
        } catch (error) {
            console.error("Error loading profile:", error)
        } finally {
            setLoading(false)
        }
    }, [resolvedParams.id, loadDocuments])

    useEffect(() => {
        loadProfile()
    }, [loadProfile])

    // Fetch Graph RAG relations from API
    const fetchGraph = useCallback(async () => {
        setGraphLoading(true)
        setSelectedGraphNode(null)
        setGraphData(null)
        try {
            const res = await fetch(`/api/assistant/config/${resolvedParams.id}/graph`)
            if (res.ok) {
                const data = await res.json() as GraphData
                setGraphData(data)
            } else {
                setGraphData({ nodes: [], edges: [] })
            }
        } catch (error) {
            console.error("Error loading graph:", error)
            setGraphData({ nodes: [], edges: [] })
        } finally {
            setGraphLoading(false)
        }
    }, [resolvedParams.id])

    // 3D graph node click handler
    const onGraphNodeClick3D = useCallback((node: GraphNode) => {
        const details = graphData?.nodes.find((n) => n.id === node.id)
        const incoming = graphData?.edges.filter((e) => e.target === node.id) ?? []
        const outgoing = graphData?.edges.filter((e) => e.source === node.id) ?? []
        
        const findDisplayName = (id: string): string => {
            const found = graphData?.nodes.find(n => n.id === id)
            return String(found?.properties?.displayName || id)
        }
        
        setSelectedGraphNode({
            id: node.id,
            labels: details?.labels || node.labels || [],
            properties: details?.properties || node.properties || {},
            relationships: [
                ...incoming.map((r): SelectedGraphRelation => ({ ...r, role: "incoming", displayName: findDisplayName(r.source) })),
                ...outgoing.map((r): SelectedGraphRelation => ({ ...r, role: "outgoing", displayName: findDisplayName(r.target) }))
            ]
        })
    }, [graphData])

    // Search query is passed directly to Brain3DGraph component as a prop

    useEffect(() => {
        if (canvasView === "memory") {
            fetchGraph()
        }
    }, [canvasView, fetchGraph])



    // File upload handler
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !profile) return

        setUploading(true)
        const formData = new FormData()
        formData.append("file", file)

        try {
            const res = await fetch(`/api/assistant/config/${profile.id}/documents`, {
                method: "POST",
                body: formData,
            })

            if (res.ok) {
                await loadDocuments()
            } else {
                const data = await res.json()
                alert(data.error || "Error al subir el archivo")
            }
        } catch (error) {
            console.error("Error uploading file:", error)
            alert("Error de red al subir el archivo")
        } finally {
            setUploading(false)
            e.target.value = ""
        }
    }

    // File deletion handler
    const handleDeleteDocument = async (docId: string) => {
        if (!profile || !confirm("¿Estás seguro de que deseas eliminar este documento?")) return

        try {
            const res = await fetch(`/api/assistant/config/${profile.id}/documents/${docId}`, {
                method: "DELETE",
            })

            if (res.ok) {
                await loadDocuments()
            } else {
                const data = await res.json()
                alert(data.error || "Error al eliminar el documento")
            }
        } catch (error) {
            console.error("Error deleting document:", error)
            alert("Error de red al eliminar el documento")
        }
    }

    // Save Profile
    const handleSave = useCallback(async () => {
        if (!profile) return
        setIsSaving(true)

        try {
            await fetch(`/api/assistant/config/${resolvedParams.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: profile.name,
                    behaviorPrompt: composeStructuredDashboardConfigPrompt(behaviorConfig),
                    infoMode: profile.infoMode,
                    simpleInfo: profile.simpleInfo,
                }),
            })
            setShowSaveToast(true)
            setTimeout(() => setShowSaveToast(false), 2500)
        } catch (error) {
            console.error("Error saving:", error)
        } finally {
            setIsSaving(false)
        }
    }, [behaviorConfig, profile, resolvedParams.id])

    // Update Nodes when config or active states change
    useEffect(() => {
        if (!profile) return

        const calInt = integrations.find(i => i.provider === "GOOGLE_CALENDAR")
        const isCalAct = !!(calInt && calInt.accounts && calInt.accounts.length > 0 && calInt.isActive)

        const sheetInt = integrations.find(i => i.provider === "GOOGLE_SHEETS")
        const isSheetAct = !!(sheetInt && sheetInt.accounts && sheetInt.accounts.length > 0 && sheetInt.isActive)

        const notionInt = integrations.find(i => i.provider === "NOTION")
        const isNotionAct = !!(notionInt && notionInt.accounts && notionInt.accounts.length > 0 && notionInt.isActive)

        const slackInt = integrations.find(i => i.provider === "SLACK")
        const isSlackAct = !!(slackInt && slackInt.accounts && slackInt.accounts.length > 0 && slackInt.isActive)

        const hasActTools = isCalAct || isSheetAct || isNotionAct || isSlackAct

        const actToolsList: string[] = []
        if (isCalAct) actToolsList.push("Google Calendar")
        if (isSheetAct) actToolsList.push("Google Sheets")
        if (isNotionAct) actToolsList.push("Notion")
        if (isSlackAct) actToolsList.push("Slack")

        const initialNodes: Node[] = [
            {
                id: "whatsapp",
                type: "channelNode",
                position: { x: 30, y: 180 },
                data: {
                    phoneNumber: profile.connections?.[0]?.phoneNumber || "WhatsApp Cloud API",
                    pulse: false,
                },
            },
            {
                id: "agent",
                type: "agentNode",
                position: { x: 280, y: 180 },
                data: {
                    identity: safeBehaviorConfig.agentIdentity || "Asistente IA",
                    mission: safeBehaviorConfig.mission || "",
                    selected: activeDrawer === "agent",
                    pulse: false,
                    infoMode: profile.infoMode,
                    knowledgeActive: knowledgeActive,
                    activeToolsCount: actToolsList.length,
                },
            },
            {
                id: "knowledge",
                type: "knowledgeNode",
                position: { x: 280, y: 340 },
                data: {
                    simpleInfo: profile.simpleInfo || "",
                    active: knowledgeActive,
                    selected: activeDrawer === "knowledge",
                    pulse: false,
                },
            },
            {
                id: "tools",
                type: "toolNode",
                position: { x: 530, y: 180 },
                data: {
                    label: "Herramientas de IA",
                    description: "Conexiones de MCP y aplicaciones externas",
                    activeList: actToolsList,
                    active: hasActTools,
                    selected: activeDrawer === "tools",
                    pulse: false,
                },
            },
        ]

        const initialEdges: Edge[] = [
            {
                id: "e-whatsapp-agent",
                source: "whatsapp",
                sourceHandle: "whatsapp-out",
                target: "agent",
                targetHandle: "agent-in",
                animated: false,
                style: { stroke: "var(--color-border)", strokeWidth: 2 },
            },
            {
                id: "e-agent-knowledge",
                source: "agent",
                sourceHandle: "agent-knowledge-out",
                target: "knowledge",
                targetHandle: "knowledge-in",
                animated: false,
                style: {
                    stroke: knowledgeActive ? "var(--color-border)" : "rgba(255,255,255,0.1)",
                    strokeWidth: 2,
                    strokeDasharray: knowledgeActive ? undefined : "5,5",
                },
            },
            {
                id: "e-agent-tools",
                source: "agent",
                sourceHandle: "agent-tools-out",
                target: "tools",
                targetHandle: "tool-in",
                animated: false,
                style: {
                    stroke: hasActTools ? "var(--color-border)" : "rgba(255,255,255,0.1)",
                    strokeWidth: 2,
                    strokeDasharray: hasActTools ? undefined : "5,5",
                },
            },
        ]

        setNodes(initialNodes)
        setEdges(initialEdges)
    }, [
        profile,
        behaviorConfig,
        activeDrawer,
        integrations,
        knowledgeActive,
        safeBehaviorConfig.agentIdentity,
        safeBehaviorConfig.mission,
        setNodes,
        setEdges
    ])

    // Scroll chat to bottom
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])

    // Node click handler
    const onNodeClick = (_event: React.MouseEvent, node: Node) => {
        if (node.id === "agent") setActiveDrawer("agent")
        if (node.id === "knowledge") setActiveDrawer("knowledge")
        if (node.id === "tools") setActiveDrawer("tools")
    }

    const updateBehaviorAnswers = (updates: Partial<StructuredDashboardConfig>) => {
        const updated = { ...behaviorConfig, ...updates }
        setBehaviorConfig(updated)
    }

    const handleUpdateToolPrompt = (provider: string, prompt: string) => {
        const currentToolPrompts = behaviorConfig.toolPrompts || {}
        const updatedToolPrompts = { ...currentToolPrompts, [provider]: prompt }
        updateBehaviorAnswers({ toolPrompts: updatedToolPrompts })
    }

    const toggleConstraint = (constraint: string) => {
        const current = safeBehaviorConfig.strictConstraints ?? ""
        const lines = current.split("\n").map(l => l.trim()).filter(Boolean)
        const exists = lines.some(l => l === constraint)
        const updated = exists
            ? lines.filter(l => l !== constraint).join("\n")
            : [...lines, constraint].join("\n")
        updateBehaviorAnswers({ strictConstraints: updated })
    }

    const isConstraintActive = (constraint: string): boolean => {
        const current = safeBehaviorConfig.strictConstraints ?? ""
        return current.split("\n").map(l => l.trim()).includes(constraint)
    }

    // Send Sandbox Chat message
    const sendChatMessage = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!chatInput.trim() || sending) return

        const userMsg = chatInput.trim()
        setChatInput("")
        setSending(true)

        // Add user message to playground
        setMessages(prev => [...prev, { role: "user", content: userMsg }])

        // Animate Whatsapp -> Agent edge on sending
        setEdges(prev => prev.map(edge =>
            edge.id === "e-whatsapp-agent" ? { ...edge, animated: true, style: { stroke: "var(--color-primary)", strokeWidth: 3 } } : edge
        ))

        try {
            const res = await fetch("/api/assistant/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    assistantConfigId: resolvedParams.id,
                    message: userMsg,
                })
            })

            if (res.ok) {
                const data = await res.json()

                // Trigger pulse animations on nodes depending on pipeline trace results
                interface TraceStep {
                    type: string
                    toolName?: string
                    content?: string
                    durationMs?: number
                    tokensUsed?: number
                    toolArgs?: Record<string, unknown>
                }
                const traceList: TraceStep[] = data.steps || []
                const hasRAG = traceList.some((s) => s.type === "tool_call" && s.toolName === "loadBusinessInfo") || knowledgeActive
                const hasCalendar = traceList.some((s) => s.type === "tool_call" && s.toolName?.includes("calendar"))
                const hasMCP = traceList.some((s) => s.type === "tool_call" && !s.toolName?.includes("calendar") && s.toolName !== "loadBusinessInfo")
                const hasTools = hasCalendar || hasMCP

                // Animate edges according to steps
                setEdges(prev => prev.map(edge => {
                    if (edge.id === "e-whatsapp-agent") {
                        return { ...edge, animated: true, style: { stroke: "var(--color-success)", strokeWidth: 3 } }
                    }
                    if (edge.id === "e-agent-knowledge" && hasRAG) {
                        return { ...edge, animated: true, style: { stroke: "var(--color-warning)", strokeWidth: 3 } }
                    }
                    if (edge.id === "e-agent-tools" && hasTools) {
                        return { ...edge, animated: true, style: { stroke: "var(--color-info)", strokeWidth: 3 } }
                    }
                    return edge
                }))

                // Pulse nodes
                setNodes(prev => prev.map(node => {
                    if (node.id === "knowledge" && hasRAG) return { ...node, data: { ...node.data, pulse: true } }
                    if (node.id === "tools" && hasTools) return { ...node, data: { ...node.data, pulse: true } }
                    if (node.id === "agent") return { ...node, data: { ...node.data, pulse: true } }
                    return node
                }))

                // Reset animations after 2 seconds
                setTimeout(() => {
                    setEdges(prev => prev.map(edge => {
                        let stroke = "var(--color-border)"
                        let dash = undefined
                        if (edge.id === "e-agent-knowledge" && !knowledgeActive) {
                            stroke = "rgba(255,255,255,0.1)"
                            dash = "5,5"
                        }
                        if (edge.id === "e-agent-tools" && !hasActiveTools) {
                            stroke = "rgba(255,255,255,0.1)"
                            dash = "5,5"
                        }
                        return {
                            ...edge,
                            animated: false,
                            style: {
                                stroke,
                                strokeWidth: 2,
                                strokeDasharray: dash
                            }
                        }
                    }))
                    setNodes(prev => prev.map(node => ({ ...node, data: { ...node.data, pulse: false } })))
                }, 2000)

                // Add assistant response to playground
                setMessages(prev => [...prev, {
                    role: "assistant",
                    content: data.response,
                    tokensUsed: data.tokensUsed || undefined,
                    iterations: data.iterations || undefined,
                    totalDurationMs: data.totalDurationMs || undefined,
                    toolsUsed: data.toolsUsed || undefined,
                    model: data.model || undefined,
                    trace: traceList.map((s) => ({
                        nodeId: s.type === "tool_call" ? "tools" : s.type,
                        status: s.content || "executed",
                        durationMs: s.durationMs,
                        tokensUsed: s.tokensUsed || undefined,
                        toolName: s.toolName || undefined,
                        toolArgs: s.toolArgs || undefined,
                    }))
                }])
            } else {
                setMessages(prev => [...prev, { role: "assistant", content: "Error al conectar con el servidor de sandbox." }])
            }
        } catch (error) {
            console.error("Error chatting:", error)
            setMessages(prev => [...prev, { role: "assistant", content: "Ocurrió un error inesperado al procesar tu mensaje." }])
        } finally {
            setSending(false)
        }
    }

    // Clear Sandbox Memory and History
    const handleClearSandbox = async () => {
        if (!window.confirm("¿Estás seguro de que deseas borrar toda la memoria y el historial del Sandbox de este agente? Esta acción no se puede deshacer.")) {
            return
        }

        setSending(true)
        try {
            const res = await fetch(`/api/assistant/config/${resolvedParams.id}/sandbox`, {
                method: "DELETE",
            })
            if (res.ok) {
                setMessages([])
                // Recargar el grafo de memoria 3D para reflejar que se borró el sandbox
                await fetchGraph()
                setShowSaveToast(true)
                setTimeout(() => setShowSaveToast(false), 2000)
            } else {
                alert("Error al intentar limpiar el sandbox.")
            }
        } catch (error) {
            console.error("Error clearing sandbox:", error)
            alert("Ocurrió un error inesperado al intentar limpiar el sandbox.")
        } finally {
            setSending(false)
        }
    }

    if (loading) {
        return (
            <div className={styles.section}>
                <div className="skeleton" style={{ width: "100%", height: 350 }} />
            </div>
        )
    }

    if (!profile) {
        return <div className={styles.section}>Agente no encontrado.</div>
    }

    return (
        <>
            {/* UNIFIED TOP BAR: Back, Toggles, Save */}
            <div className={styles.topBar}>
                <Link href="/dashboard/assistant" className={styles.topBarBack} title="Volver a la lista">
                    <ChevronLeft size={16} />
                    <span>Volver</span>
                </Link>

                <div className={styles.topBarTabs}>
                    <button
                        type="button"
                        onClick={() => setCanvasView("studio")}
                        className={styles.topBarTabButton}
                        style={{
                            background: canvasView === "studio" ? "var(--color-primary)" : "transparent",
                            color: canvasView === "studio" ? "#000" : "var(--color-text-muted)"
                        }}
                    >
                        <Settings size={16} />
                        <span className={styles.tabTextFull}>Entrenamiento del Agente</span>
                        <span className={styles.tabTextShort}>Entrenamiento</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setCanvasView("memory")
                            fetchGraph()
                        }}
                        className={styles.topBarTabButton}
                        style={{
                            background: canvasView === "memory" ? "var(--color-primary)" : "transparent",
                            color: canvasView === "memory" ? "#000" : "var(--color-text-muted)"
                        }}
                    >
                        <Brain size={16} />
                        <span className={styles.tabTextFull}>Cerebro 3D (Memoria)</span>
                        <span className={styles.tabTextShort}>Cerebro</span>
                    </button>
                </div>

                <div style={{ flex: 1 }} />

                <button
                    className={`btn btn-primary btn-sm ${styles.topBarSave}`}
                    onClick={handleSave}
                    disabled={isSaving}
                >
                    {isSaving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                    <span>Guardar</span>
                </button>
            </div>

            <div className={styles.splitScreenContainer}>

                {/* LEFT COLUMN: INTERACTIVE CANVAS */}
                <div className={styles.canvasColumn} style={{ display: "flex", flexDirection: "column" }}>

                    <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
                    {canvasView === "studio" ? (
                        <>
                            <ReactFlow
                                nodes={nodes}
                                edges={edges}
                                nodeTypes={nodeTypes}
                                onNodeClick={onNodeClick}
                                fitView
                                fitViewOptions={{ padding: 0.2 }}
                            >
                                <Background color="var(--color-border)" gap={16} />
                                <Controls showInteractive={false} />
                            </ReactFlow>

                            {/* Canvas hint */}
                            {activeDrawer === null && (
                                <div className={styles.canvasHint}>
                                    Haz clic en un nodo para configurar
                                </div>
                            )}
                        </>
                    ) : (
                        <div className={styles.obsidianBody} style={{ height: "100%", width: "100%", display: "flex", overflow: "hidden" }}>
                        <div className={styles.obsidianGraph} style={{ flex: 1, height: "100%", position: "relative" }}>
                            <div style={{ position: "absolute", top: "16px", right: "16px", zIndex: 10, display: "flex", gap: "8px", alignItems: "center" }}>
                                <input
                                    type="text"
                                    placeholder="Buscar..."
                                    className={styles.obsidianSearch}
                                    value={graphSearchQuery}
                                    onChange={(e) => setGraphSearchQuery(e.target.value)}
                                    style={{
                                        background: "rgba(10, 10, 10, 0.8)",
                                        backdropFilter: "blur(8px)",
                                        border: "1px solid var(--color-border)",
                                        borderRadius: "6px",
                                        color: "#fff",
                                        padding: "6px 12px",
                                        fontSize: "12px",
                                        outline: "none",
                                        width: "140px",
                                        transition: "all 0.2s"
                                    }}
                                />
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => fetchGraph()}
                                    style={{
                                        background: "rgba(23, 23, 23, 0.85)",
                                        border: "1px solid var(--color-border)",
                                        borderRadius: "6px",
                                        padding: "6px 12px",
                                        fontSize: "12px",
                                        fontWeight: "600",
                                        color: "#fff",
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center"
                                    }}
                                >
                                    Actualizar
                                </button>
                            </div>

                            {graphLoading ? (
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px", color: "var(--color-text-muted)" }}>
                                    <Loader2 className="animate-spin" size={32} style={{ color: "var(--color-primary)" }} />
                                    <span>Generando topología del grafo y relaciones...</span>
                                </div>
                            ) : !graphData?.nodes?.length ? (
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-text-muted)", textAlign: "center", padding: "var(--space-4)" }}>
                                    <BookOpen size={36} style={{ marginBottom: "var(--space-3)", opacity: 0.3 }} />
                                    <p style={{ fontSize: "var(--font-size-sm)", maxWidth: "340px" }}>
                                        No se han detectado relaciones o entidades todavía. El agente aprenderá automáticamente a medida que chatees con él en el Sandbox o vía WhatsApp.
                                    </p>
                                </div>
                            ) : (
                                <Brain3DGraph
                                    nodes={graphData.nodes}
                                    edges={graphData.edges}
                                    searchQuery={graphSearchQuery}
                                    activeNodeId={selectedGraphNode?.id || null}
                                    onNodeClick={onGraphNodeClick3D}
                                />
                            )}
                        </div>

                        <div className={styles.obsidianSidebar} style={{ width: "300px", borderLeft: "1px solid var(--color-border)", background: "var(--color-bg-primary)" }}>
                            <h4 className={styles.obsidianSidebarTitle}>Detalles de Entidad</h4>

                            {selectedGraphNode ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                                    <div>
                                        <span style={{ fontSize: "10px", textTransform: "uppercase", fontWeight: "bold", padding: "2px 6px", borderRadius: "4px", background: getNodeColor(selectedGraphNode.labels?.[0] || ""), color: "#000" }}>
                                            {selectedGraphNode.labels?.[0] || "ENTIDAD"}
                                        </span>
                                        <h4 style={{ margin: "6px 0 0 0", color: "#f3f4f6", fontSize: "var(--font-size-md)", fontWeight: "bold" }}>
                                            {selectedGraphNode.properties?.displayName || selectedGraphNode.id}
                                        </h4>
                                        {selectedGraphNode.properties?.displayName && selectedGraphNode.properties.displayName !== selectedGraphNode.id && (
                                            <div style={{ fontSize: "10px", fontFamily: "monospace", color: "#9ca3af", opacity: 0.6, marginTop: "2px" }}>
                                                ID: {selectedGraphNode.id}
                                            </div>
                                        )}
                                    </div>

                                    {selectedGraphNode.properties?.description && (
                                        <div className={styles.obsidianSidebarDesc}>
                                            {selectedGraphNode.properties.description}
                                        </div>
                                    )}

                                    {Object.entries(selectedGraphNode.properties || {}).filter(([k]) => k !== "displayName" && k !== "description").length > 0 && (
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "rgba(255, 255, 255, 0.02)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                                            {Object.entries(selectedGraphNode.properties || {})
                                                .filter(([k]) => k !== "displayName" && k !== "description")
                                                .map(([key, val]) => (
                                                    <div key={key} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                                        <span style={{ fontSize: "10px", color: "#9ca3af", fontWeight: 500 }}>
                                                            {translatePropKey(key)}
                                                        </span>
                                                        <span style={{ fontSize: "12px", color: "#f3f4f6", fontWeight: 600 }}>
                                                            {formatPropValue(key, val)}
                                                        </span>
                                                    </div>
                                                ))}
                                        </div>
                                    )}

                                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                                        <span style={{ fontSize: "11px", fontWeight: "bold", color: "#9ca3af" }}>Conexiones ({selectedGraphNode.relationships?.length || 0})</span>
                                        <div className={styles.obsidianRelationsList}>
                                            {selectedGraphNode.relationships.map((rel, idx) => (
                                                <div key={idx} className={styles.obsidianRelationItem}>
                                                    <div className={styles.obsidianRelationHeader}>
                                                        <span>{rel.role === "outgoing" ? "➜" : "⬅"} {formatRelationType(rel.type)}</span>
                                                        <span style={{ color: "#9ca3af" }}>{rel.displayName || rel.target || rel.source}</span>
                                                    </div>
                                                    {rel.properties?.description && (
                                                        <div className={styles.obsidianRelationDesc}>
                                                            {rel.properties.description}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", color: "#6b7280", fontSize: "var(--font-size-xs)", textAlign: "center" }}>
                                    Haz clic en cualquier nodo del grafo para ver sus detalles y relaciones conexas.
                                </div>
                            )}

                            <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: "var(--space-3)", marginTop: "auto" }}>
                                <div className={styles.obsidianSidebarMeta}>
                                    <div className={styles.obsidianSidebarMetaItem}>
                                        <span>Total Entidades:</span>
                                        <span style={{ color: "#f3f4f6", fontWeight: "bold" }}>{graphData?.nodes?.length || 0}</span>
                                    </div>
                                    <div className={styles.obsidianSidebarMetaItem}>
                                        <span>Relaciones:</span>
                                        <span style={{ color: "#f3f4f6", fontWeight: "bold" }}>{graphData?.edges?.length || 0}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* SLIDE DRAWERS OVERLAY */}
                {activeDrawer === "agent" && (
                    <div className={`${styles.drawerContent} ${styles.drawerAccentAgent}`}>
                        <div className={styles.drawerHeader}>
                            <div>
                                <h3 className={styles.drawerTitle}>Configurar Cerebro</h3>
                                <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: "2px" }}>
                                    Identidad, misión, tono y reglas del asistente.
                                </p>
                            </div>
                            <button className="btn btn-icon btn-sm" onClick={() => setActiveDrawer(null)}>
                                <X size={16} />
                            </button>
                        </div>

                        <div className={styles.drawerTabs}>
                            <button className={`${styles.drawerTab} ${cerebroTab === "identity" ? styles.drawerTabActive : ""}`} onClick={() => setCerebroTab("identity")}>
                                Identidad
                            </button>
                            <button className={`${styles.drawerTab} ${cerebroTab === "style" ? styles.drawerTabActive : ""}`} onClick={() => setCerebroTab("style")}>
                                Tono
                            </button>
                            <button className={`${styles.drawerTab} ${cerebroTab === "limits" ? styles.drawerTabActive : ""}`} onClick={() => setCerebroTab("limits")}>
                                Limites
                            </button>
                        </div>

                        {cerebroTab === "identity" && (<>
                        {/* Identity */}
                        <div className={styles.behaviorFieldGroup} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <label style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                                Identidad del Agente
                            </label>
                            <input
                                type="text"
                                className="input"
                                value={safeBehaviorConfig.agentIdentity ?? ""}
                                onChange={(e) => updateBehaviorAnswers({ agentIdentity: e.target.value })}
                                placeholder="Ej. Ana de Soporte, Dr. Martinez"
                                style={{ padding: "6px 10px", fontSize: "var(--font-size-sm)", background: "rgba(0,0,0,0.2)" }}
                            />
                        </div>

                        {/* Mission */}
                        <div className={styles.behaviorFieldGroup} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <label style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                                Misión Principal
                            </label>
                            <textarea
                                className="input textarea"
                                style={{ minHeight: "70px", resize: "vertical", fontSize: "var(--font-size-sm)", padding: "6px 10px", background: "rgba(0,0,0,0.2)" }}
                                value={safeBehaviorConfig.mission ?? ""}
                                onChange={(e) => updateBehaviorAnswers({ mission: e.target.value })}
                                placeholder="¿Cuál es la misión principal del agente?"
                            />
                        </div>
                        </>)}

                        {cerebroTab === "style" && (<>
                        {/* Tone & Style */}
                        <div className={styles.behaviorFieldGroup} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <label style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                                Estilo de Respuesta
                            </label>
                            <textarea
                                className="input textarea"
                                style={{ minHeight: "70px", resize: "vertical", fontSize: "var(--font-size-sm)", padding: "6px 10px", background: "rgba(0,0,0,0.2)" }}
                                value={safeBehaviorConfig.toneAndFormat ?? ""}
                                onChange={(e) => updateBehaviorAnswers({ toneAndFormat: e.target.value })}
                                placeholder="Ej. Habla de tú, responde corto y usa emojis."
                            />
                        </div>
                        </>)}

                        {cerebroTab === "limits" && (<>
                        {/* Constraints */}
                        <div className={styles.behaviorFieldGroup} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <label style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                                Límites Estrictos
                            </label>
                            <textarea
                                className="input textarea"
                                style={{ minHeight: "70px", resize: "vertical", fontSize: "var(--font-size-sm)", padding: "6px 10px", background: "rgba(0,0,0,0.2)" }}
                                value={safeBehaviorConfig.strictConstraints ?? ""}
                                onChange={(e) => updateBehaviorAnswers({ strictConstraints: e.target.value })}
                                placeholder="Reglas inviolables (una por línea)..."
                            />
                            <details style={{ marginTop: "4px" }}>
                                <summary style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", cursor: "pointer", userSelect: "none" }}>
                                    Ver sugerencias de límites rápidos
                                </summary>
                                <div className={styles.constraintChips} style={{ marginTop: "6px", display: "flex", flexWrap: "wrap", gap: "4px", maxHeight: "110px", overflowY: "auto", paddingRight: "4px" }}>
                                    {CONSTRAINT_SUGGESTIONS.map((c) => (
                                        <button
                                            key={c}
                                            type="button"
                                            className={`${styles.constraintChip} ${isConstraintActive(c) ? styles.constraintChipActive : ""}`}
                                            onClick={() => toggleConstraint(c)}
                                            style={{ fontSize: "var(--font-size-xs)", padding: "3px 6px", display: "inline-flex", alignItems: "center", gap: "2px" }}
                                        >
                                            {isConstraintActive(c) && <X size={10} />}
                                            {c}
                                        </button>
                                    ))}
                                </div>
                            </details>
                        </div>
                        </>)}
                    </div>
                )}

                {activeDrawer === "knowledge" && profile && (
                    <div className={`${styles.drawerContent} ${styles.drawerAccentKnowledge}`}>
                        <div className={styles.drawerHeader}>
                            <h3 className={styles.drawerTitle}>Configurar Conocimiento</h3>
                            <button className="btn btn-icon btn-sm" onClick={() => setActiveDrawer(null)}>
                                <X size={16} />
                            </button>
                        </div>
                        
                        <div className={styles.ragModeSelector}>
                            <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                                Modo de Conocimiento
                            </label>
                            <select
                                className={styles.ragSelect}
                                value={profile.infoMode}
                                onChange={(e) => {
                                    const newMode = e.target.value as "SIMPLE" | "ADVANCED" | "RAG"
                                    setProfile(prev => prev ? { ...prev, infoMode: newMode } : null)
                                    setKnowledgeActive(newMode === "SIMPLE" || newMode === "RAG")
                                }}
                            >
                                <option value="SIMPLE">Texto Plano (Datos Básicos)</option>
                                <option value="RAG">Base de Conocimiento (Archivos PDF, Word, etc.)</option>
                                <option value="ADVANCED">Avanzado (Campos Clave-Valor)</option>
                            </select>
                        </div>

                        {profile.infoMode === "SIMPLE" && (
                            <div className={styles.behaviorFieldGroup} style={{ marginTop: "var(--space-4)" }}>
                                <h3 className={styles.sectionTitle}>Datos Comerciales Simples</h3>
                                <p className={styles.fieldHint} style={{ marginBottom: "var(--space-2)" }}>
                                    Escribe información importante sobre tu negocio como horarios, dirección y políticas comunes para entrenar al agente.
                                </p>
                                <textarea
                                    className="input textarea"
                                    style={{ minHeight: "220px", resize: "vertical" }}
                                    value={profile.simpleInfo || ""}
                                    onChange={(e) => setProfile(prev => prev ? { ...prev, simpleInfo: e.target.value } : null)}
                                    placeholder="Escribe aquí los horarios, dirección y preguntas frecuentes..."
                                />
                            </div>
                        )}

                        {profile.infoMode === "RAG" && (
                            <div style={{ marginTop: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                                <div>
                                    <h3 className={styles.sectionTitle}>Documentos de Conocimiento</h3>
                                    <p className={styles.fieldHint}>
                                        Sube archivos con políticas detalladas de la empresa, manuales o preguntas frecuentes complejas. El agente recuperará dinámicamente partes relevantes.
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    className="btn btn-secondary w-full"
                                    onClick={() => setCanvasView("memory")}
                                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontWeight: "600", padding: "8px" }}
                                >
                                    <BookOpen size={16} />
                                    Ver Mapa de Memoria (Grafo Obsidian)
                                </button>

                                <label className={styles.dropzone}>
                                    <input 
                                        type="file" 
                                        accept=".pdf,.docx,.doc,.txt,.md,.json,.csv"
                                        onChange={handleFileUpload} 
                                        style={{ display: "none" }}
                                        disabled={uploading}
                                    />
                                    {uploading ? (
                                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                                            <Loader2 className="animate-spin" size={24} style={{ color: "var(--color-warning)" }} />
                                            <span className={styles.dropzoneText}>Procesando e indexando archivo...</span>
                                        </div>
                                    ) : (
                                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                                            <BookOpen size={24} style={{ color: "var(--color-warning)" }} />
                                            <span className={styles.dropzoneText}>Haz clic para subir un archivo</span>
                                            <span className={styles.dropzoneHint}>PDF, Word, TXT, MD (Max. 10MB)</span>
                                        </div>
                                    )}
                                </label>

                                <div className={styles.documentsContainer}>
                                    {documents.length === 0 ? (
                                        <div style={{ textAlign: "center", padding: "var(--space-4)", color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>
                                            No hay documentos indexados. Sube el primero arriba.
                                        </div>
                                    ) : (
                                        documents.map((doc) => (
                                            <div key={doc.id} className={styles.documentItem}>
                                                <div className={styles.documentInfo}>
                                                    <span className={styles.documentName} title={doc.filename}>
                                                        {doc.filename}
                                                    </span>
                                                    <span className={styles.documentMeta}>
                                                        {doc.fileType.toUpperCase()} • {(doc.fileSize / 1024).toFixed(1)} KB
                                                    </span>
                                                </div>
                                                <div className={styles.documentActions}>
                                                    {doc.processed ? (
                                                        <span className={styles.badgeProcessed}>Listo</span>
                                                    ) : doc.error ? (
                                                        <span className={styles.badgeFailed} title={doc.error}>Error</span>
                                                    ) : (
                                                        <span className={styles.badgeProcessing}>Procesando</span>
                                                    )}
                                                    <button 
                                                        className="btn btn-icon btn-sm" 
                                                        onClick={() => handleDeleteDocument(doc.id)}
                                                        style={{ color: "var(--color-error)", background: "transparent", border: "none", cursor: "pointer" }}
                                                    >
                                                        <Trash size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {profile.infoMode === "ADVANCED" && (
                            <div style={{ marginTop: "var(--space-4)", padding: "var(--space-4)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", background: "var(--color-bg-tertiary)" }}>
                                <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", lineHeight: "1.4" }}>
                                    El modo <strong>Campos Clave-Valor (Avanzado)</strong> utiliza campos estructurados cargados en la base de datos para responder preguntas específicas.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {activeDrawer === "tools" && (
                    <div className={`${styles.drawerContent} ${styles.drawerAccentTools}`}>
                        <div className={styles.drawerHeader}>
                            <h3 className={styles.drawerTitle}>Herramientas e Integraciones</h3>
                            <button className="btn btn-icon btn-sm" onClick={() => setActiveDrawer(null)}>
                                <X size={16} />
                            </button>
                        </div>
                        <p className={styles.fieldHint} style={{ marginBottom: "var(--space-4)" }}>
                            Habilita o deshabilita los servicios externos con los que tu agente interactuará en tiempo real.
                        </p>

                        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                            {/* Connected Integrations */}
                            {isCalendarConnected && (
                            <div className="card" style={{ padding: "var(--space-3)", border: "1px solid var(--color-border)", background: "var(--color-bg-secondary)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                                        <div style={{ color: "var(--color-info)" }}><Calendar size={18} /></div>
                                        <span style={{ fontWeight: 600 }}>Google Calendar</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                                        <span className={styles.nodeStatusBadge} style={{
                                            background: "rgba(34, 197, 94, 0.15)",
                                            color: "var(--color-success)",
                                            padding: "2px 6px"
                                        }}>
                                            Conectado
                                        </span>
                                        <input
                                            type="checkbox"
                                            checked={isCalendarActive}
                                            onChange={() => calendarIntegration && handleToggleIntegration(calendarIntegration.id, isCalendarActive)}
                                            style={{ width: 18, height: 18, cursor: "pointer" }}
                                        />
                                    </div>
                                </div>
                                <p className={styles.fieldHint} style={{ marginTop: "6px" }}>
                                    Permite al agente consultar disponibilidad y agendar citas automáticamente.
                                </p>
                                <details style={{ marginTop: "var(--space-2)" }}>
                                    <summary style={{ fontSize: "var(--font-size-xs)", color: "var(--color-info)", fontWeight: 500, cursor: "pointer" }}>
                                        Ver/Editar instrucciones de la herramienta (Prompt)
                                    </summary>
                                    <div style={{ marginTop: "var(--space-2)" }}>
                                        <textarea
                                            className={styles.textarea}
                                            rows={4}
                                            value={behaviorConfig.toolPrompts?.GOOGLE_CALENDAR ?? DEFAULT_TOOL_PROMPTS.GOOGLE_CALENDAR}
                                            onChange={(e) => handleUpdateToolPrompt("GOOGLE_CALENDAR", e.target.value)}
                                            style={{
                                                width: "100%",
                                                background: "rgba(0,0,0,0.2)",
                                                borderRadius: "var(--border-radius)",
                                                border: "1px solid var(--color-border)",
                                                fontFamily: "monospace",
                                                fontSize: "var(--font-size-xs)",
                                                color: "var(--color-text-primary)",
                                                padding: "var(--space-2)",
                                                resize: "vertical",
                                                lineHeight: "1.4"
                                            }}
                                            placeholder="Define cómo el asistente debe usar esta herramienta..."
                                        />
                                    </div>
                                </details>
                            </div>
                            )}

                            {/* GOOGLE SHEETS */}
                            {isSheetsConnected && (
                            <div className="card" style={{ padding: "var(--space-3)", border: "1px solid var(--color-border)", background: "var(--color-bg-secondary)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                                        <div style={{ color: "#0f9d58" }}><FileText size={18} /></div>
                                        <span style={{ fontWeight: 600 }}>Google Sheets</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                                        <span className={styles.nodeStatusBadge} style={{ background: "rgba(34, 197, 94, 0.15)", color: "var(--color-success)", padding: "2px 6px" }}>Conectado</span>
                                        <input type="checkbox" checked={isSheetsActive} onChange={() => sheetsIntegration && handleToggleIntegration(sheetsIntegration.id, isSheetsActive)} style={{ width: 18, height: 18, cursor: "pointer" }} />
                                    </div>
                                </div>
                                <p className={styles.fieldHint} style={{ marginTop: "6px" }}>
                                    Permite al agente leer y escribir filas en tus hojas de calculo conectadas.
                                </p>
                                <details style={{ marginTop: "var(--space-2)" }}>
                                    <summary style={{ fontSize: "var(--font-size-xs)", color: "var(--color-info)", fontWeight: 500, cursor: "pointer" }}>Ver/Editar instrucciones de la herramienta (Prompt)</summary>
                                    <div style={{ marginTop: "var(--space-2)" }}>
                                        <textarea className={styles.textarea} rows={4} value={behaviorConfig.toolPrompts?.GOOGLE_SHEETS ?? DEFAULT_TOOL_PROMPTS.GOOGLE_SHEETS} onChange={(e) => handleUpdateToolPrompt("GOOGLE_SHEETS", e.target.value)} style={{ width: "100%", background: "rgba(0,0,0,0.2)", borderRadius: "var(--border-radius)", border: "1px solid var(--color-border)", fontFamily: "monospace", fontSize: "var(--font-size-xs)", color: "var(--color-text-primary)", padding: "var(--space-2)", resize: "vertical", lineHeight: "1.4" }} placeholder="Define como el asistente debe usar esta herramienta..." />
                                    </div>
                                </details>
                            </div>
                            )}

                            {/* NOTION */}
                            {isNotionConnected && (
                            <div className="card" style={{ padding: "var(--space-3)", border: "1px solid var(--color-border)", background: "var(--color-bg-secondary)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                                        <div style={{ color: "var(--color-text-primary)" }}><BookOpen size={18} /></div>
                                        <span style={{ fontWeight: 600 }}>Notion</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                                        <span className={styles.nodeStatusBadge} style={{ background: "rgba(34, 197, 94, 0.15)", color: "var(--color-success)", padding: "2px 6px" }}>Conectado</span>
                                        <input type="checkbox" checked={isNotionActive} onChange={() => notionIntegration && handleToggleIntegration(notionIntegration.id, isNotionActive)} style={{ width: 18, height: 18, cursor: "pointer" }} />
                                    </div>
                                </div>
                                <p className={styles.fieldHint} style={{ marginTop: "6px" }}>
                                    Permite al agente consultar y estructurar paginas de Notion como base comercial.
                                </p>
                                <details style={{ marginTop: "var(--space-2)" }}>
                                    <summary style={{ fontSize: "var(--font-size-xs)", color: "var(--color-info)", fontWeight: 500, cursor: "pointer" }}>Ver/Editar instrucciones de la herramienta (Prompt)</summary>
                                    <div style={{ marginTop: "var(--space-2)" }}>
                                        <textarea className={styles.textarea} rows={4} value={behaviorConfig.toolPrompts?.NOTION ?? DEFAULT_TOOL_PROMPTS.NOTION} onChange={(e) => handleUpdateToolPrompt("NOTION", e.target.value)} style={{ width: "100%", background: "rgba(0,0,0,0.2)", borderRadius: "var(--border-radius)", border: "1px solid var(--color-border)", fontFamily: "monospace", fontSize: "var(--font-size-xs)", color: "var(--color-text-primary)", padding: "var(--space-2)", resize: "vertical", lineHeight: "1.4" }} placeholder="Define como el asistente debe usar esta herramienta..." />
                                    </div>
                                </details>
                            </div>
                            )}

                            {/* SLACK */}
                            {isSlackConnected && (
                            <div className="card" style={{ padding: "var(--space-3)", border: "1px solid var(--color-border)", background: "var(--color-bg-secondary)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                                        <div style={{ color: "#e01e5a", display: "flex", alignItems: "center" }}><Send size={18} /></div>
                                        <span style={{ fontWeight: 600 }}>Slack</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                                        <span className={styles.nodeStatusBadge} style={{ background: "rgba(34, 197, 94, 0.15)", color: "var(--color-success)", padding: "2px 6px" }}>Conectado</span>
                                        <input type="checkbox" checked={isSlackActive} onChange={() => slackIntegration && handleToggleIntegration(slackIntegration.id, isSlackActive)} style={{ width: 18, height: 18, cursor: "pointer" }} />
                                    </div>
                                </div>
                                <p className={styles.fieldHint} style={{ marginTop: "6px" }}>
                                    Permite al agente enviar mensajes automaticos y notificaciones a canales de Slack.
                                </p>
                                <details style={{ marginTop: "var(--space-2)" }}>
                                    <summary style={{ fontSize: "var(--font-size-xs)", color: "var(--color-info)", fontWeight: 500, cursor: "pointer" }}>Ver/Editar instrucciones de la herramienta (Prompt)</summary>
                                    <div style={{ marginTop: "var(--space-2)" }}>
                                        <textarea className={styles.textarea} rows={4} value={behaviorConfig.toolPrompts?.SLACK ?? DEFAULT_TOOL_PROMPTS.SLACK} onChange={(e) => handleUpdateToolPrompt("SLACK", e.target.value)} style={{ width: "100%", background: "rgba(0,0,0,0.2)", borderRadius: "var(--border-radius)", border: "1px solid var(--color-border)", fontFamily: "monospace", fontSize: "var(--font-size-xs)", color: "var(--color-text-primary)", padding: "var(--space-2)", resize: "vertical", lineHeight: "1.4" }} placeholder="Define como el asistente debe usar esta herramienta..." />
                                    </div>
                                </details>
                            </div>
                            )}

                            {/* No connected integrations message */}
                            {!isCalendarConnected && !isSheetsConnected && !isNotionConnected && !isSlackConnected && (
                                <div style={{ textAlign: "center", padding: "var(--space-6) var(--space-4)", color: "var(--color-text-muted)" }}>
                                    <Hammer size={24} style={{ marginBottom: "var(--space-2)", opacity: 0.4 }} />
                                    <p style={{ fontSize: "var(--font-size-sm)" }}>No tienes herramientas conectadas.</p>
                                    <p style={{ fontSize: "var(--font-size-xs)" }}>Configura tus integraciones para habilitarlas aqui.</p>
                                </div>
                            )}
                        </div>

                        {/* Disconnected integrations - compact section */}
                        {(!isCalendarConnected || !isSheetsConnected || !isNotionConnected || !isSlackConnected) && (
                            <details style={{ marginTop: "var(--space-2)" }}>
                                <summary style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", fontWeight: 500, cursor: "pointer", userSelect: "none" }}>
                                    Agregar mas herramientas
                                </summary>
                                <div className={styles.disconnectedToolsList}>
                                    {!isCalendarConnected && (
                                        <Link href="/dashboard/integrations" className={styles.disconnectedToolItem}>
                                            <span><Calendar size={14} /> Google Calendar</span>
                                            <ExternalLink size={12} />
                                        </Link>
                                    )}
                                    {!isSheetsConnected && (
                                        <Link href="/dashboard/integrations" className={styles.disconnectedToolItem}>
                                            <span><FileText size={14} /> Google Sheets</span>
                                            <ExternalLink size={12} />
                                        </Link>
                                    )}
                                    {!isNotionConnected && (
                                        <Link href="/dashboard/integrations" className={styles.disconnectedToolItem}>
                                            <span><BookOpen size={14} /> Notion</span>
                                            <ExternalLink size={12} />
                                        </Link>
                                    )}
                                    {!isSlackConnected && (
                                        <Link href="/dashboard/integrations" className={styles.disconnectedToolItem}>
                                            <span><Send size={14} /> Slack</span>
                                            <ExternalLink size={12} />
                                        </Link>
                                    )}
                                </div>
                            </details>
                        )}
                    </div>
                )}
            </div>

            {/* RIGHT COLUMN: PLAYGROUND CHAT */}
            {canvasView === "studio" && (
                <div className={`${styles.playgroundColumn} ${isMobileChatOpen ? styles.playgroundColumnOpen : ""}`}>
                    <div className={styles.playgroundHeader}>
                        <h3 className={styles.playgroundTitle}>Sandbox del Agente</h3>
                        <button 
                            className="btn btn-icon btn-sm" 
                            onClick={handleClearSandbox} 
                            disabled={sending} 
                            title="Borrar memoria e historial de Sandbox"
                        >
                            <Trash size={16} />
                        </button>
                    </div>

                    <div className={styles.playgroundChat}>
                        {messages.length === 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, color: "var(--color-text-muted)", textAlign: "center", padding: "var(--space-4)" }}>
                                <Play size={28} style={{ marginBottom: "var(--space-3)", opacity: 0.5 }} />
                                <p style={{ fontSize: "var(--font-size-sm)" }}>Interactúa con tu agente para ver cómo reacciona en tiempo real.</p>
                            </div>
                        ) : (
                            messages.map((m, idx) => (
                                <div
                                    key={idx}
                                    className={`${styles.messageBubble} ${m.role === "user" ? styles.messageUser : styles.messageAgent}`}
                                >
                                    <div>{m.content}</div>

                                    {/* Debug traces */}
                                    {m.trace && m.trace.length > 0 && (
                                        <details className={styles.traceBox}>
                                            <summary style={{ cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                                <span>Ver traza de ejecución</span>
                                                {m.tokensUsed && (
                                                    <span style={{ fontWeight: 400, opacity: 0.7 }}>
                                                        {m.tokensUsed.total.toLocaleString()} tokens
                                                    </span>
                                                )}
                                            </summary>
                                            <div style={{ marginTop: "var(--space-2)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                                                {/* Token usage summary bar */}
                                                {m.tokensUsed && (
                                                    <div className={styles.tokenSummary}>
                                                        <div className={styles.tokenRow}>
                                                            <span className={styles.tokenLabel}>Entrada</span>
                                                            <span className={styles.tokenValue}>{m.tokensUsed.prompt.toLocaleString()}</span>
                                                        </div>
                                                        <div className={styles.tokenRow}>
                                                            <span className={styles.tokenLabel}>Salida</span>
                                                            <span className={styles.tokenValue}>{m.tokensUsed.completion.toLocaleString()}</span>
                                                        </div>
                                                        <div className={styles.tokenRow} style={{ fontWeight: 700 }}>
                                                            <span className={styles.tokenLabel}>Total</span>
                                                            <span className={styles.tokenValue}>{m.tokensUsed.total.toLocaleString()}</span>
                                                        </div>
                                                        {/* Visual bar */}
                                                        <div className={styles.tokenBar}>
                                                            <div className={styles.tokenBarInput} style={{ width: `${(m.tokensUsed.prompt / m.tokensUsed.total) * 100}%` }} />
                                                            <div className={styles.tokenBarOutput} style={{ width: `${(m.tokensUsed.completion / m.tokensUsed.total) * 100}%` }} />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Pipeline metadata */}
                                                <div className={styles.pipelineMeta}>
                                                    {m.iterations && <span>Iteraciones: {m.iterations}</span>}
                                                    {m.totalDurationMs && <span>Duración: {(m.totalDurationMs / 1000).toFixed(1)}s</span>}
                                                    {m.toolsUsed && m.toolsUsed.length > 0 && (
                                                        <span>Tools: {m.toolsUsed.join(", ")}</span>
                                                    )}
                                                </div>

                                                {/* Step-by-step trace */}
                                                <div className={styles.traceSteps}>
                                                    {m.trace.map((t, tIdx) => (
                                                        <div key={tIdx} className={styles.traceItem}>
                                                            <div className={styles.traceStepHeader}>
                                                                <span className={styles.traceStepIndex}>{tIdx + 1}</span>
                                                                <span className={styles.traceStepType}>
                                                                    {t.toolName || t.nodeId}
                                                                </span>
                                                                <span className={t.status === "error" ? styles.traceStatusError : styles.traceStatusSuccess}>
                                                                    {t.durationMs ? `${t.durationMs}ms` : "ok"}
                                                                </span>
                                                            </div>
                                                            {t.tokensUsed != null && t.tokensUsed > 0 && (
                                                                <div className={styles.traceStepTokens}>
                                                                    {t.tokensUsed.toLocaleString()} tokens
                                                                </div>
                                                            )}
                                                            {t.status && t.status !== "executed" && (
                                                                <div className={styles.traceStepContent}>
                                                                    {t.status.length > 120 ? t.status.slice(0, 120) + "..." : t.status}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </details>
                                    )}
                                </div>
                            ))
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    <div className={styles.playgroundInputArea}>
                        <form onSubmit={sendChatMessage} className={styles.playgroundForm}>
                            <input
                                type="text"
                                className="input"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                placeholder="Escribe tu mensaje aquí..."
                                disabled={sending}
                                style={{ flex: 1 }}
                            />
                            <button type="submit" className="btn btn-primary" disabled={sending || !chatInput.trim()}>
                                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* MOBILE FLOATING ACTION BUTTON */}
            {canvasView === "studio" && (
                <button 
                    className={`${styles.mobileChatFab} ${isMobileChatOpen ? styles.mobileChatFabActive : ""}`}
                    onClick={() => setIsMobileChatOpen(!isMobileChatOpen)}
                    title="Abrir Sandbox"
                >
                    {isMobileChatOpen ? <X size={24} /> : <MessageSquare size={24} />}
                </button>
            )}

            {/* Save Toast */}
            {showSaveToast && (
                <div className={styles.saveToast}>
                    <Check size={16} />
                    Cambios guardados
                </div>
            )}
            </div>
        </>
    )
}

function getNodeColor(label: string): string {
    const l = label.toLowerCase()
    if (l === "estudio" || l === "cliente") return "#fca5a5" // stem (soft red)
    if (l.includes("persona") || l.includes("contacto") || l.includes("organiza") || l.includes("rol")) return "#d8b4fe" // frontal (soft purple)
    if (l.includes("dato") || l.includes("conocimiento") || l.includes("hecho")) return "#93c5fd" // parietal (soft blue)
    if (l.includes("ubicaci") || l.includes("lugar")) return "#86efac" // occipital (soft green)
    if (l.includes("preferencia") || l.includes("gusto")) return "#fde047" // temporal (soft yellow)
    return "#a78bfa" // default lavender
}
