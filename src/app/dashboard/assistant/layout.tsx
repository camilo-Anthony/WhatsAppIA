"use client"

import styles from "./assistant.module.css"

export default function AssistantLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className={styles.container}>
            <div className={styles.content}>
                {children}
            </div>
        </div>
    )
}
