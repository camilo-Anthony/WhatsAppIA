"use client"

import { useState } from "react"
import Link from "next/link"
import Logo from "@/components/Logo"
import styles from "../login/login.module.css"

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [resetLink, setResetLink] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")
        setLoading(true)
        setResetLink(null)

        try {
            const response = await fetch("/api/auth/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            })

            const data = await response.json()

            if (!response.ok) {
                setError(data.error || "Error al procesar la solicitud")
                return
            }

            setSuccess(true)
            if (data.resetLink) {
                setResetLink(data.resetLink)
            }
        } catch {
            setError("Error al conectar con el servidor")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className={styles.container}>
            <div className={styles.backgroundGlow} />
            <div className={styles.formWrapper}>
                <div className={styles.header}>
                    <div className={styles.logo}>
                        <Logo size={40} />
                        <span className={styles.logoText}>WhatsApp <span className="gradient-text">IA</span></span>
                    </div>
                    <h1 className={styles.title}>Recuperar contraseña</h1>
                    <p className={styles.subtitle}>Te enviaremos un enlace para restablecerla</p>
                </div>

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
                            <label className="input-label" htmlFor="email">Email</label>
                            <input
                                id="email"
                                type="email"
                                className="input"
                                placeholder="tu@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoComplete="email"
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
                                    Enviando...
                                </>
                            ) : (
                                "Enviar enlace"
                            )}
                        </button>
                    </form>
                ) : (
                    <div className={styles.form}>
                        <div className={styles.errorBanner} style={{ background: "rgba(34, 197, 94, 0.1)", color: "#22c55e", borderColor: "rgba(34, 197, 94, 0.3)" }}>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                            </svg>
                            Si el email está registrado, recibirás un enlace de recuperación.
                        </div>

                        {resetLink && (
                            <div style={{ padding: "var(--space-4)", background: "rgba(59, 130, 246, 0.1)", border: "1px solid rgba(59, 130, 246, 0.3)", borderRadius: "var(--radius-md)", fontSize: "var(--font-size-sm)" }}>
                                <p style={{ fontWeight: 600, marginBottom: "var(--space-2)" }}>
                                    Modo desarrollo
                                </p>
                                <p style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-3)" }}>
                                    El email aún no está configurado. Usa este enlace para restablecer tu contraseña:
                                </p>
                                <a
                                    href={resetLink}
                                    className="btn btn-secondary"
                                    style={{ display: "block", textAlign: "center", wordBreak: "break-all" }}
                                >
                                    Restablecer contraseña
                                </a>
                            </div>
                        )}
                    </div>
                )}

                <p className={styles.footer}>
                    ¿Recordaste tu contraseña?{" "}
                    <Link href="/login">Iniciar sesión</Link>
                </p>
            </div>
        </div>
    )
}
