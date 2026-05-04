import {
    initAuthCreds,
    BufferJSON,
    type AuthenticationState,
    type SignalDataTypeMap,
} from "@whiskeysockets/baileys"
import { prisma } from "../db"

/**
 * Adaptador de autenticación de Baileys respaldado por PostgreSQL.
 * Permite que las sesiones de WhatsApp sobrevivan reinicios en plataformas efímeras como Render.
 * 
 * @param connectionId ID de la conexión (WhatsAppConnection)
 */
export const usePostgresAuthState = async (
    connectionId: string
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const readData = async (category: string, key: string): Promise<any> => {
        try {
            const session = await prisma.whatsAppSession.findUnique({
                where: {
                    connectionId_category_key: {
                        connectionId,
                        category,
                        key,
                    },
                },
            })
            if (session) {
                return JSON.parse(session.data, BufferJSON.reviver)
            }
            return null
        } catch (error) {
            console.error(`[WA Auth] Error reading ${category}:${key}`, error)
            return null
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writeData = async (category: string, key: string, data: any) => {
        try {
            const dataStr = JSON.stringify(data, BufferJSON.replacer)
            await prisma.whatsAppSession.upsert({
                where: {
                    connectionId_category_key: {
                        connectionId,
                        category,
                        key,
                    },
                },
                update: {
                    data: dataStr,
                },
                create: {
                    connectionId,
                    category,
                    key,
                    data: dataStr,
                },
            })
        } catch (error) {
            console.error(`[WA Auth] Error writing ${category}:${key}`, error)
        }
    }

    const removeData = async (category: string, key: string) => {
        try {
            await prisma.whatsAppSession.delete({
                where: {
                    connectionId_category_key: {
                        connectionId,
                        category,
                        key,
                    },
                },
            })
        } catch (error) {
            // Ignoramos errores de "no encontrado"
            if ((error as { code?: string }).code !== "P2025") {
                console.error(`[WA Auth] Error removing ${category}:${key}`, error)
            }
        }
    }

    // 1. Cargar credenciales principales
    let creds = await readData("creds", "default")
    if (!creds) {
        creds = initAuthCreds()
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data: { [key: string]: SignalDataTypeMap[typeof type] } = {}
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(type, id)
                            if (type === "app-state-sync-key" && value) {
                                value = importSyncKey(value)
                            }
                            if (value) {
                                data[id] = value
                            }
                        })
                    )
                    return data
                },
                set: async (data) => {
                    const tasks: Promise<void>[] = []
                    for (const category in data) {
                        const categoryData = data[category as keyof SignalDataTypeMap]
                        for (const id in categoryData) {
                            const value = categoryData[id]
                            if (value) {
                                tasks.push(writeData(category, id, value))
                            } else {
                                tasks.push(removeData(category, id))
                            }
                        }
                    }
                    await Promise.all(tasks)
                },
                clear: async () => {
                    try {
                        await prisma.whatsAppSession.deleteMany({
                            where: {
                                connectionId,
                                NOT: { category: "creds" }, // Mantener credenciales pero limpiar keys
                            },
                        })
                    } catch (error) {
                        console.error("[WA Auth] Error clearing keys", error)
                    }
                },
            },
        },
        saveCreds: () => writeData("creds", "default", creds),
    }
}

// Helpers para sync keys
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function importSyncKey(key: any) {
    if (key?.parsedData?.byteLength) {
        return key.parsedData
    }
    return key
}
