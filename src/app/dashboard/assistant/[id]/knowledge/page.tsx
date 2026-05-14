"use client"

import { useState, useEffect, useCallback } from "react"
import styles from "../../assistant.module.css"

interface InfoField {
    id?: string
    label: string
    content: string
    order: number
}

interface AssistantConfig {
    id: string
    infoMode: "SIMPLE" | "ADVANCED"
    simpleInfo: string
}

const DEFAULT_FIELDS: InfoField[] = [
    { label: "Información general", content: "", order: 0 },
    { label: "Servicios", content: "", order: 1 },
    { label: "Precios", content: "", order: 2 },
    { label: "Horarios", content: "", order: 3 },
    { label: "Políticas", content: "", order: 4 },
    { label: "Preguntas frecuentes", content: "", order: 5 },
]

import { use } from "react"

export default function AssistantKnowledgePage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params)
    const [config, setConfig] = useState<AssistantConfig | null>(null)
    const [infoFields, setInfoFields] = useState<InfoField[]>(DEFAULT_FIELDS)
    const [loading, setLoading] = useState(true)

    const loadConfig = useCallback(async () => {
        if (resolvedParams.id === "new") {
            const draftStr = localStorage.getItem("assistant_draft")
            if (draftStr) {
                const draft = JSON.parse(draftStr)
                setConfig({
                    id: "new",
                    infoMode: (draft.infoMode as "SIMPLE" | "ADVANCED") || "SIMPLE",
                    simpleInfo: draft.simpleInfo || ""
                })
                if (draft.infoFields) {
                    setInfoFields(draft.infoFields)
                }
            } else {
                // Si no hay draft, creamos uno básico
                const initialDraft = {
                    id: "new",
                    name: "Nuevo Agente",
                    behaviorPrompt: "Eres un asistente virtual amable y profesional. Respondes de forma clara y concisa.",
                    infoMode: "SIMPLE" as const,
                    simpleInfo: ""
                }
                setConfig({
                    id: "new",
                    infoMode: "SIMPLE",
                    simpleInfo: ""
                })
                localStorage.setItem("assistant_draft", JSON.stringify(initialDraft))
            }
            setLoading(false)
            return
        }

        try {
            const res = await fetch(`/api/assistant/config/${resolvedParams.id}`)
            if (res.ok) {
                const data = await res.json()
                if (data.profile) {
                    setConfig({
                        id: data.profile.id,
                        infoMode: data.profile.infoMode,
                        simpleInfo: data.profile.simpleInfo || "",
                    })
                }
                if (data.infoFields?.length > 0) {
                    setInfoFields(data.infoFields)
                }
            }
        } catch (error) {
            console.error("Error loading config:", error)
        } finally {
            setLoading(false)
        }
    }, [resolvedParams.id])

    useEffect(() => {
        loadConfig()
    }, [loadConfig])

    // Sincronizar cambios en el config (infoMode, simpleInfo) al draft
    const updateConfigAndDraft = (updates: Partial<AssistantConfig>) => {
        setConfig((prev) => {
            if (!prev) return null
            const updated = { ...prev, ...updates }
            if (resolvedParams.id === "new") {
                const draftStr = localStorage.getItem("assistant_draft")
                const draft = draftStr ? JSON.parse(draftStr) : {}
                localStorage.setItem("assistant_draft", JSON.stringify({
                    ...draft,
                    infoMode: updated.infoMode,
                    simpleInfo: updated.simpleInfo
                }))
            }
            return updated
        })
    }

    // Sincronizar cambios en los campos al draft
    const syncFieldsToDraft = (fields: InfoField[]) => {
        if (resolvedParams.id === "new") {
            const draftStr = localStorage.getItem("assistant_draft")
            const draft = draftStr ? JSON.parse(draftStr) : {}
            localStorage.setItem("assistant_draft", JSON.stringify({
                ...draft,
                infoFields: fields
            }))
        }
    }

    const handleSave = useCallback(async () => {
        if (!config || resolvedParams.id === "new") return

        try {
            await fetch(`/api/assistant/config/${resolvedParams.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    infoMode: config.infoMode,
                    simpleInfo: config.simpleInfo,
                }),
            })

            // Save info fields if in advanced mode
            if (config.infoMode === "ADVANCED") {
                await fetch("/api/assistant/info-fields", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        fields: infoFields,
                        assistantConfigId: resolvedParams.id,
                    }),
                })
            }
        } catch (error) {
            console.error("Error saving:", error)
        }
    }, [config, infoFields, resolvedParams.id])

    useEffect(() => {
        const handler = handleSave as EventListener
        window.addEventListener('save-assistant', handler)
        return () => window.removeEventListener('save-assistant', handler)
    }, [handleSave])

    const addField = () => {
        setInfoFields((prev) => {
            const updated = [
                ...prev,
                { label: "Nuevo campo", content: "", order: prev.length },
            ]
            syncFieldsToDraft(updated)
            return updated
        })
    }

    const removeField = (index: number) => {
        setInfoFields((prev) => {
            const updated = prev.filter((_, i) => i !== index)
            syncFieldsToDraft(updated)
            return updated
        })
    }

    const updateField = (index: number, key: "label" | "content", value: string) => {
        setInfoFields((prev) => {
            const updated = prev.map((field, i) => (i === index ? { ...field, [key]: value } : field))
            syncFieldsToDraft(updated)
            return updated
        })
    }

    if (loading || !config) {
        return (
            <div className={styles.section}>
                <div className="skeleton" style={{ width: "100%", height: 300 }} />
            </div>
        )
    }

    return (
        <div className={styles.section}>
            <div className={styles.modeSelector} style={{ marginBottom: "var(--space-6)" }}>
                <button
                    className={`${styles.modeBtn} ${config.infoMode === "SIMPLE" ? styles.modeBtnActive : ""}`}
                    onClick={() => updateConfigAndDraft({ infoMode: "SIMPLE" })}
                >
                    Modo simple
                </button>
                <button
                    className={`${styles.modeBtn} ${config.infoMode === "ADVANCED" ? styles.modeBtnActive : ""}`}
                    onClick={() => updateConfigAndDraft({ infoMode: "ADVANCED" })}
                >
                    Modo avanzado
                </button>
            </div>

            {config.infoMode === "SIMPLE" ? (
                <div style={{ marginTop: "var(--space-6)" }}>
                    <h2 className={styles.sectionTitle}>Información del negocio</h2>
                    <textarea
                        className="input textarea"
                        style={{ minHeight: 300 }}
                        value={config.simpleInfo}
                        onChange={(e) => updateConfigAndDraft({ simpleInfo: e.target.value })}
                        placeholder="Escribe toda la información que tu asistente debe conocer: servicios, precios, horarios, políticas, preguntas frecuentes..."
                    />
                    <p className={styles.hint}>
                        Escribe toda la información en un solo bloque. La IA usará esta información para responder.
                    </p>
                </div>
            ) : (
                <div style={{ marginTop: "var(--space-6)" }}>
                    <div className={styles.fieldsHeader}>
                        <h2 className={styles.sectionTitle} style={{ marginTop: 0 }}>Campos de información</h2>
                        <button className="btn btn-secondary btn-sm" onClick={addField}>
                            + Agregar campo
                        </button>
                    </div>
                    <div className={styles.fieldsList}>
                        {infoFields.map((field, index) => (
                            <div key={index} className={`card ${styles.fieldCard}`}>
                                <div className={styles.fieldHeader}>
                                    <input
                                        className={`input ${styles.fieldLabel}`}
                                        value={field.label}
                                        onChange={(e) => updateField(index, "label", e.target.value)}
                                        placeholder="Nombre del campo"
                                    />
                                    <button
                                        className="btn btn-ghost btn-icon"
                                        onClick={() => removeField(index)}
                                        title="Eliminar campo"
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
                                        </svg>
                                    </button>
                                </div>
                                <textarea
                                    className="input textarea"
                                    value={field.content}
                                    onChange={(e) => updateField(index, "content", e.target.value)}
                                    placeholder={`Contenido de ${field.label}...`}
                                    style={{ minHeight: 100 }}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
