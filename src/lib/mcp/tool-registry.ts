/**
 * Tool Registry — Registro central de herramientas MCP.
 * Carga herramientas de integraciones activas, convierte a formato Groq,
 * y filtra según permisos del usuario.
 */

import { prisma } from "@/lib/db"
import type { MCPTool } from "./mcp-client"

// ==========================================
// TIPOS
// ==========================================

/** Formato de herramienta compatible con Groq tool calling */
export interface GroqTool {
    type: "function"
    function: {
        name: string
        description: string
        parameters: Record<string, unknown>
    }
}

/** Herramienta registrada con metadata de integración */
export interface RegisteredTool {
    name: string
    description: string
    integrationId: string
    accountId?: string
    provider: string
    groqTool: GroqTool
}

// ==========================================
// CACHE DE HERRAMIENTAS POR USUARIO
// ==========================================

interface CacheEntry {
    tools: RegisteredTool[]
    timestamp: number
}

const userToolsCache = new Map<string, CacheEntry>()
const CACHE_TTL = 3 * 60 * 1000 // 3 minutos

// ==========================================
// FUNCIONES
// ==========================================

/**
 * Convierte una herramienta MCP al formato Groq function calling
 */
function mcpToolToGroq(tool: MCPTool, prefix: string): GroqTool {
    return {
        type: "function",
        function: {
            name: `${prefix}__${tool.name}`,
            description: tool.description,
            parameters: tool.inputSchema,
        },
    }
}

/**
 * Obtiene herramientas MCP de un servidor built-in
 */
async function getBuiltInTools(provider: string): Promise<MCPTool[]> {
    switch (provider) {
        case "GOOGLE_CALENDAR": {
            const { getCalendarTools } = await import("./servers/calendar")
            return getCalendarTools()
        }
        default:
            return []
    }
}

/**
 * Carga todas las herramientas disponibles para un usuario.
 * Respeta enabledTools y allowedScopes.
 */
export async function getUserTools(userId: string): Promise<RegisteredTool[]> {
    // Verificar cache
    const cached = userToolsCache.get(userId)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.tools
    }

    // Cargar integraciones activas del usuario
    const integrations = await prisma.integration.findMany({
        where: { userId, isActive: true },
        include: {
            accounts: {
                where: { isDefault: true },
                take: 1,
            },
        },
    })

    const allTools: RegisteredTool[] = []

    for (const integration of integrations) {
        const defaultAccount = integration.accounts[0]
        if (!defaultAccount) continue // Sin cuenta conectada, skip

        // Obtener herramientas del servidor MCP
        const mcpTools = await getBuiltInTools(integration.provider)

        // Filtrar por enabledTools
        const enabledTools = (integration.enabledTools as string[] | null) || null
        const filteredTools = enabledTools
            ? mcpTools.filter((t) => enabledTools.includes(t.name))
            : mcpTools

        // Convertir y registrar
        for (const tool of filteredTools) {
            const prefix = integration.provider.toLowerCase()

            allTools.push({
                name: `${prefix}__${tool.name}`,
                description: tool.description,
                integrationId: integration.id,
                accountId: defaultAccount.id,
                provider: integration.provider,
                groqTool: mcpToolToGroq(tool, prefix),
            })
        }
    }

    // Actualizar cache
    userToolsCache.set(userId, { tools: allTools, timestamp: Date.now() })

    console.log(`[ToolRegistry] ${allTools.length} herramientas cargadas para usuario ${userId}`)
    return allTools
}

/**
 * Busca una herramienta por nombre en el registro del usuario
 */
export async function findTool(userId: string, toolName: string): Promise<RegisteredTool | null> {
    const tools = await getUserTools(userId)
    return tools.find((t) => t.name === toolName) || null
}

/**
 * Obtiene solo los schemas Groq (para enviar al modelo)
 */
export async function getGroqTools(userId: string): Promise<GroqTool[]> {
    const tools = await getUserTools(userId)
    return tools.map((t) => t.groqTool)
}

/**
 * Invalida el cache de herramientas de un usuario
 */
export function invalidateUserTools(userId: string): void {
    userToolsCache.delete(userId)
}
