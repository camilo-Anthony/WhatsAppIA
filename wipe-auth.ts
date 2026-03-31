import { PrismaClient } from "@prisma/client"
import fs from "fs"
import path from "path"
import { config } from "dotenv"

config({ path: ".env.local" })
config({ path: ".env" })

const prisma = new PrismaClient()

async function resetAllConnections() {
    console.log("🔥 [RESET] Borrando historial problemático...")

    // 1. Borramos DB
    const deletedMsgs = await prisma.message.deleteMany()
    const deletedConvs = await prisma.conversation.deleteMany()
    const deletedConnections = await prisma.whatsAppConnection.deleteMany()
    
    console.log(`✅ DB limpiada: ${deletedConnections.count} conexiones, ${deletedConvs.count} conversaciones, ${deletedMsgs.count} mensajes borrados.`)

    // 2. Borramos TODAS las carpetas de autenticación
    const authFolder = path.join(process.cwd(), ".whatsapp_auth")
    if (fs.existsSync(authFolder)) {
        fs.rmSync(authFolder, { recursive: true, force: true })
        console.log(`✅ Carpeta .whatsapp_auth eliminada por completo.`)
    } else {
        console.log(`✅ No existía carpeta .whatsapp_auth, nada que limpiar localmente.`)
    }

    console.log("🎉 Todo listo. Ya puedes iniciar un servidor limpio.")
    process.exit(0)
}

resetAllConnections().catch(console.error)
