"use client"

import Link from "next/link"
import { ChevronLeft, Save, Check } from "lucide-react"
import { useState } from "react"
import styles from "../assistant.module.css"

import { use } from "react"

export default function SingleAssistantLayout({
    children,
    params,
}: {
    children: React.ReactNode
    params: Promise<{ id: string }>
}) {
    const resolvedParams = use(params)
    const [showSaveToast, setShowSaveToast] = useState(false)

    // Redirect away from "new" — creation now happens via modal in the list page
    if (resolvedParams.id === "new") {
        return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "var(--space-12)" }}>
                <p style={{ color: "var(--color-text-muted)" }}>Usa el boton &quot;Nuevo Agente&quot; en la lista de agentes para crear uno.</p>
                <Link href="/dashboard/assistant" className="btn btn-primary" style={{ marginTop: "var(--space-4)" }}>
                    <ChevronLeft size={16} /> Ir a Agentes
                </Link>
            </div>
        )
    }

    const handleSave = () => {
        window.dispatchEvent(new Event('save-assistant'))
        setShowSaveToast(true)
        setTimeout(() => setShowSaveToast(false), 2500)
    }
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <div className={styles.breadcrumbBar} style={{ padding: "var(--space-2) 0", borderBottom: "1px solid var(--color-border)", marginBottom: "var(--space-2)", position: "sticky", top: 0, zIndex: 100 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
                    <Link href="/dashboard/assistant" className={styles.breadcrumbLink} style={{ fontSize: "var(--font-size-xs)", gap: "4px" }}>
                        <ChevronLeft size={16} /> Volver
                    </Link>
                    <div style={{ width: "1px", height: "16px", background: "var(--color-border)" }}></div>
                    <div>
                        <h1 className={styles.labTitle} style={{ margin: 0, fontSize: "var(--font-size-sm)", fontWeight: 700, lineHeight: "1.2" }}>Estudio del Agente</h1>
                        <p className={styles.labSubtitle} style={{ margin: 0, fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", fontWeight: 400 }}>Configura el comportamiento de forma visual y prueba en tiempo real.</p>
                    </div>
                </div>

                <div className={styles.breadcrumbActions}>
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={handleSave}
                        style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "var(--font-size-xs)", padding: "4px 10px" }}
                    >
                        <Save size={14} /> Guardar cambios
                    </button>
                </div>
            </div>

            <div className={styles.pageContainer}>
                {children}
            </div>

            {/* Save Toast */}
            {showSaveToast && (
                <div className={styles.saveToast}>
                    <Check size={16} />
                    Cambios guardados
                </div>
            )}
        </div>
    )
}
