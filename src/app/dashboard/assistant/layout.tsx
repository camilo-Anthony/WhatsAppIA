"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import styles from "./assistant.module.css"

export default function AssistantLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname()
    const [isActive, setIsActive] = useState(false)
    const [loading, setLoading] = useState(true)

    const loadConfig = useCallback(async () => {
        try {
            const res = await fetch("/api/assistant/config")
            if (res.ok) {
                const data = await res.json()
                if (data.config) {
                    setIsActive(data.config.isActive)
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

    const tabs = [
        { name: "Comportamiento", href: "/dashboard/assistant", exact: true },
        { name: "Conocimiento", href: "/dashboard/assistant/knowledge", exact: true },
        { name: "Herramientas", href: "/dashboard/assistant/tools", exact: true },
    ]

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Configuración del Asistente</h1>
                    <p className={styles.subtitle}>Define cómo actúa tu IA y qué sabe hacer</p>
                </div>
                <div className={styles.headerActions}>
                    {!loading && (
                        <span className={`badge ${isActive ? "badge-success" : "badge-error"}`}>
                            {isActive ? "Asistente Activo" : "Asistente Inactivo"}
                        </span>
                    )}
                </div>
            </div>

            <div className={styles.tabs}>
                {tabs.map((tab) => {
                    const isTabActive = tab.exact 
                        ? pathname === tab.href 
                        : pathname.startsWith(tab.href)
                    
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            className={`${styles.tab} ${isTabActive ? styles.tabActive : ""}`}
                        >
                            {tab.name}
                        </Link>
                    )
                })}
            </div>

            <div className={styles.content}>
                {children}
            </div>
        </div>
    )
}
