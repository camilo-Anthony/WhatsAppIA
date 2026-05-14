/**
 * Tool Router — Capa multi-tenant entre el agent loop y los servidores MCP.
 * Resuelve: qué integración, qué cuenta, qué credenciales, y ejecuta con timeout.
 */

import { prisma } from "@/lib/db"
import { authorizeToolCall } from "@/lib/security/guardrails"
import { findTool, type RegisteredTool } from "./tool-registry"

// ==========================================
// TIPOS
// ==========================================

export interface ToolCallRequest {
    userId: string
    toolName: string
    arguments: Record<string, unknown>
    conversationId?: string
}

export interface ToolCallResponse {
    success: boolean
    result: string
    durationMs: number
    error?: string
}

// ==========================================
// CONFIGURACIÓN
// ==========================================

const TOOL_TIMEOUT_MS = 10_000 // 10 segundos
const MAX_RETRIES = 2

// ==========================================
// ROUTER
// ==========================================

/**
 * Ejecuta una herramienta con routing multi-tenant, timeout, y logging.
 */
export async function routeToolCall(request: ToolCallRequest): Promise<ToolCallResponse> {
    const { userId, toolName, arguments: args, conversationId } = request
    const startTime = Date.now()

    // 1. Buscar la herramienta en el registro del usuario
    const tool = await findTool(userId, toolName)

    if (!tool) {
        return {
            success: false,
            result: `Herramienta "${toolName}" no encontrada o no está habilitada.`,
            durationMs: Date.now() - startTime,
            error: "TOOL_NOT_FOUND",
        }
    }

    // 2. Cargar cuenta con credenciales
    const account = tool.accountId
        ? await prisma.integrationAccount.findUnique({
              where: { id: tool.accountId },
          })
        : null

    if (!account) {
        return {
            success: false,
            result: "No hay una cuenta conectada para esta integración.",
            durationMs: Date.now() - startTime,
            error: "NO_ACCOUNT",
        }
    }

    // 3. Verificar scopes
    const integration = await prisma.integration.findUnique({
        where: { id: tool.integrationId },
    })

    const policy = authorizeToolCall({
        userId,
        toolName,
        arguments: args,
        conversationId,
        enabledTools: integration?.enabledTools,
        allowedScopes: integration?.allowedScopes,
        isActive: integration?.isActive,
        provider: integration?.provider,
    })

    if (!policy.allowed) {
        await prisma.toolExecution.create({
            data: {
                integrationId: tool.integrationId,
                accountId: tool.accountId,
                conversationId,
                toolName: tool.name,
                input: JSON.parse(JSON.stringify(policy.sanitizedArguments)),
                status: "failed",
                attempt: 1,
                durationMs: Date.now() - startTime,
                error: `TOOL_POLICY_DENIED: ${policy.reason}`,
            },
        })

        return {
            success: false,
            result: "La accion fue bloqueada por politicas de seguridad.",
            durationMs: Date.now() - startTime,
            error: "TOOL_POLICY_DENIED",
        }
    }

    const safeArgs = policy.sanitizedArguments

    if (integration?.allowedScopes) {
        const scopes = integration.allowedScopes as string[]
        const requiredScope = getRequiredScope(tool)

        if (requiredScope && !scopes.includes(requiredScope)) {
            return {
                success: false,
                result: `Permiso insuficiente. Se requiere: ${requiredScope}`,
                durationMs: Date.now() - startTime,
                error: "SCOPE_DENIED",
            }
        }
    }

    // 4. Ejecutar con timeout y retry
    let lastError: string | undefined
    let attempt = 0

    while (attempt < MAX_RETRIES) {
        attempt++

        // Crear log de ejecución
        const execution = await prisma.toolExecution.create({
            data: {
                integrationId: tool.integrationId,
                accountId: tool.accountId,
                conversationId,
                toolName: tool.name,
                input: JSON.parse(JSON.stringify(safeArgs)),
                status: "running",
                attempt,
            },
        })

        try {
            const result = await executeWithTimeout(
                tool,
                safeArgs,
                account.credentials as Record<string, unknown>,
                account.config as Record<string, unknown> | null,
                TOOL_TIMEOUT_MS
            )

            const durationMs = Date.now() - startTime

            // Actualizar log: éxito
            await prisma.toolExecution.update({
                where: { id: execution.id },
                data: {
                    status: "completed",
                    output: JSON.parse(JSON.stringify({ result })),
                    durationMs,
                },
            })

            return { success: true, result, durationMs }
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : "Error desconocido"
            lastError = errorMsg
            const durationMs = Date.now() - startTime

            // Actualizar log: fallo
            await prisma.toolExecution.update({
                where: { id: execution.id },
                data: {
                    status: errorMsg === "TOOL_TIMEOUT" ? "timeout" : "failed",
                    error: errorMsg,
                    durationMs,
                },
            })

            // No reintentar en timeout
            if (errorMsg === "TOOL_TIMEOUT") break

            console.error(`[ToolRouter] Intento ${attempt}/${MAX_RETRIES} falló para ${toolName}: ${errorMsg}`)
        }
    }

    return {
        success: false,
        result: `No se pudo ejecutar la herramienta después de ${attempt} intentos. Error: ${lastError}`,
        durationMs: Date.now() - startTime,
        error: lastError,
    }
}

// ==========================================
// EJECUCIÓN CON TIMEOUT
// ==========================================

async function executeWithTimeout(
    tool: RegisteredTool,
    args: Record<string, unknown>,
    credentials: Record<string, unknown>,
    config: Record<string, unknown> | null,
    timeoutMs: number
): Promise<string> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
        const result = await Promise.race([
            executeToolByProvider(tool, args, credentials, config),
            new Promise<never>((_, reject) => {
                controller.signal.addEventListener("abort", () =>
                    reject(new Error("TOOL_TIMEOUT"))
                )
            }),
        ])
        return result
    } finally {
        clearTimeout(timeout)
    }
}

// ==========================================
// DISPATCH POR PROVIDER
// ==========================================

async function executeToolByProvider(
    tool: RegisteredTool,
    args: Record<string, unknown>,
    credentials: Record<string, unknown>,
    config: Record<string, unknown> | null
): Promise<string> {
    // Extraer el nombre de la herramienta real (sin prefijo del provider)
    const toolBaseName = tool.name.includes("__")
        ? tool.name.split("__").slice(1).join("__")
        : tool.name

    switch (tool.provider) {
        case "GOOGLE_CALENDAR": {
            const { executeCalendarTool } = await import("./servers/calendar")
            return executeCalendarTool(toolBaseName, args, credentials, config)
        }
        default:
            throw new Error(`Provider no soportado: ${tool.provider}`)
    }
}

// ==========================================
// HELPERS
// ==========================================

/**
 * Determina el scope requerido para una herramienta
 */
function getRequiredScope(tool: RegisteredTool): string | null {
    const toolBaseName = tool.name.includes("__")
        ? tool.name.split("__").slice(1).join("__")
        : tool.name

    // Mapear herramientas a scopes
    const writeTools = ["create_event", "cancel_event", "update_event", "create_record", "delete_record"]
    const readTools = ["check_availability", "list_events", "get_record", "list_records"]

    const category = tool.provider.toLowerCase().split("_")[1] || tool.provider.toLowerCase()

    if (writeTools.includes(toolBaseName)) return `${category}.write`
    if (readTools.includes(toolBaseName)) return `${category}.read`

    return null
}
