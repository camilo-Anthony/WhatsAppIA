"use client"

import { useState, useEffect, useCallback } from "react"
import styles from "./assistant.module.css"

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

export default function AssistantBehaviorPage() {
    const [config, setConfig] = useState<AssistantConfig | null>(null)
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
        if (!config) return
        setSaving(true)
        setSaved(false)

        try {
            await fetch("/api/assistant/config", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config),
            })
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
        } catch (error) {
            console.error("Error saving:", error)
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className={styles.section}>
                <div className="skeleton" style={{ width: "100%", height: 200 }} />
            </div>
        )
    }

    if (!config) return null

    return (
        <div className={styles.section}>
            <div className={styles.fieldsHeader}>
                <h2 className={styles.sectionTitle} style={{ marginTop: 0 }}>Plantillas de comportamiento</h2>
                <button
                    className="btn btn-primary btn-sm"
                    onClick={handleSave}
                    disabled={saving}
                >
                    {saving ? "Guardando..." : saved ? "✓ Guardado" : "Guardar cambios"}
                </button>
            </div>
            
            <div className={styles.templateGrid}>
                {BEHAVIOR_TEMPLATES.map((template) => (
                    <button
                        key={template.name}
                        className={`card ${styles.templateCard} ${config.behaviorPrompt === template.prompt ? styles.templateActive : ""
                            }`}
                        onClick={() =>
                            setConfig((prev) => prev ? { ...prev, behaviorPrompt: template.prompt } : null)
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
                    setConfig((prev) => prev ? { ...prev, behaviorPrompt: e.target.value } : null)
                }
                placeholder="Define cómo debe comportarse tu asistente..."
            />
            <p className={styles.hint}>
                Este prompt define la personalidad y reglas de tu asistente. Sé específico sobre el tono, límites y comportamiento esperado.
            </p>
        </div>
    )
}
