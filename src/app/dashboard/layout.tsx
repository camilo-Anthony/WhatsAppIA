"use client"

import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { signOut, useSession } from "next-auth/react"
import Link from "next/link"
import { SessionProvider } from "next-auth/react"
import { 
    LayoutDashboard, 
    Link2, 
    Bot, 
    MessageSquare, 
    Cpu, 
    Settings,
    LogOut,
    Menu,
    X
} from "lucide-react"
import Logo from "@/components/Logo"
import styles from "./dashboard.module.css"

const navGroups = [
    {
        title: "PANEL",
        items: [
            {
                label: "Panel",
                href: "/dashboard",
                icon: <LayoutDashboard size={20} />,
                exact: true,
            },
        ],
    },
    {
        title: "AGENTE",
        items: [
            {
                label: "Conexiones",
                href: "/dashboard/connections",
                icon: <Link2 size={20} />,
            },
            {
                label: "Laboratorio IA",
                href: "/dashboard/assistant",
                icon: <Bot size={20} />,
                exact: false,
            },
            {
                label: "Integraciones",
                href: "/dashboard/integrations",
                icon: <Cpu size={20} />,
            },
        ],
    },
    {
        title: "MONITOR",
        items: [
            {
                label: "Conversaciones",
                href: "/dashboard/conversations",
                icon: <MessageSquare size={20} />,
            },
        ],
    },
    {
        title: "CUENTA",
        items: [
            {
                label: "Cuenta",
                href: "/dashboard/account",
                icon: <Settings size={20} />,
            },
        ],
    },
]

function DashboardContent({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const { data: session } = useSession()
    const [sidebarOpen, setSidebarOpen] = useState(false)

    // Close sidebar on route change
    useEffect(() => {
        setSidebarOpen(false)
    }, [pathname])

    return (
        <div className={styles.layout}>
            {/* Mobile hamburger */}
            <button
                className={styles.menuToggle}
                onClick={() => setSidebarOpen(!sidebarOpen)}
                aria-label="Toggle menu"
            >
                {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Overlay */}
            {sidebarOpen && (
                <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />
            )}

            <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
                <div className={styles.sidebarHeader}>
                    <Link href="/dashboard" className={styles.sidebarLogo}>
                        <Logo size={32} />
                        <span className={styles.sidebarLogoText}>WhatsApp IA</span>
                    </Link>
                </div>

                <nav className={styles.nav}>
                    {navGroups.map((group) => (
                        <div key={group.title} className={styles.navGroup}>
                            <h3 className={styles.navSection}>{group.title}</h3>
                            {group.items.map((item) => {
                                const isActive = item.exact 
                                    ? pathname === item.href 
                                    : pathname.startsWith(item.href)
                                    
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                                    >
                                        {item.icon}
                                        <span>{item.label}</span>
                                    </Link>
                                )
                            })}
                        </div>
                    ))}
                </nav>

                <div className={styles.sidebarFooter}>
                    <div className={styles.userInfo}>
                        <div className={styles.userAvatar}>
                            {session?.user?.name?.[0]?.toUpperCase() || "U"}
                        </div>
                        <div className={styles.userDetails}>
                            <span className={styles.userName}>{session?.user?.name || "Usuario"}</span>
                            <span className={styles.userEmail}>{session?.user?.email || ""}</span>
                        </div>
                    </div>
                    <button
                        className={`btn btn-ghost btn-sm ${styles.logoutBtn}`}
                        onClick={() => signOut({ callbackUrl: "/login" })}
                        title="Cerrar sesión"
                    >
                        <LogOut size={18} />
                    </button>
                </div>
            </aside>

            <main className={styles.main}>
                <div className={styles.workspace}>
                    {children}
                </div>
            </main>
        </div>
    )
}

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <SessionProvider>
            <DashboardContent>{children}</DashboardContent>
        </SessionProvider>
    )
}
