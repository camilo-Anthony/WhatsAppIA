"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronLeft, Plus, Save } from "lucide-react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
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
    const pathname = usePathname()
    const router = useRouter()
    const [profileName, setProfileName] = useState<string>("Cargando...")
    const [loading, setLoading] = useState(true)
    const [isCreating, setIsCreating] = useState(false)

    useEffect(() => {
        if (resolvedParams.id === "new") {
            setProfileName("Nuevo Agente")
            setLoading(false)
            
            // Escuchar cambios en localStorage para actualizar el nombre en tiempo real
            const updateNameFromDraft = () => {
                const draft = localStorage.getItem("assistant_draft")
                if (draft) {
                    const data = JSON.parse(draft)
                    if (data.name) setProfileName(data.name)
                }
            }
            
            updateNameFromDraft()
            window.addEventListener('storage', updateNameFromDraft)
            return () => window.removeEventListener('storage', updateNameFromDraft)
        }

        const fetchProfile = async () => {
            try {
                const res = await fetch(`/api/assistant/config/${resolvedParams.id}`)
                if (res.ok) {
                    const data = await res.json()
                    setProfileName(data.profile.name)
                }
            } catch (error) {
                console.error("Error loading profile info:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchProfile()
    }, [resolvedParams.id])

    const handleCreateFinal = async () => {
        const draftStr = localStorage.getItem("assistant_draft")
        if (!draftStr) return

        const draft = JSON.parse(draftStr)
        setIsCreating(true)

        try {
            // 1. Crear el perfil base
            const res = await fetch("/api/assistant/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: draft.name,
                    behaviorPrompt: draft.behaviorPrompt,
                    infoMode: draft.infoMode,
                    simpleInfo: draft.simpleInfo,
                }),
            })

            if (res.ok) {
                const data = await res.json()
                const newId = data.profile.id

                // 2. Si hay infoFields en el draft, guardarlos
                if (draft.infoFields && draft.infoFields.length > 0) {
                    await fetch("/api/assistant/info-fields", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ fields: draft.infoFields }),
                    })
                }

                // 3. Limpiar draft y redirigir
                localStorage.removeItem("assistant_draft")
                router.push(`/dashboard/assistant/${newId}`)
                router.refresh()
            }
        } catch (error) {
            console.error("Error creating assistant:", error)
        } finally {
            setIsCreating(false)
        }
    }

    const tabs = [
        { name: "Comportamiento", href: `/dashboard/assistant/${resolvedParams.id}`, exact: true },
        { name: "Conocimiento", href: `/dashboard/assistant/${resolvedParams.id}/knowledge`, exact: true },
        { name: "Herramientas", href: `/dashboard/assistant/${resolvedParams.id}/tools`, exact: true },
    ]

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <div className={styles.breadcrumbBar}>
                <Link href="/dashboard/assistant" className={styles.breadcrumbLink}>
                    <ChevronLeft size={16} /> Volver a Agentes
                </Link>

                <div className={styles.breadcrumbActions}>
                    {resolvedParams.id === "new" ? (
                        <button 
                            className="btn btn-primary btn-sm"
                            onClick={handleCreateFinal}
                            disabled={isCreating}
                        >
                            <Plus size={16} /> {isCreating ? "Creando..." : "Crear Agente"}
                        </button>
                    ) : (
                        <button 
                            className="btn btn-primary btn-sm"
                            onClick={() => window.dispatchEvent(new Event('save-assistant'))}
                        >
                            <Save size={16} /> Guardar cambios
                        </button>
                    )}
                </div>
            </div>

            <div className={styles.labHeader}>
                <h1 className={styles.labTitle}>Entrenamiento y Configuración</h1>
                <p className={styles.labSubtitle}>Personaliza la identidad, el conocimiento y las capacidades de tu agente.</p>
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

            <div className={styles.pageContainer}>
                {children}
            </div>
        </div>
    )
}
