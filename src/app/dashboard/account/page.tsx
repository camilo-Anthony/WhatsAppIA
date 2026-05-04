"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { SessionProvider } from "next-auth/react"
import styles from "./account.module.css"

function AccountContent() {
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

    useEffect(() => {
        if (session?.user) {
            setFormData((prev) => ({
                ...prev,
                name: session.user.name || "",
            }))
        }
    }, [session])

    const handleSave = async () => {
        setSaving(true)
        setMessage("")

        try {
            // Update profile (name & company)
            const profileRes = await fetch("/api/user/profile", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formData.name,
                    company: formData.company,
                }),
            })

            if (!profileRes.ok) {
                const data = await profileRes.json()
                setMessage(data.error || "Error al guardar perfil")
                return
            }

            // Update password only if the user filled in the fields
            if (formData.currentPassword && formData.newPassword) {
                if (formData.newPassword !== formData.confirmPassword) {
                    setMessage("Las contraseñas no coinciden")
                    return
                }

                const pwRes = await fetch("/api/user/password", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        currentPassword: formData.currentPassword,
                        newPassword: formData.newPassword,
                    }),
                })

                if (!pwRes.ok) {
                    const data = await pwRes.json()
                    setMessage(data.error || "Error al cambiar contraseña")
                    return
                }

                // Clear password fields on success
                setFormData((prev) => ({
                    ...prev,
                    currentPassword: "",
                    newPassword: "",
                    confirmPassword: "",
                }))
            }

            setMessage("Configuración guardada")
            setTimeout(() => setMessage(""), 3000)
        } catch {
            setMessage("Error de conexión al guardar")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Cuenta</h1>
                <p className={styles.subtitle}>Gestiona tu información personal y seguridad</p>
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

export default function AccountPage() {
    return (
        <SessionProvider>
            <AccountContent />
        </SessionProvider>
    )
}
