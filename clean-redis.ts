import IORedis from "ioredis";
import * as dotenv from "dotenv";

dotenv.config();

const redisUrl = process.env.UPSTASH_REDIS_URL || "redis://localhost:6379";
const redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });

async function main() {
    console.log("🧹 Limpiando caché en Redis...");
    try {
        await redis.flushdb();
        console.log("✅ Caché de Redis limpia.");
    } catch (e) {
        console.error("❌ Error durante la limpieza:", e);
    } finally {
        redis.disconnect();
    }
}

main();
