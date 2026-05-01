import { prisma } from "./src/lib/db";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
    const lastMessages = await prisma.message.findMany({
        orderBy: { timestamp: "desc" },
        take: 10,
    });
    
    console.log("Últimos 10 mensajes:");
    for (const m of lastMessages.reverse()) {
        console.log(`[${m.role.padEnd(9)}] ${m.content}`);
        if (m.error) {
            console.log(` -> ERROR: ${m.error}`);
        }
    }
}

main().finally(() => prisma.$disconnect());
