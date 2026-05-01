import { PrismaClient } from "@prisma/client";
import IORedis from "ioredis";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

const redisUrl = process.env.UPSTASH_REDIS_URL || "redis://localhost:6379";
const redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });

async function main() {
    console.log("🧹 Iniciando limpieza TOTAL de la base de datos...");

    try {
        console.log("- Eliminando ToolExecutions...");
        await prisma.toolExecution.deleteMany();
        
        console.log("- Eliminando Mensajes...");
        await prisma.message.deleteMany();
        
        console.log("- Eliminando Conversaciones...");
        await prisma.conversation.deleteMany();
        
        console.log("- Eliminando Conexiones WABA...");
        await prisma.whatsAppConnection.deleteMany();

        console.log("- Eliminando InfoFields...");
        await prisma.infoField.deleteMany();
        
        console.log("- Eliminando Configuraciones de Bot...");
        await prisma.assistantConfig.deleteMany();

        console.log("- Eliminando Integraciones...");
        await prisma.integration.deleteMany();

        console.log("- Eliminando Cuentas (Integraciones)...");
        await prisma.integrationAccount.deleteMany();

        console.log("- Eliminando Usuarios...");
        await prisma.user.deleteMany();

        console.log("✅ Base de datos relacional limpia.");

        console.log("🧹 Limpiando caché en Redis...");
        await redis.flushdb();
        console.log("✅ Caché de Redis limpia.");

    } catch (e) {
        console.error("❌ Error durante la limpieza:", e);
    } finally {
        await prisma.$disconnect();
        redis.disconnect();
    }
}

main();
