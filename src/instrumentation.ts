/**
 * Next.js Instrumentation — Se ejecuta UNA VEZ al arrancar el servidor.
 *
 * Aquí inicializamos los workers de cola y restauramos conexiones WhatsApp
 * para que en producción no dependamos de que alguien visite el dashboard.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
    // Solo ejecutar en el runtime de Node.js (no en Edge)
    if (process.env.NEXT_RUNTIME === "nodejs") {
        console.log("[Instrumentation] Iniciando servidor — inicializando workers y conexiones...")

        try {
            const { whatsappManager } = await import("@/lib/whatsapp/manager")
            await whatsappManager.initAllActiveConnections()
            console.log("[Instrumentation] Workers + conexiones inicializados correctamente")
        } catch (error) {
            console.error("[Instrumentation] Error en inicialización:", error)
        }
    }
}
