export interface LightRAGGraphNode {
    id?: string
    label?: string
    name?: string
    entity?: string
    type?: string
    properties?: Record<string, unknown>
}

export interface LightRAGGraphEdge {
    id?: string
    source?: string
    target?: string
    from?: string
    to?: string
    label?: string
    type?: string
    properties?: Record<string, unknown>
}

export interface LightRAGGraph {
    nodes: LightRAGGraphNode[]
    edges: LightRAGGraphEdge[]
    is_truncated: boolean
}

export class LightRAGClient {
    private baseUrl: string

    constructor() {
        // Default to localhost when running in development docker or host
        this.baseUrl = process.env.LIGHTRAG_API_URL || "http://localhost:9621"
    }

    /**
     * Sube un archivo binario (Buffer) al microservicio de LightRAG para indexación.
     */
    async uploadFile(
        workspace: string,
        docId: string,
        fileBuffer: Buffer,
        filename: string
    ): Promise<{ status: string; doc_id: string; characters_parsed?: number }> {
        const url = `${this.baseUrl}/upload?workspace=${encodeURIComponent(workspace)}&doc_id=${encodeURIComponent(docId)}`
        
        console.log(`[LightRAGClient] Subiendo archivo "${filename}" para workspace "${workspace}"...`)
        
        // Crear un objeto FormData estándar de Node.js
        const formData = new FormData()
        // Convertir el buffer en un Blob compatible con Next.js/Web standard Fetch FormData
        const blob = new Blob([new Uint8Array(fileBuffer)])
        formData.append("file", blob, filename)

        try {
            const response = await fetch(url, {
                method: "POST",
                body: formData,
            })

            if (!response.ok) {
                const errText = await response.text()
                throw new Error(`Error en API LightRAG (${response.status}): ${errText}`)
            }

            const data = await response.json()
            return data
        } catch (error) {
            console.error(`[LightRAGClient] Error en uploadFile:`, error)
            throw error
        }
    }

    /**
     * Elimina un documento específico de la base de conocimiento de LightRAG.
     */
    async deleteDocument(
        workspace: string,
        docId: string
    ): Promise<{ status: string; doc_id: string }> {
        const url = `${this.baseUrl}/documents?workspace=${encodeURIComponent(workspace)}&doc_id=${encodeURIComponent(docId)}`
        
        console.log(`[LightRAGClient] Eliminando documento "${docId}" del workspace "${workspace}"...`)

        try {
            const response = await fetch(url, {
                method: "DELETE",
            })

            if (!response.ok) {
                const errText = await response.text()
                throw new Error(`Error en API LightRAG (${response.status}): ${errText}`)
            }

            const data = await response.json()
            return data
        } catch (error) {
            console.error(`[LightRAGClient] Error en deleteDocument:`, error)
            throw error
        }
    }

    /**
     * Consulta a LightRAG y recupera el contexto estructurado relevante.
     * Modos válidos: "hybrid" (por defecto), "local", "global", "naive".
     */
    async query(
        workspace: string,
        text: string,
        mode: "hybrid" | "local" | "global" | "naive" = "hybrid"
    ): Promise<string> {
        const url = `${this.baseUrl}/query?workspace=${encodeURIComponent(workspace)}`
        console.log(`[LightRAGClient] Consultando en modo "${mode}" para workspace "${workspace}"...`)
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    query: text,
                    mode,
                }),
            })

            if (!response.ok) {
                const errText = await response.text()
                throw new Error(`Error en API LightRAG (${response.status}): ${errText}`)
            }

            const data = await response.json()
            return data.response || ""
        } catch (error) {
            console.error(`[LightRAGClient] Error en query:`, error)
            return ""
        }
    }

    /**
     * Obtiene el grafo de conocimiento para visualización.
     */
    async getGraph(
        workspace: string,
        label: string = "*",
        maxDepth: number = 3,
        maxNodes: number = 1000
    ): Promise<LightRAGGraph> {
        const url = `${this.baseUrl}/graph?workspace=${encodeURIComponent(workspace)}&label=${encodeURIComponent(label)}&max_depth=${maxDepth}&max_nodes=${maxNodes}`
        console.log(`[LightRAGClient] Obteniendo grafo para workspace "${workspace}"...`)
        try {
            const response = await fetch(url, {
                method: "GET",
            })

            if (!response.ok) {
                const errText = await response.text()
                throw new Error(`Error en API LightRAG Graph (${response.status}): ${errText}`)
            }

            const data = await response.json()
            return data
        } catch (error) {
            console.error(`[LightRAGClient] Error en getGraph:`, error)
            return { nodes: [], edges: [], is_truncated: false }
        }
    }

    /**
     * Inserta texto directamente en la base de conocimiento para aprendizaje dinámico.
     */
    async insertText(
        workspace: string,
        text: string
    ): Promise<{ status: string; doc_id: string; characters_inserted: number }> {
        const url = `${this.baseUrl}/insert-text?workspace=${encodeURIComponent(workspace)}`
        console.log(`[LightRAGClient] Insertando texto en workspace "${workspace}"...`)
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ text }),
            })

            if (!response.ok) {
                const errText = await response.text()
                throw new Error(`Error en API LightRAG insertText (${response.status}): ${errText}`)
            }

            const data = await response.json()
            return data
        } catch (error) {
            console.error(`[LightRAGClient] Error en insertText:`, error)
            throw error
        }
    }
}


