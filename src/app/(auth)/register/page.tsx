"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Logo from "@/components/Logo"
import styles from "../login/login.module.css"

export default function RegisterPage() {
    const router = useRouter()
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
        company: "",
    })
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")

        if (formData.password !== formData.confirmPassword) {
            setError("Las contraseñas no coinciden")
            return
        }

        if (formData.password.length < 6) {
            setError("La contraseña debe tener al menos 6 caracteres")
            return
        }

        setLoading(true)

        try {
            const response = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formData.name,
                    email: formData.email,
                    password: formData.password,
                    company: formData.company || undefined,
                }),
            })

            const data = await response.json()

            if (!response.ok) {
                setError(data.error || "Error al crear la cuenta")
                return
            }

            router.push("/login?registered=true")
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
                    <h1 className={styles.title}>Crear cuenta</h1>
                    <p className={styles.subtitle}>Configura tu asistente de WhatsApp con IA</p>
                </div>

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
                        <label className="input-label" htmlFor="name">Nombre</label>
                        <input
                            id="name"
                            name="name"
                            type="text"
                            className="input"
                            placeholder="Tu nombre"
                            value={formData.name}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label className="input-label" htmlFor="email">Email</label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            className="input"
                            placeholder="tu@email.com"
                            value={formData.email}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label className="input-label" htmlFor="company">Empresa (opcional)</label>
                        <input
                            id="company"
                            name="company"
                            type="text"
                            className="input"
                            placeholder="Nombre de tu empresa"
                            value={formData.company}
                            onChange={handleChange}
                        />
                    </div>

                    <div className="input-group">
                        <label className="input-label" htmlFor="password">Contraseña</label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            className="input"
                            placeholder="Mínimo 6 caracteres"
                            value={formData.password}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label className="input-label" htmlFor="confirmPassword">Confirmar contraseña</label>
                        <input
                            id="confirmPassword"
                            name="confirmPassword"
                            type="password"
                            className="input"
                            placeholder="Repite tu contraseña"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            required
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
                                Creando cuenta...
                            </>
                        ) : (
                            "Crear cuenta"
                        )}
                    </button>
                </form>

                <p className={styles.footer}>
                    ¿Ya tienes cuenta?{" "}
                    <Link href="/login">Iniciar sesión</Link>
                </p>
            </div>
        </div>
    )
}
