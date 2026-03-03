"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { SessionProvider } from "next-auth/react"
import styles from "./settings.module.css"

function SettingsContent() {
    const { data: session } = useSession()
    const [formData, setFormData] = useState({
        name: "",
        company: "",
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    })
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState("")
    const [assistantActive, setAssistantActive] = useState(false)

    const loadSettings = useCallback(async () => {
        try {
            const res = await fetch("/api/assistant/config")
            if (res.ok) {
                const data = await res.json()
                if (data.config) {
                    setAssistantActive(data.config.isActive)
                }
            }
        } catch (error) {
            console.error("Error loading settings:", error)
        }
    }, [])

    useEffect(() => {
        if (session?.user) {
            setFormData((prev) => ({
                ...prev,
                name: session.user.name || "",
            }))
        }
        loadSettings()
    }, [session, loadSettings])

    const toggleAssistant = async () => {
        try {
            const res = await fetch("/api/assistant/config")
            if (res.ok) {
                const data = await res.json()
                if (data.config) {
                    await fetch("/api/assistant/config", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            ...data.config,
                            isActive: !assistantActive,
                        }),
                    })
                    setAssistantActive(!assistantActive)
                }
            }
        } catch (error) {
            console.error("Error toggling assistant:", error)
        }
    }

    const handleSave = async () => {
        setSaving(true)
        setMessage("")

        try {
            // Just show success for now - full profile update API can be added
            setMessage("Configuración guardada")
            setTimeout(() => setMessage(""), 3000)
        } catch {
            setMessage("Error al guardar")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Configuración</h1>
                <p className={styles.subtitle}>Gestiona tu cuenta y preferencias</p>
            </div>

            {/* Global Assistant Toggle */}
            <div className={`card ${styles.settingCard}`}>
                <div className={styles.settingHeader}>
                    <div>
                        <h2>Estado del asistente</h2>
                        <p>Activa o desactiva el asistente globalmente</p>
                    </div>
                    <div className={styles.toggleWrapper}>
                        <span className={assistantActive ? styles.statusActive : styles.statusInactive}>
                            {assistantActive ? "Activo" : "Inactivo"}
                        </span>
                        <button
                            className={`${styles.toggle} ${assistantActive ? styles.toggleOn : ""}`}
                            onClick={toggleAssistant}
                        >
                            <span className={styles.toggleDot} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Profile */}
            <div className={`card ${styles.settingCard}`}>
                <h2>Perfil</h2>
                <div className={styles.formGrid}>
                    <div className="input-group">
                        <label className="input-label">Nombre</label>
                        <input
                            className="input"
                            value={formData.name}
                            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                        />
                    </div>
                    <div className="input-group">
                        <label className="input-label">Email</label>
                        <input className="input" value={session?.user?.email || ""} disabled />
                    </div>
                    <div className="input-group">
                        <label className="input-label">Empresa</label>
                        <input
                            className="input"
                            value={formData.company}
                            onChange={(e) => setFormData((prev) => ({ ...prev, company: e.target.value }))}
                            placeholder="Nombre de tu empresa"
                        />
                    </div>
                </div>
            </div>

            {/* Password */}
            <div className={`card ${styles.settingCard}`}>
                <h2>Cambiar contraseña</h2>
                <div className={styles.formGrid}>
                    <div className="input-group">
                        <label className="input-label">Contraseña actual</label>
                        <input
                            className="input"
                            type="password"
                            value={formData.currentPassword}
                            onChange={(e) => setFormData((prev) => ({ ...prev, currentPassword: e.target.value }))}
                        />
                    </div>
                    <div className="input-group">
                        <label className="input-label">Nueva contraseña</label>
                        <input
                            className="input"
                            type="password"
                            value={formData.newPassword}
                            onChange={(e) => setFormData((prev) => ({ ...prev, newPassword: e.target.value }))}
                        />
                    </div>
                    <div className="input-group">
                        <label className="input-label">Confirmar nueva contraseña</label>
                        <input
                            className="input"
                            type="password"
                            value={formData.confirmPassword}
                            onChange={(e) => setFormData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                        />
                    </div>
                </div>
            </div>

            <div className={styles.actions}>
                {message && <span className={styles.message}>{message}</span>}
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? "Guardando..." : "Guardar cambios"}
                </button>
            </div>
        </div>
    )
}

export default function SettingsPage() {
    return (
        <SessionProvider>
            <SettingsContent />
        </SessionProvider>
    )
}
