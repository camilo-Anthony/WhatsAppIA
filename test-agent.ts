import * as dotenv from "dotenv";
dotenv.config();

import { prisma } from "./src/lib/db";
import { agentPipeline } from "./src/lib/ai/agent/agent-pipeline";

async function main() {
    const connection = await prisma.whatsAppConnection.findFirst();
    if (!connection) {
        console.log("No hay conexión WABA en la BD. Por favor corre seed-calendar.ts primero.");
        return;
    }

    const userId = connection.userId;
    const messageContent = "Quiero hacer una reservación";
    
    console.log(`Simulando mensaje: "${messageContent}"...`);
    try {
        const result = await agentPipeline({
            userId,
            connectionId: connection.id,
            conversationId: "test-conv-123",
            clientPhone: "1234567890",
            messageContent,
        });

        console.log("Resultado:", result);
        if (result.steps) {
            console.log("Pasos ejecutados:");
            for (const step of result.steps) {
                console.log(`- [${step.type}] ${step.content}`);
            }
        }
    } catch (e) {
        console.error("Error no capturado:", e);
    }
}

main().finally(() => prisma.$disconnect());
