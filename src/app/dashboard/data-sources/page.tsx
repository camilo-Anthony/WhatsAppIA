"use client"

import { useState, useEffect, useCallback } from "react"
import styles from "./datasources.module.css"

interface DataSource {
    id: string
    name: string
    type: string
    isActive: boolean
    lastTest: string | null
    createdAt: string
}

export default function DataSourcesPage() {
    const [sources, setSources] = useState<DataSource[]>([])
    const [loading, setLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [newSource, setNewSource] = useState({
        name: "",
        type: "API",
        config: {
            url: "",
            method: "GET",
            headers: "",
        },
    })

    const loadSources = useCallback(async () => {
        try {
            const res = await fetch("/api/data-sources")
            if (res.ok) {
                const data = await res.json()
                setSources(data.sources || [])
            }
        } catch (error) {
            console.error("Error loading data sources:", error)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadSources()
    }, [loadSources])

    const createSource = async () => {
        try {
            const res = await fetch("/api/data-sources", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newSource),
            })
            if (res.ok) {
                setShowForm(false)
                setNewSource({ name: "", type: "API", config: { url: "", method: "GET", headers: "" } })
                await loadSources()
            }
        } catch (error) {
            console.error("Error creating data source:", error)
        }
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Datos Externos</h1>
                    <p className={styles.subtitle}>Conecta fuentes de datos para respuestas dinámicas</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
                    {showForm ? "Cancelar" : "+ Nueva fuente"}
                </button>
            </div>

            {showForm && (
                <div className={`card ${styles.formCard}`}>
                    <h2>Nueva fuente de datos</h2>
                    <div className={styles.formGrid}>
                        <div className="input-group">
                            <label className="input-label">Nombre</label>
                            <input
                                className="input"
                                value={newSource.name}
                                onChange={(e) => setNewSource((prev) => ({ ...prev, name: e.target.value }))}
                                placeholder="Ej: API de inventario"
                            />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Tipo</label>
                            <select
                                className="input"
                                value={newSource.type}
                                onChange={(e) => setNewSource((prev) => ({ ...prev, type: e.target.value }))}
                            >
                                <option value="API">API REST</option>
                                <option value="DATABASE">Base de datos</option>
                                <option value="ENDPOINT">Endpoint personalizado</option>
                            </select>
                        </div>
                        <div className="input-group">
                            <label className="input-label">URL del endpoint</label>
                            <input
                                className="input"
                                value={newSource.config.url}
                                onChange={(e) =>
                                    setNewSource((prev) => ({
                                        ...prev,
                                        config: { ...prev.config, url: e.target.value },
                                    }))
                                }
                                placeholder="https://api.example.com/data"
                            />
                        </div>
                    </div>
                    <div className={styles.formActions}>
                        <button className="btn btn-primary" onClick={createSource}>
                            Crear fuente
                        </button>
                    </div>
                </div>
            )}

            {loading ? (
                <div className={styles.grid}>
                    {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="card">
                            <div className="skeleton" style={{ width: "100%", height: 120 }} />
                        </div>
                    ))}
                </div>
            ) : sources.length === 0 && !showForm ? (
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>
                        <svg width="64" height="64" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--color-accent)" }}>
                            <path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z" />
                            <path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z" />
                            <path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z" />
                        </svg>
                    </div>
                    <h2>Sin fuentes de datos</h2>
                    <p>Conecta APIs o bases de datos externas para que tu asistente consulte información en tiempo real</p>
                    <button className="btn btn-primary btn-lg" onClick={() => setShowForm(true)}>
                        + Agregar fuente
                    </button>
                </div>
            ) : (
                <div className={styles.grid}>
                    {sources.map((source) => (
                        <div key={source.id} className={`card ${styles.sourceCard}`}>
                            <div className={styles.sourceHeader}>
                                <span className={styles.sourceName}>{source.name}</span>
                                <span className={`badge ${source.isActive ? "badge-success" : "badge-error"}`}>
                                    {source.isActive ? "Activo" : "Inactivo"}
                                </span>
                            </div>
                            <div className={styles.sourceType}>
                                <span className={`badge badge-info`}>{source.type}</span>
                            </div>
                            <div className={styles.sourceMeta}>
                                <span>Creado: {new Date(source.createdAt).toLocaleDateString("es")}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
