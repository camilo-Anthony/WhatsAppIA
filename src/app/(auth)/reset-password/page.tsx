"use client"

import { useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import Logo from "@/components/Logo"
import styles from "../login/login.module.css"

function ResetPasswordForm() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const token = searchParams.get("token")

    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)

    if (!token) {
        return (
            <div className={styles.form}>
                <div className={styles.errorBanner}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM8.75 4.75v4.5a.75.75 0 01-1.5 0v-4.5a.75.75 0 011.5 0z" />
                    </svg>
                    Enlace inválido. Solicita uno nuevo desde la página de recuperación.
                </div>
            </div>
        )
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")

        if (password !== confirmPassword) {
            setError("Las contraseñas no coinciden")
            return
        }

        if (password.length < 6) {
            setError("La contraseña debe tener al menos 6 caracteres")
            return
        }

        setLoading(true)

        try {
            const response = await fetch("/api/auth/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, password }),
            })

            const data = await response.json()

            if (!response.ok) {
                setError(data.error || "Error al restablecer la contraseña")
                return
            }

            setSuccess(true)
            setTimeout(() => router.push("/login"), 2500)
        } catch {
            setError("Error al conectar con el servidor")
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            {!success ? (
                <form onSubmit={handleSubmit} className={styles.form}>
                    {error && (
                        <div className={styles.errorBanner}>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM8.75 4.75v4.5a.75.75 0 01-1.5 0v-4.5a.75.75 0 011.5 0z" />
                            </svg>
                            {error}
                        </div>
                    )}

                    <div className="input-group">
                        <label className="input-label" htmlFor="password">Nueva contraseña</label>
                        <input
                            id="password"
                            type="password"
                            className="input"
                            placeholder="Mínimo 6 caracteres"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                        />
                    </div>

                    <div className="input-group">
                        <label className="input-label" htmlFor="confirmPassword">Confirmar contraseña</label>
                        <input
                            id="confirmPassword"
                            type="password"
                            className="input"
                            placeholder="Repite la contraseña"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                        />
                    </div>

                    <button
                        type="submit"
                        className={`btn btn-primary btn-lg ${styles.submitBtn}`}
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <span className="spinner" />
                                Restableciendo...
                            </>
                        ) : (
                            "Restablecer contraseña"
                        )}
                    </button>
                </form>
            ) : (
                <div className={styles.form}>
                    <div className={styles.errorBanner} style={{ background: "rgba(34, 197, 94, 0.1)", color: "#22c55e", borderColor: "rgba(34, 197, 94, 0.3)" }}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                        </svg>
                        Contraseña actualizada. Redirigiendo al login...
                    </div>
                </div>
            )}
        </>
    )
}

export default function ResetPasswordPage() {
    return (
        <div className={styles.container}>
            <div className={styles.backgroundGlow} />
            <div className={styles.formWrapper}>
                <div className={styles.header}>
                    <div className={styles.logo}>
                        <Logo size={40} />
                        <span className={styles.logoText}>WhatsApp <span className="gradient-text">IA</span></span>
                    </div>
                    <h1 className={styles.title}>Nueva contraseña</h1>
                    <p className={styles.subtitle}>Ingresa tu nueva contraseña para acceder</p>
                </div>

                <Suspense fallback={<div className={styles.form}><span className="spinner" /></div>}>
                    <ResetPasswordForm />
                </Suspense>

                <p className={styles.footer}>
                    <Link href="/login">Volver al login</Link>
                </p>
            </div>
        </div>
    )
}
