"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import styles from "../assistant.module.css"

interface AssistantProfile {
    id: string
    name: string
    behaviorPrompt: string
    infoMode: "SIMPLE" | "ADVANCED"
    simpleInfo: string
}

// Removed BEHAVIOR_TEMPLATES as we are using a guided form now.

import { use } from "react"

export default function AssistantBehaviorPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params)
    const router = useRouter()
    const [profile, setProfile] = useState<AssistantProfile | null>(null)
    const [loading, setLoading] = useState(true)

    // Generator states
    const [generatorRole, setGeneratorRole] = useState("")
    const [generatorTone, setGeneratorTone] = useState("")
    const [generatorRules, setGeneratorRules] = useState("")

    const applyGeneratedPrompt = () => {
        const prompt = `Eres un ${generatorRole}.
Tu tono de comunicación debe ser ${generatorTone}.

Reglas de oro a seguir estrictamente:
- Prioriza la satisfacción del cliente.
- Si no sabes algo, no lo inventes, pide que contacten a un humano.
${generatorRules.trim() ? generatorRules.split('\n').map(r => r.trim().startsWith('-') ? r : `- ${r}`).join('\n') : ''}`

        updateLocalProfile("behaviorPrompt", prompt)
    }

    const loadProfile = useCallback(async () => {
        if (resolvedParams.id === "new") {
            const draft = localStorage.getItem("assistant_draft")
            if (draft) {
                setProfile(JSON.parse(draft))
            } else {
                const initialDraft: AssistantProfile = {
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
            router.refresh()
        } catch (error) {
            console.error("Error saving:", error)
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
            
            <h3 className={styles.sectionTitle}>Constructor Guiado (Recomendado)</h3>
            <p style={{ color: "var(--color-text-secondary)", marginBottom: "var(--space-4)", fontSize: "var(--font-size-sm)" }}>
                Responde estas 3 preguntas rápidas para generar un comportamiento optimizado, o edita el texto manualmente en la caja inferior.
            </p>

            <div style={{ 
                display: "flex", 
                flexDirection: "column", 
                gap: "var(--space-4)", 
                background: "var(--color-bg-tertiary)", 
                padding: "var(--space-5)", 
                borderRadius: "var(--radius-lg)", 
                marginBottom: "var(--space-6)", 
                border: "1px solid var(--color-border)" 
            }}>
                <div>
                    <label style={{ display: "block", fontSize: "var(--font-size-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>
                        1. ¿Cuál es su rol principal?
                    </label>
                    <input 
                        type="text"
                        className="input" 
                        value={generatorRole} 
                        onChange={(e) => setGeneratorRole(e.target.value)}
                        placeholder="Ej: Asistente de ventas para una ferretería"
                        style={{ width: "100%", background: "var(--color-bg-primary)" }}
                    />
                </div>
                
                <div>
                    <label style={{ display: "block", fontSize: "var(--font-size-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>
                        2. ¿Qué tono de comunicación debe usar?
                    </label>
                    <input 
                        type="text"
                        className="input" 
                        value={generatorTone} 
                        onChange={(e) => setGeneratorTone(e.target.value)}
                        placeholder="Ej: Amigable, persuasivo y formal"
                        style={{ width: "100%", background: "var(--color-bg-primary)" }}
                    />
                </div>

                <div>
                    <label style={{ display: "block", fontSize: "var(--font-size-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>
                        3. Reglas estrictas adicionales (Opcional)
                    </label>
                    <textarea 
                        className="input textarea" 
                        placeholder="Ej: Nunca des descuentos mayores al 10%, no hables de política, responde siempre en 2 oraciones máximo..."
                        value={generatorRules}
                        onChange={(e) => setGeneratorRules(e.target.value)}
                        style={{ minHeight: 60, background: "var(--color-bg-primary)" }}
                    />
                </div>

                <button 
                    className="btn btn-secondary" 
                    onClick={applyGeneratedPrompt}
                    style={{ alignSelf: "flex-start", marginTop: "var(--space-2)" }}
                >
                    Generar Prompt con estas respuestas
                </button>
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
