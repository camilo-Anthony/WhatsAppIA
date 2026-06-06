"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Plus, Bot, Link2, Trash2, Copy, X, Pencil } from "lucide-react"
import styles from "./assistant.module.css"
import { getStructuredDashboardSummary } from "@/lib/ai/agent/dashboard-config"

interface AssistantProfile {
    id: string
    name: string
    behaviorPrompt: string
    infoMode: "SIMPLE" | "ADVANCED"
    connections: { id: string }[]
}

export default function AssistantListPage() {
    const [profiles, setProfiles] = useState<AssistantProfile[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [newAgentName, setNewAgentName] = useState("")
    const [isCreating, setIsCreating] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editingName, setEditingName] = useState("")
    const router = useRouter()

    const loadProfiles = useCallback(async () => {
        try {
            const res = await fetch("/api/assistant/config")
            if (res.ok) {
                const data = await res.json()
                if (data.profiles) {
                    setProfiles(data.profiles)
                }
            }
        } catch (error) {
            console.error("Error loading profiles:", error)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadProfiles()
    }, [loadProfiles])

    const handleCreateAgent = async () => {
        const name = newAgentName.trim()
        if (!name) return

        setIsCreating(true)
        try {
            const defaultPrompt = "STRUCTURED_DASHBOARD_CONFIG_V1\n" + JSON.stringify({
                agentIdentity: name,
                mission: "",
                toneAndFormat: "",
                strictConstraints: "",
            }, null, 2)

            const res = await fetch("/api/assistant/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    behaviorPrompt: defaultPrompt,
                    infoMode: "SIMPLE",
                    simpleInfo: "",
                }),
            })

            if (res.ok) {
                const data = await res.json()
                setShowCreateModal(false)
                setNewAgentName("")
                router.push(`/dashboard/assistant/${data.profile.id}`)
            } else {
                const errorData = await res.json().catch(() => ({}))
                alert("Error al crear: " + (errorData.error || "Error desconocido"))
            }
        } catch (error) {
            console.error("Error creating agent:", error)
            alert("Error de conexion. Intenta de nuevo.")
        } finally {
            setIsCreating(false)
        }
    }

    const handleRenameAgent = async (id: string) => {
        const name = editingName.trim()
        if (!name) return

        try {
            const res = await fetch(`/api/assistant/config/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            })
            if (res.ok) {
                setEditingId(null)
                loadProfiles()
            }
        } catch (error) {
            console.error("Error renaming agent:", error)
        }
    }

    const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation()
        if (!confirm(`¿Eliminar al agente "${name}"? Las conexiones asociadas quedarán sin perfil.`)) return

        try {
            const res = await fetch(`/api/assistant/config/${id}`, { method: "DELETE" })
            if (res.ok) {
                loadProfiles()
            }
        } catch (error) {
            console.error("Error deleting profile:", error)
        }
    }

    const handleDuplicate = async (e: React.MouseEvent, profile: AssistantProfile) => {
        e.stopPropagation()
        try {
            const getRes = await fetch(`/api/assistant/config/${profile.id}`)
            if (!getRes.ok) return
            const data = await getRes.json()
            const fullProfile = data.profile

            const postRes = await fetch("/api/assistant/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: `${fullProfile.name} (copia)`,
                    behaviorPrompt: fullProfile.behaviorPrompt,
                    infoMode: fullProfile.infoMode,
                    simpleInfo: fullProfile.simpleInfo,
                }),
            })
            if (postRes.ok) {
                loadProfiles()
            }
        } catch (error) {
            console.error("Error duplicating profile:", error)
        }
    }

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.grid} style={{ marginTop: "var(--space-6)" }}>
                    {[1, 2, 3].map(i => (
                        <div key={i} className="skeleton" style={{ height: 160, borderRadius: "var(--radius-lg)" }} />
                    ))}
                </div>
            </div>
        )
    }

    if (profiles.length === 0) {
        return (
            <div className={styles.container}>
                <div className={styles.emptyProfiles}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-4)', color: 'var(--color-primary)' }}>
                        <Bot size={48} />
                    </div>
                    <h3>No tienes agentes creados</h3>
                    <p>Crea tu primer agente IA para conectarlo a tus numeros de WhatsApp.</p>
                    <button
                        className="btn btn-primary"
                        onClick={() => setShowCreateModal(true)}
                    >
                        <Plus size={18} /> Crear Agente
                    </button>
                </div>

                {showCreateModal && (
                    <CreateAgentModal
                        name={newAgentName}
                        setName={setNewAgentName}
                        isCreating={isCreating}
                        onClose={() => { setShowCreateModal(false); setNewAgentName("") }}
                        onCreate={handleCreateAgent}
                    />
                )}
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Laboratorio IA</h1>
                    <p className={styles.subtitle}>Crea y gestiona agentes inteligentes para tus conexiones</p>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-6)' }}>
                <button
                    className="btn btn-primary"
                    onClick={() => setShowCreateModal(true)}
                >
                    <Plus size={18} /> Nuevo Agente
                </button>
            </div>

            <div className={styles.grid}>
                {profiles.map((profile) => (
                    <div
                        key={profile.id}
                        className={`card ${styles.agentCard}`}
                        onClick={() => router.push(`/dashboard/assistant/${profile.id}`)}
                    >
                        <div className={styles.agentCardHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1, minWidth: 0 }}>
                                <div className={styles.agentAvatar}>
                                    <Bot size={24} />
                                </div>
                                {editingId === profile.id ? (
                                    <form
                                        onSubmit={(e) => { e.preventDefault(); handleRenameAgent(profile.id) }}
                                        onClick={(e) => e.stopPropagation()}
                                        style={{ flex: 1 }}
                                    >
                                        <input
                                            type="text"
                                            className="input"
                                            value={editingName}
                                            onChange={(e) => setEditingName(e.target.value)}
                                            onBlur={() => handleRenameAgent(profile.id)}
                                            autoFocus
                                            style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, padding: '4px 8px' }}
                                        />
                                    </form>
                                ) : (
                                    <h3 className={styles.agentName}>{profile.name}</h3>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                                <button
                                    className="btn btn-ghost btn-icon"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setEditingId(profile.id)
                                        setEditingName(profile.name)
                                    }}
                                    title="Renombrar"
                                >
                                    <Pencil size={16} />
                                </button>
                                <button
                                    className="btn btn-ghost btn-icon"
                                    onClick={(e) => handleDuplicate(e, profile)}
                                    title="Duplicar"
                                >
                                    <Copy size={16} />
                                </button>
                                <button
                                    className="btn btn-ghost btn-icon"
                                    onClick={(e) => handleDelete(e, profile.id, profile.name)}
                                    title="Eliminar"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>

                        <div className={styles.agentCardBody}>
                            <p className={styles.agentSnippet}>
                                {getStructuredDashboardSummary(profile.behaviorPrompt).length > 100
                                    ? getStructuredDashboardSummary(profile.behaviorPrompt).substring(0, 100) + "..."
                                    : getStructuredDashboardSummary(profile.behaviorPrompt)}
                            </p>
                            <div className={styles.agentMeta}>
                                <span className={`badge badge-neutral ${styles.metaBadge}`}>
                                    {profile.infoMode === "SIMPLE" ? "Conocimiento Simple" : "Conocimiento Avanzado"}
                                </span>
                                <span className={`badge badge-neutral ${styles.metaBadge}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Link2 size={12} />
                                    {profile.connections.length} {profile.connections.length === 1 ? 'conexion' : 'conexiones'}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {showCreateModal && (
                <CreateAgentModal
                    name={newAgentName}
                    setName={setNewAgentName}
                    isCreating={isCreating}
                    onClose={() => { setShowCreateModal(false); setNewAgentName("") }}
                    onCreate={handleCreateAgent}
                />
            )}
        </div>
    )
}

function CreateAgentModal({ name, setName, isCreating, onClose, onCreate }: {
    name: string
    setName: (v: string) => void
    isCreating: boolean
    onClose: () => void
    onCreate: () => void
}) {
    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h3 className={styles.modalTitle}>Crear nuevo agente</h3>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <div className={styles.modalBody}>
                    <label className={styles.questionText}>¿Como se llamara tu agente?</label>
                    <span className={styles.questionHint}>Puedes cambiarlo despues desde esta misma vista.</span>
                    <input
                        type="text"
                        className="input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ej. Soporte Ventas, Bot Principal, Ana"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onCreate() }}
                        style={{ marginTop: 'var(--space-3)' }}
                    />
                </div>

                <div className={styles.modalFooter}>
                    <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
                    <button
                        className="btn btn-primary"
                        onClick={onCreate}
                        disabled={!name.trim() || isCreating}
                    >
                        {isCreating ? "Creando..." : "Crear y configurar"}
                    </button>
                </div>
            </div>
        </div>
    )
}
