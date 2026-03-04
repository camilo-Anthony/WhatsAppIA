"use client"

import { useSession } from "next-auth/react"
import styles from "./overview.module.css"

export default function DashboardPage() {
    const { data: session } = useSession()

    const stats = [
        {
            label: "Conexiones activas",
            value: "0",
            icon: (
                <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
            ),
            color: "var(--color-primary)",
            bgColor: "var(--color-primary-light)",
        },
        {
            label: "Mensajes hoy",
            value: "0",
            icon: (
                <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                </svg>
            ),
            color: "var(--color-primary)",
            bgColor: "var(--color-primary-light)",
        },
        {
            label: "Conversaciones",
            value: "0",
            icon: (
                <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
                </svg>
            ),
            color: "var(--color-primary)",
            bgColor: "var(--color-primary-light)",
        },
        {
            label: "Estado",
            value: "Inactivo",
            icon: (
                <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
            ),
            color: "var(--color-primary)",
            bgColor: "var(--color-primary-light)",
        },
    ]

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>
                        Hola, {session?.user?.name || "Usuario"}
                    </h1>
                    <p className={styles.subtitle}>
                        Aquí tienes un resumen de tu asistente de WhatsApp
                    </p>
                </div>
            </div>

            <div className={styles.statsGrid}>
                {stats.map((stat) => (
                    <div key={stat.label} className={`card ${styles.statCard}`}>
                        <div
                            className={styles.statIcon}
                            style={{ backgroundColor: stat.bgColor, color: stat.color }}
                        >
                            {stat.icon}
                        </div>
                        <div className={styles.statInfo}>
                            <span className={styles.statValue}>{stat.value}</span>
                            <span className={styles.statLabel}>{stat.label}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className={styles.quickActions}>
                <h2 className={styles.sectionTitle}>Primeros pasos</h2>
                <div className={styles.actionsGrid}>
                    <a href="/dashboard/connections" className={`card card-interactive ${styles.actionCard}`}>
                        <div className={styles.actionNumber}>1</div>
                        <h3>Conectar WhatsApp</h3>
                        <p>Vincula tu número de WhatsApp escaneando un código QR</p>
                    </a>
                    <a href="/dashboard/assistant" className={`card card-interactive ${styles.actionCard}`}>
                        <div className={styles.actionNumber}>2</div>
                        <h3>Configurar asistente</h3>
                        <p>Define cómo se comporta tu IA y qué información conoce</p>
                    </a>
                    <a href="/dashboard/conversations" className={`card card-interactive ${styles.actionCard}`}>
                        <div className={styles.actionNumber}>3</div>
                        <h3>Ver conversaciones</h3>
                        <p>Revisa el historial de mensajes con tus clientes</p>
                    </a>
                </div>
            </div>
        </div>
    )
}
