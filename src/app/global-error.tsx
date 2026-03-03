"use client"

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    return (
        <html lang="es">
            <body>
                <div style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "100vh",
                    fontFamily: "system-ui, sans-serif",
                    background: "#000",
                    color: "#fff",
                    padding: "2rem",
                    textAlign: "center",
                }}>
                    <h2 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
                        Algo salió mal
                    </h2>
                    <p style={{ color: "#888", marginBottom: "2rem" }}>
                        {error.message || "Error inesperado"}
                    </p>
                    <button
                        onClick={() => reset()}
                        style={{
                            padding: "0.75rem 1.5rem",
                            background: "#25D366",
                            color: "#000",
                            border: "none",
                            borderRadius: "8px",
                            cursor: "pointer",
                            fontWeight: 600,
                        }}
                    >
                        Intentar de nuevo
                    </button>
                </div>
            </body>
        </html>
    )
}
