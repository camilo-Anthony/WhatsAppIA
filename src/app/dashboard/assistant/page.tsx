"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Plus, Bot, Link2, Trash2, Copy } from "lucide-react"
import styles from "./assistant.module.css"

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

    const handleCreate = () => {
        router.push("/dashboard/assistant/new")
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
            <div className={styles.grid} style={{ marginTop: "var(--space-6)" }}>
                {[1, 2, 3].map(i => (
                    <div key={i} className="skeleton" style={{ height: 160, borderRadius: "var(--radius-lg)" }} />
                ))}
            </div>
        )
    }

    if (profiles.length === 0) {
        return (
            <div className={styles.emptyProfiles}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-4)', color: 'var(--color-primary)' }}>
                    <Bot size={48} />
                </div>
                <h3>No tienes agentes creados</h3>
                <p>Crea tu primer agente IA para conectarlo a tus números de WhatsApp.</p>
                <button 
                    className="btn btn-primary" 
                    onClick={handleCreate}
                >
                    <Plus size={18} /> Crear Agente
                </button>
            </div>
        )
    }

    return (
        <div>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Laboratorio IA</h1>
                    <p className={styles.subtitle}>Crea y gestiona agentes inteligentes para tus conexiones</p>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-6)' }}>
                <button 
                    className="btn btn-primary" 
                    onClick={handleCreate}
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                <div className={styles.agentAvatar}>
                                    <Bot size={24} />
                                </div>
                                <h3 className={styles.agentName}>{profile.name}</h3>
                            </div>
                            <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
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
                                {profile.behaviorPrompt.length > 80 
                                    ? profile.behaviorPrompt.substring(0, 80) + '...' 
                                    : profile.behaviorPrompt}
                            </p>
                            <div className={styles.agentMeta}>
                                <span className={`badge badge-neutral ${styles.metaBadge}`}>
                                    {profile.infoMode === "SIMPLE" ? "Conocimiento Simple" : "Conocimiento Avanzado"}
                                </span>
                                <span className={`badge badge-neutral ${styles.metaBadge}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Link2 size={12} />
                                    {profile.connections.length} {profile.connections.length === 1 ? 'conexión' : 'conexiones'}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
