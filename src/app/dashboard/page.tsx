import { 
    Activity, 
    MessageCircle, 
    Users, 
    Zap,
    ArrowRight
} from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import styles from "./overview.module.css"

export default async function DashboardPage() {
    const session = await auth()
    const userId = session?.user?.id

    let activeConnectionsCount = 0
    let messagesTodayCount = 0
    let conversationsCount = 0

    if (userId) {
        // Fetch connections
        activeConnectionsCount = await prisma.whatsAppConnection.count({
            where: { userId, status: "CONNECTED" },
        })

        // Fetch conversations
        conversationsCount = await prisma.conversation.count({
            where: { userId },
        })

        // Fetch messages today
        const startOfDay = new Date()
        startOfDay.setHours(0, 0, 0, 0)
        
        messagesTodayCount = await prisma.message.count({
            where: {
                conversation: { userId },
                timestamp: { gte: startOfDay },
            },
        })
    }

    const stats = [
        {
            label: "Conexiones activas",
            value: activeConnectionsCount.toString(),
            icon: <Activity size={24} />,
            color: "var(--color-primary)",
            bgColor: "rgba(var(--color-primary-rgb), 0.1)",
        },
        {
            label: "Mensajes hoy",
            value: messagesTodayCount.toString(),
            icon: <MessageCircle size={24} />,
            color: "var(--color-primary)",
            bgColor: "rgba(var(--color-primary-rgb), 0.1)",
        },
        {
            label: "Conversaciones",
            value: conversationsCount.toString(),
            icon: <Users size={24} />,
            color: "var(--color-primary)",
            bgColor: "rgba(var(--color-primary-rgb), 0.1)",
        },
        {
            label: "Estado",
            value: activeConnectionsCount > 0 ? "Activo" : "Inactivo",
            icon: <Zap size={24} />,
            color: activeConnectionsCount > 0 ? "var(--color-success)" : "var(--color-error)",
            bgColor: activeConnectionsCount > 0 ? "rgba(var(--color-success-rgb), 0.1)" : "rgba(var(--color-error-rgb), 0.1)",
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
                        <h3>Comportamiento</h3>
                        <p>Define el prompt y la personalidad de tu asistente</p>
                    </a>
                    <a href="/dashboard/assistant/knowledge" className={`card card-interactive ${styles.actionCard}`}>
                        <div className={styles.actionNumber}>3</div>
                        <h3>Información</h3>
                        <p>Agrega los datos del negocio que el bot usará para responder</p>
                    </a>
                </div>
            </div>
        </div>
    )
}
