"use client"

import { useState, useEffect, useCallback } from "react"
import styles from "../assistant.module.css"

interface InfoField {
    id?: string
    label: string
    content: string
    order: number
}

interface AssistantConfig {
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

export default function AssistantKnowledgePage() {
    const [config, setConfig] = useState<AssistantConfig>({
        infoMode: "SIMPLE",
        simpleInfo: "",
    })
    const [infoFields, setInfoFields] = useState<InfoField[]>(DEFAULT_FIELDS)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [loading, setLoading] = useState(true)

    const loadConfig = useCallback(async () => {
        try {
            const res = await fetch("/api/assistant/config")
            if (res.ok) {
                const data = await res.json()
                if (data.config) {
                    setConfig({
                        infoMode: data.config.infoMode,
                        simpleInfo: data.config.simpleInfo || "",
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
    }, [])

    useEffect(() => {
        loadConfig()
    }, [loadConfig])

    const handleSave = async () => {
        setSaving(true)
        setSaved(false)

        try {
            // To update infoMode and simpleInfo, we need to fetch the existing config first
            // to not overwrite behaviorPrompt and isActive
            const res = await fetch("/api/assistant/config")
            const data = await res.json()
            
            if (data.config) {
                await fetch("/api/assistant/config", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        ...data.config,
                        infoMode: config.infoMode,
                        simpleInfo: config.simpleInfo,
                    }),
                })
            }

            // Save info fields if in advanced mode
            if (config.infoMode === "ADVANCED") {
                await fetch("/api/assistant/info-fields", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ fields: infoFields }),
                })
            }

            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
        } catch (error) {
            console.error("Error saving:", error)
        } finally {
            setSaving(false)
        }
    }

    const addField = () => {
        setInfoFields((prev) => [
            ...prev,
            { label: "Nuevo campo", content: "", order: prev.length },
        ])
    }

    const removeField = (index: number) => {
        setInfoFields((prev) => prev.filter((_, i) => i !== index))
    }

    const updateField = (index: number, key: "label" | "content", value: string) => {
        setInfoFields((prev) =>
            prev.map((field, i) => (i === index ? { ...field, [key]: value } : field))
        )
    }

    if (loading) {
        return (
            <div className={styles.section}>
                <div className="skeleton" style={{ width: "100%", height: 300 }} />
            </div>
        )
    }

    return (
        <div className={styles.section}>
            <div className={styles.fieldsHeader}>
                <div className={styles.modeSelector} style={{ marginBottom: 0 }}>
                    <button
                        className={`${styles.modeBtn} ${config.infoMode === "SIMPLE" ? styles.modeBtnActive : ""}`}
                        onClick={() => setConfig((prev) => ({ ...prev, infoMode: "SIMPLE" }))}
                    >
                        Modo simple
                    </button>
                    <button
                        className={`${styles.modeBtn} ${config.infoMode === "ADVANCED" ? styles.modeBtnActive : ""}`}
                        onClick={() => setConfig((prev) => ({ ...prev, infoMode: "ADVANCED" }))}
                    >
                        Modo avanzado
                    </button>
                </div>
                <button
                    className="btn btn-primary btn-sm"
                    onClick={handleSave}
                    disabled={saving}
                >
                    {saving ? "Guardando..." : saved ? "✓ Guardado" : "Guardar cambios"}
                </button>
            </div>

            {config.infoMode === "SIMPLE" ? (
                <div style={{ marginTop: "var(--space-6)" }}>
                    <h2 className={styles.sectionTitle}>Información del negocio</h2>
                    <textarea
                        className="input textarea"
                        style={{ minHeight: 300 }}
                        value={config.simpleInfo}
                        onChange={(e) =>
                            setConfig((prev) => ({ ...prev, simpleInfo: e.target.value }))
                        }
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
