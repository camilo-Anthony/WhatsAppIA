"use client"

import Link from "next/link"
import { ChevronLeft } from "lucide-react"

import { use } from "react"

export default function SingleAssistantLayout({
    children,
    params,
}: {
    children: React.ReactNode
    params: Promise<{ id: string }>
}) {
    const resolvedParams = use(params)

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

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {children}
        </div>
    )
}
