"use client"

import { useState, useEffect, useCallback } from "react"
import styles from "./assistant.module.css"

interface InfoField {
    id?: string
    label: string
    content: string
    order: number
}

interface AssistantConfig {
    behaviorPrompt: string
    infoMode: "SIMPLE" | "ADVANCED"
    simpleInfo: string
    isActive: boolean
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

const DEFAULT_FIELDS: InfoField[] = [
    { label: "Información general", content: "", order: 0 },
    { label: "Servicios", content: "", order: 1 },
    { label: "Precios", content: "", order: 2 },
    { label: "Horarios", content: "", order: 3 },
    { label: "Políticas", content: "", order: 4 },
    { label: "Preguntas frecuentes", content: "", order: 5 },
]

export default function AssistantPage() {
    const [activeTab, setActiveTab] = useState<"behavior" | "info">("behavior")
    const [config, setConfig] = useState<AssistantConfig>({
        behaviorPrompt: BEHAVIOR_TEMPLATES[0].prompt,
        infoMode: "SIMPLE",
        simpleInfo: "",
        isActive: false,
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
                        behaviorPrompt: data.config.behaviorPrompt,
                        infoMode: data.config.infoMode,
                        simpleInfo: data.config.simpleInfo || "",
                        isActive: data.config.isActive,
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
            // Save config
            await fetch("/api/assistant/config", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config),
            })

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
            <div className={styles.container}>
                <div className={styles.header}>
                    <div className="skeleton" style={{ width: 300, height: 32 }} />
                    <div className="skeleton" style={{ width: 200, height: 20, marginTop: 8 }} />
                </div>
                <div className="skeleton" style={{ width: "100%", height: 400, marginTop: 24 }} />
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Configuración del Asistente</h1>
                    <p className={styles.subtitle}>Define cómo actúa tu IA y qué información conoce</p>
                </div>
                <div className={styles.headerActions}>
                    <div className={styles.activeToggle}>
                        <span className={styles.toggleLabel}>
                            {config.isActive ? "Activo" : "Inactivo"}
                        </span>
                        <button
                            className={`${styles.toggle} ${config.isActive ? styles.toggleOn : ""}`}
                            onClick={() => setConfig((prev) => ({ ...prev, isActive: !prev.isActive }))}
                        >
                            <span className={styles.toggleDot} />
                        </button>
                    </div>
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? (
                            <>
                                <span className="spinner" />
                                Guardando...
                            </>
                        ) : saved ? (
                            " Guardado"
                        ) : (
                            "Guardar cambios"
                        )}
                    </button>
                </div>
            </div>

            <div className={styles.tabs}>
                <button
                    className={`${styles.tab} ${activeTab === "behavior" ? styles.tabActive : ""}`}
                    onClick={() => setActiveTab("behavior")}
                >
                    Comportamiento
                </button>
                <button
                    className={`${styles.tab} ${activeTab === "info" ? styles.tabActive : ""}`}
                    onClick={() => setActiveTab("info")}
                >
                    Información
                </button>
            </div>

            {activeTab === "behavior" && (
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Plantillas de comportamiento</h2>
                    <div className={styles.templateGrid}>
                        {BEHAVIOR_TEMPLATES.map((template) => (
                            <button
                                key={template.name}
                                className={`card ${styles.templateCard} ${config.behaviorPrompt === template.prompt ? styles.templateActive : ""
                                    }`}
                                onClick={() =>
                                    setConfig((prev) => ({ ...prev, behaviorPrompt: template.prompt }))
                                }
                            >
                                <span className={styles.templateName}>{template.name}</span>
                            </button>
                        ))}
                    </div>

                    <h2 className={styles.sectionTitle}>Prompt personalizado</h2>
                    <textarea
                        className="input textarea"
                        style={{ minHeight: 200 }}
                        value={config.behaviorPrompt}
                        onChange={(e) =>
                            setConfig((prev) => ({ ...prev, behaviorPrompt: e.target.value }))
                        }
                        placeholder="Define cómo debe comportarse tu asistente..."
                    />
                    <p className={styles.hint}>
                        Este prompt define la personalidad y reglas de tu asistente. Sé específico sobre el tono, límites y comportamiento esperado.
                    </p>
                </div>
            )}

            {activeTab === "info" && (
                <div className={styles.section}>
                    <div className={styles.modeSelector}>
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

                    {config.infoMode === "SIMPLE" ? (
                        <div>
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
                        <div>
                            <div className={styles.fieldsHeader}>
                                <h2 className={styles.sectionTitle}>Campos de información</h2>
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
            )}
        </div>
    )
}
