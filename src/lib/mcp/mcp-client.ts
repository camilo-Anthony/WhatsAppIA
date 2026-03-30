/**
 * MCP Client — Conecta con servidores MCP para descubrir y ejecutar herramientas.
 * Usa el SDK oficial de @modelcontextprotocol/sdk
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

// ==========================================
// TIPOS
// ==========================================

export interface MCPTool {
    name: string
    description: string
    inputSchema: Record<string, unknown>
}

export interface MCPToolResult {
    content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>
    isError?: boolean
}

interface MCPServerConfig {
    command: string
    args?: string[]
    env?: Record<string, string>
}

// ==========================================
// CLIENTE MCP
// ==========================================

export class MCPClient {
    private client: Client | null = null
    private transport: StdioClientTransport | null = null
    private toolsCache: MCPTool[] | null = null
    private cacheTimestamp: number = 0
    private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutos

    constructor(
        private readonly serverName: string,
        private readonly config: MCPServerConfig
    ) {}

    /**
     * Conectar al servidor MCP
     */
    async connect(): Promise<void> {
        if (this.client) return

        this.transport = new StdioClientTransport({
            command: this.config.command,
            args: this.config.args,
            env: { ...process.env, ...(this.config.env || {}) } as Record<string, string>,
        })

        this.client = new Client(
            { name: `whatsapp-ia-${this.serverName}`, version: "1.0.0" },
            { capabilities: {} }
        )

        await this.client.connect(this.transport)
        console.log(`[MCP] Conectado a servidor: ${this.serverName}`)
    }

    /**
     * Descubrir herramientas disponibles (con cache)
     */
    async listTools(): Promise<MCPTool[]> {
        const now = Date.now()

        // Retornar cache si es válido
        if (this.toolsCache && now - this.cacheTimestamp < this.CACHE_TTL) {
            return this.toolsCache
        }

        await this.ensureConnected()

        const result = await this.client!.listTools()

        this.toolsCache = result.tools.map((tool) => ({
            name: tool.name,
            description: tool.description || "",
            inputSchema: (tool.inputSchema as Record<string, unknown>) || {},
        }))
        this.cacheTimestamp = now

        console.log(`[MCP] ${this.serverName}: ${this.toolsCache.length} herramientas descubiertas`)
        return this.toolsCache
    }

    /**
     * Ejecutar una herramienta
     */
    async callTool(toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
        await this.ensureConnected()

        const result = await this.client!.callTool({
            name: toolName,
            arguments: args,
        })

        return {
            content: result.content as MCPToolResult["content"],
            isError: result.isError as boolean | undefined,
        }
    }

    /**
     * Invalidar cache de herramientas
     */
    invalidateCache(): void {
        this.toolsCache = null
        this.cacheTimestamp = 0
    }

    /**
     * Desconectar
     */
    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.close()
            this.client = null
            this.transport = null
            this.toolsCache = null
            console.log(`[MCP] Desconectado de: ${this.serverName}`)
        }
    }

    private async ensureConnected(): Promise<void> {
        if (!this.client) {
            await this.connect()
        }
    }
}
