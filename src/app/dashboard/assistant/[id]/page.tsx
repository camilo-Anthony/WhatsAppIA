"use client"

import { useState, useEffect, useCallback } from "react"
import { Save } from "lucide-react"
import { useRouter } from "next/navigation"
import styles from "../assistant.module.css"

interface AssistantProfile {
    id: string
    name: string
    behaviorPrompt: string
    infoMode: "SIMPLE" | "ADVANCED"
    simpleInfo: string
}

const BEHAVIOR_TEMPLATES = [
    {
        name: "Amigable",
        prompt: "Eres un asistente virtual amigable y cercano. Usa un tono cálido y empático. Responde de manera clara y sencilla. Mantén un lenguaje natural para hacer la conversación más agradable. Si no puedes ayudar con algo, sugiere amablemente contactar directamente al negocio.",
    },
    {
        name: "Profesional",
        prompt: "Eres un asistente virtual profesional y eficiente. Mantén un tono formal pero accesible. Responde de manera precisa y directa. Prioriza la claridad y exactitud en cada respuesta. Cuando no tengas información, indica que derivarás la consulta al equipo correspondiente.",
    },
    {
        name: "Vendedor",
        prompt: "Eres un asistente de ventas entusiasta y persuasivo. Tu objetivo es ayudar al cliente a encontrar lo que necesita y guiarlo hacia una compra. Destaca los beneficios de los productos/servicios. Haz preguntas para entender las necesidades del cliente. Ofrece alternativas cuando sea posible.",
    },
    {
        name: "Soporte Técnico",
        prompt: "Eres un asistente de soporte técnico paciente y detallado. Guía al usuario paso a paso para resolver sus problemas. Usa un lenguaje claro evitando jerga técnica innecesaria. Si el problema requiere intervención humana, escala amablemente proporcionando los pasos ya realizados.",
    },
]

import { use } from "react"

export default function AssistantBehaviorPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params)
    const router = useRouter()
    const [profile, setProfile] = useState<AssistantProfile | null>(null)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [loading, setLoading] = useState(true)

    const loadProfile = useCallback(async () => {
        if (resolvedParams.id === "new") {
            const draft = localStorage.getItem("assistant_draft")
            if (draft) {
                setProfile(JSON.parse(draft))
            } else {
                const initialDraft = {
                    id: "new",
                    name: "Nuevo Agente",
                    behaviorPrompt: "Eres un asistente virtual amable y profesional. Respondes de forma clara y concisa.",
                    infoMode: "SIMPLE",
                    simpleInfo: ""
                }
                setProfile(initialDraft)
                localStorage.setItem("assistant_draft", JSON.stringify(initialDraft))
            }
            setLoading(false)
            return
        }

        try {
            const res = await fetch(`/api/assistant/config/${resolvedParams.id}`)
            if (res.ok) {
                const data = await res.json()
                setProfile(data.profile)
            }
        } catch (error) {
            console.error("Error loading profile:", error)
        } finally {
            setLoading(false)
        }
    }, [resolvedParams.id])

    useEffect(() => {
        loadProfile()
    }, [loadProfile])

    const updateLocalProfile = (field: string, value: string) => {
        setProfile((prev) => {
            if (!prev) return null
            const updated = { ...prev, [field]: value }
            if (resolvedParams.id === "new") {
                localStorage.setItem("assistant_draft", JSON.stringify(updated))
                // Disparar evento de storage para que el layout se entere (el nombre)
                window.dispatchEvent(new Event('storage'))
            }
            return updated
        })
    }

    const handleSave = useCallback(async () => {
        if (!profile || resolvedParams.id === "new") return
        setSaving(true)
        setSaved(false)

        try {
            await fetch(`/api/assistant/config/${resolvedParams.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: profile.name,
                    behaviorPrompt: profile.behaviorPrompt,
                    infoMode: profile.infoMode,
                    simpleInfo: profile.simpleInfo,
                }),
            })
            setSaved(true)
            router.refresh()
            setTimeout(() => setSaved(false), 3000)
        } catch (error) {
            console.error("Error saving:", error)
        } finally {
            setSaving(false)
        }
    }, [profile, resolvedParams.id, router])

    useEffect(() => {
        window.addEventListener('save-assistant', handleSave)
        return () => window.removeEventListener('save-assistant', handleSave)
    }, [handleSave])

    if (loading) {
        return (
            <div className={styles.section}>
                <div className="skeleton" style={{ width: "100%", height: 200 }} />
            </div>
        )
    }

    if (!profile) {
        return <div className={styles.section}>Agente no encontrado.</div>
    }

    return (
        <div className={styles.section}>
            <div style={{ marginBottom: "var(--space-6)" }}>
                <h3 className={styles.sectionTitle}>Nombre del Agente</h3>
                <input
                    type="text"
                    className="input"
                    value={profile.name}
                    onChange={(e) => updateLocalProfile("name", e.target.value)}
                    placeholder="Ej. Agente de Soporte"
                />
            </div>
            
            <h3 className={styles.sectionTitle}>Plantillas de comportamiento</h3>
            <div className={styles.templateGrid}>
                {BEHAVIOR_TEMPLATES.map((template) => (
                    <button
                        key={template.name}
                        className={`card ${styles.templateCard} ${profile.behaviorPrompt === template.prompt ? styles.templateActive : ""}`}
                        onClick={() => updateLocalProfile("behaviorPrompt", template.prompt)}
                    >
                        <span className={styles.templateName}>{template.name}</span>
                    </button>
                ))}
            </div>

            <h3 className={styles.sectionTitle}>Prompt personalizado</h3>
            <textarea
                className="input textarea"
                style={{ minHeight: 200 }}
                value={profile.behaviorPrompt}
                onChange={(e) => updateLocalProfile("behaviorPrompt", e.target.value)}
                placeholder="Define cómo debe comportarse tu asistente..."
            />
        </div>
    )
}
