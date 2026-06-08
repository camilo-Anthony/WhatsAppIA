import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { LightRAGClient } from "@/lib/ai/rag/lightrag-client"
import type { LightRAGGraph, LightRAGGraphEdge, LightRAGGraphNode } from "@/lib/ai/rag/lightrag-client"
import { parseStructuredDashboardConfigPrompt, parseTextareaList } from "@/lib/ai/agent/dashboard-config"

export const dynamic = "force-dynamic"

const MAX_GRAPH_MEMORIES = 150
const MAX_GRAPH_DOCUMENTS = 100
const MAX_GRAPH_TOOLS = 50
const MAX_RAG_GRAPH_NODES = 80
const MAX_GRAPH_TEXT_LENGTH = 240

type VisualGraphNode = {
    id: string
    labels: string[]
    properties: Record<string, string>
}

type VisualGraphEdge = {
    id: string
    source: string
    target: string
    type: string
    label: string
    properties: Record<string, string>
}

/**
 * GET /api/assistant/config/[id]/graph
 * 
 * Genera un grafo visual semántico dividido en: Identidad, Memoria, Conocimiento y Herramientas.
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const resolvedParams = await params
        const profileId = resolvedParams.id

        // Verificar pertenencia del perfil
        const existingProfile = await prisma.assistantConfig.findFirst({
            where: { id: profileId, userId: session.user.id }
        })

        if (!existingProfile) {
            return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })
        }

        const ragGraphPromise: Promise<LightRAGGraph> = existingProfile.infoMode === "RAG"
            ? new LightRAGClient().getGraph(profileId, "*", 2, MAX_RAG_GRAPH_NODES)
            : Promise.resolve({ nodes: [], edges: [], is_truncated: false })

        // Obtener datos paralelos
        const [memories, documents, tools, ragGraph] = await Promise.all([
            prisma.agentMemory.findMany({
                where: { userId: session.user.id, assistantConfigId: profileId },
                orderBy: [{ score: "desc" }, { updatedAt: "desc" }],
                take: MAX_GRAPH_MEMORIES,
            }),
            prisma.knowledgeDocument.findMany({
                where: { assistantConfigId: profileId, userId: session.user.id },
                orderBy: { updatedAt: "desc" },
                take: MAX_GRAPH_DOCUMENTS,
            }),
            prisma.integrationAccount.findMany({
                where: { integration: { userId: session.user.id, isActive: true } },
                take: MAX_GRAPH_TOOLS,
                select: {
                    id: true,
                    label: true,
                    integration: {
                        select: {
                            provider: true,
                        }
                    }
                }
            }),
            ragGraphPromise,
        ])

        const nodes: VisualGraphNode[] = []
        const edges: VisualGraphEdge[] = []

        // Nodo central del Grafo: IDENTIDAD
        const identityNodeId = `core-identity_${profileId}`
        nodes.push({
            id: identityNodeId,
            labels: ["IDENTIDAD"],
            properties: {
                description: graphText(`Identidad Base: ${existingProfile.name}. Nodo central del asistente.`),
                displayName: graphText(`Identidad: ${existingProfile.name}`, 80),
            }
        })

        // Parsear prompt de comportamiento estructurado para extraer ramificaciones
        const { config: parsedConfig } = parseStructuredDashboardConfigPrompt(existingProfile.behaviorPrompt || "")

        // 1. Ramificación: Nombre/Identidad
        if (parsedConfig.agentIdentity) {
            const nameNodeId = `identity_name_${profileId}`
            nodes.push({
                id: nameNodeId,
                labels: ["IDENTIDAD"],
                properties: {
                    displayName: `Nombre: ${parsedConfig.agentIdentity}`,
                    description: graphText(`Nombre configurado para el agente en el chat.`),
                }
            })
            edges.push({
                id: `edge_identity_name_${profileId}`,
                source: identityNodeId,
                target: nameNodeId,
                type: "TIENE_NOMBRE",
                label: "TIENE_NOMBRE",
                properties: { weight: "1.0" }
            })
        }

        // 2. Ramificación: Misión / Rol
        if (parsedConfig.mission) {
            const missionNodeId = `identity_mission_${profileId}`
            nodes.push({
                id: missionNodeId,
                labels: ["IDENTIDAD"],
                properties: {
                    displayName: "Misión y Rol",
                    description: graphText(parsedConfig.mission),
                }
            })
            edges.push({
                id: `edge_identity_mission_${profileId}`,
                source: identityNodeId,
                target: missionNodeId,
                type: "TIENE_MISIÓN",
                label: "TIENE_MISIÓN",
                properties: { weight: "1.0" }
            })
        }

        // 3. Ramificación: Tono y Estilo
        if (parsedConfig.toneAndFormat) {
            const toneNodeId = `identity_tone_${profileId}`
            nodes.push({
                id: toneNodeId,
                labels: ["IDENTIDAD"],
                properties: {
                    displayName: "Tono y Estilo",
                    description: graphText(parsedConfig.toneAndFormat),
                }
            })
            edges.push({
                id: `edge_identity_tone_${profileId}`,
                source: identityNodeId,
                target: toneNodeId,
                type: "TIENE_TONO",
                label: "TIENE_TONO",
                properties: { weight: "1.0" }
            })
        }

        // 4. Ramificación: Restricciones Estrictas
        if (parsedConfig.strictConstraints) {
            const constraintsList = parseTextareaList(parsedConfig.strictConstraints)
            constraintsList.forEach((constraint, idx) => {
                const constraintNodeId = `identity_constraint_${profileId}_${idx}`
                nodes.push({
                    id: constraintNodeId,
                    labels: ["IDENTIDAD"],
                    properties: {
                        displayName: `Regla #${idx + 1}`,
                        description: graphText(constraint),
                    }
                })
                edges.push({
                    id: `edge_identity_constraint_${profileId}_${idx}`,
                    source: identityNodeId,
                    target: constraintNodeId,
                    type: "RESTRICCIÓN",
                    label: "RESTRICCIÓN",
                    properties: { weight: "0.8" }
                })
            })
        }

        // --- SECCIÓN: CONOCIMIENTO ---
        // Nodo raíz de conocimiento (ahora incondicional)
        const knowledgeRootId = `core-knowledge_${profileId}`
        const hasConfiguredSimpleKnowledge = Boolean(existingProfile.simpleInfo?.trim())
        nodes.push({
            id: knowledgeRootId,
            labels: ["BASE_CONOCIMIENTO"],
            properties: {
                displayName: "Base de Conocimiento",
                description: hasConfiguredSimpleKnowledge
                    ? "Informacion configurada en el dashboard"
                    : (documents.length > 0 || ragGraph.nodes.length > 0 ? "Documentos indexados (RAG)" : "Sin documentos ni información configurada")
            }
        })
        edges.push({
            id: `edge_identity_knowledge`,
            source: identityNodeId,
            target: knowledgeRootId,
            type: "TIENE_CONOCIMIENTO",
            label: "TIENE_CONOCIMIENTO",
            properties: { weight: "1.0" }
        })

        if (hasConfiguredSimpleKnowledge) {
            const simpleKnowledgeNodeId = `simple_knowledge_${profileId}`
            nodes.push({
                id: simpleKnowledgeNodeId,
                labels: ["CONOCIMIENTO"],
                properties: {
                    displayName: "Conocimiento configurado",
                    description: graphText(existingProfile.simpleInfo),
                    source: "dashboard",
                    status: "Configurado"
                }
            })
            edges.push({
                id: `edge_knowledge_simple_${profileId}`,
                source: knowledgeRootId,
                target: simpleKnowledgeNodeId,
                type: "CONOCIMIENTO_CONFIGURADO",
                label: "CONOCIMIENTO_CONFIGURADO",
                properties: { weight: "1.0" }
            })
        }

        // Agregar documentos
        for (const doc of documents) {
            const docNodeId = `doc_${doc.id}`
            nodes.push({
                id: docNodeId,
                labels: ["CONOCIMIENTO"],
                properties: {
                    displayName: graphText(doc.filename, 120),
                    description: graphText(`Archivo ${doc.fileType.toUpperCase()}`),
                    fileType: graphText(doc.fileType, 20),
                    status: doc.processed ? "Indexado" : "Procesando"
                }
            })
            edges.push({
                id: `edge_knowledge_${doc.id}`,
                source: knowledgeRootId,
                target: docNodeId,
                type: "DOCUMENTO",
                label: "DOCUMENTO",
                properties: { weight: "1.0" }
            })
        }

        appendLightRAGGraph(ragGraph, nodes, edges, knowledgeRootId)

        // --- SECCIÓN: HERRAMIENTAS ---
        // Nodo raíz de herramientas (ahora incondicional)
        const toolsRootId = `core-tools_${profileId}`
        nodes.push({
            id: toolsRootId,
            labels: ["CAJA_HERRAMIENTAS"],
            properties: {
                displayName: "Herramientas Conectadas",
                description: tools.length > 0 ? "Integraciones disponibles" : "Sin herramientas conectadas"
            }
        })
        edges.push({
            id: `edge_identity_tools`,
            source: identityNodeId,
            target: toolsRootId,
            type: "USA_HERRAMIENTAS",
            label: "USA_HERRAMIENTAS",
            properties: { weight: "1.0" }
        })

        // Agregar cuentas de herramientas
        for (const tool of tools) {
            const toolNodeId = `tool_${tool.id}`
            nodes.push({
                id: toolNodeId,
                labels: ["HERRAMIENTA"],
                properties: {
                    displayName: graphText(tool.label, 100),
                    description: graphText(`Integración: ${tool.integration.provider}`),
                    provider: graphText(tool.integration.provider, 60)
                }
            })
            edges.push({
                id: `edge_tools_${tool.id}`,
                source: toolsRootId,
                target: toolNodeId,
                type: "HERRAMIENTA_ACTIVA",
                label: "HERRAMIENTA_ACTIVA",
                properties: { weight: "1.0" }
            })
        }

        // --- SECCIÓN: MEMORIA ---
        // Nodo raíz de memoria (ahora incondicional)
        const memoryRootId = `core-memory_${profileId}`
        nodes.push({
            id: memoryRootId,
            labels: ["MEMORIA_BASE"],
            properties: {
                displayName: "Base de Memoria",
                description: memories.length > 0 ? "Centro de recuerdos por chat" : "Sin recuerdos memorizados"
            }
        })
        edges.push({
            id: `edge_identity_memory_${profileId}`,
            source: identityNodeId,
            target: memoryRootId,
            type: "TIENE_MEMORIA",
            label: "TIENE_MEMORIA",
            properties: { weight: "1.0" }
        })

        // Conexión cognitiva entre Conocimiento y Memoria
        edges.push({
            id: `edge_knowledge_memory_${profileId}`,
            source: knowledgeRootId,
            target: memoryRootId,
            type: "CONECTA_CON",
            label: "CONECTA_CON",
            properties: { weight: "1.0" }
        })

        // Agrupar memorias por teléfono (cliente)
        const clientGroups = new Map<string, typeof memories>()
        for (const mem of memories) {
            const phone = mem.phone || "global"
            if (!clientGroups.has(phone)) {
                clientGroups.set(phone, [])
            }
            clientGroups.get(phone)!.push(mem)
        }

        const categoryLabels: Record<string, string> = {
            nombre: "PERSONA",
            telefono: "CONTACTO",
            empresa: "ORGANIZACIÓN",
            cargo: "ROL",
            preferencia: "PREFERENCIA",
            direccion: "UBICACIÓN",
            email: "CONTACTO",
            dato_clave: "DATO",
            fact: "DATO",
            general: "DATO",
        }

        for (const [phone, mems] of clientGroups) {
            let parentNodeId = memoryRootId
            let clientLabel = existingProfile.name

            if (phone !== "global") {
                // Nodo intermedio: el cliente (teléfono)
                const clientNodeId = `client_${phone}`
                parentNodeId = clientNodeId
                
                clientLabel = graphText(phone, 40)

                nodes.push({
                    id: clientNodeId,
                    labels: ["MEMORIA_CLIENTE"],
                    properties: {
                        description: graphText(`Interacción con: ${clientLabel} (${phone})`),
                        phone: graphText(phone, 40),
                        displayName: clientLabel,
                    }
                })

                // Conectar Memoria Base -> Cliente
                edges.push({
                    id: `edge_memory_${phone}`,
                    source: memoryRootId,
                    target: clientNodeId,
                    type: "INTERACTUA_CON",
                    label: "INTERACTÚA_CON",
                    properties: {
                        description: graphText(`Chat con: ${clientLabel}`),
                        weight: "1.0",
                    }
                })
            }

            // Nodo por cada hecho memorizado
            for (const mem of mems) {

                const factNodeId = `fact_${mem.id}`
                // Convertir cualquier categoría vieja a "MEMORIA" si no está mapeada
                let label = categoryLabels[mem.key.toLowerCase()] || categoryLabels[mem.category] || "MEMORIA"
                // Forzar que siempre contenga "MEMORIA_" para agruparlo
                if (!label.startsWith("MEMORIA") && label !== "PERSONA" && label !== "CONTACTO") {
                    label = `MEMORIA_${label}`
                }

                nodes.push({
                    id: factNodeId,
                    labels: [label],
                    properties: {
                        description: graphText(mem.value),
                        key: graphText(mem.key, 80),
                        category: graphText(mem.category, 60),
                        score: String(mem.score),
                        updatedAt: mem.updatedAt.toISOString(),
                        displayName: graphText(mem.key.toUpperCase(), 80)
                    }
                })

                // Edge: Padre (Identidad o Cliente) → Hecho/Memoria
                edges.push({
                    id: `edge_${mem.id}`,
                    source: parentNodeId,
                    target: factNodeId,
                    type: "RECUERDA",
                    label: "RECUERDA",
                    properties: {
                        description: graphText(`${mem.key}: ${mem.value}`),
                        weight: String(mem.score),
                    }
                })
            }
        }

        return NextResponse.json({ nodes, edges })
    } catch (error) {
        console.error("[Graph GET] Error:", error)
        return NextResponse.json({ error: "Error interno al obtener el grafo" }, { status: 500 })
    }
}

function appendLightRAGGraph(
    ragGraph: LightRAGGraph,
    nodes: VisualGraphNode[],
    edges: VisualGraphEdge[],
    knowledgeRootId: string
): void {
    if (ragGraph.nodes.length === 0) return

    const ragRootId = `${knowledgeRootId}_rag`
    nodes.push({
        id: ragRootId,
        labels: ["RAG_GRAFO"],
        properties: {
            displayName: "Grafo RAG",
            description: ragGraph.is_truncated
                ? "Entidades y relaciones semanticas de LightRAG (muestra truncada)"
                : "Entidades y relaciones semanticas de LightRAG",
        },
    })
    edges.push({
        id: `edge_${knowledgeRootId}_rag`,
        source: knowledgeRootId,
        target: ragRootId,
        type: "GRAFO_RAG",
        label: "GRAFO_RAG",
        properties: { weight: "1.0" },
    })

    const nodeIdByKey = new Map<string, string>()

    ragGraph.nodes.forEach((rawNode, index) => {
        const sourceKey = getLightRAGNodeKey(rawNode, index)
        const nodeId = `rag_node_${index}`
        nodeIdByKey.set(sourceKey, nodeId)

        nodes.push({
            id: nodeId,
            labels: ["RAG_ENTIDAD"],
            properties: {
                displayName: getLightRAGNodeName(rawNode, index),
                description: getLightRAGDescription(rawNode),
                source: "LightRAG",
            },
        })
        edges.push({
            id: `edge_${ragRootId}_${index}`,
            source: ragRootId,
            target: nodeId,
            type: "ENTIDAD_RAG",
            label: "ENTIDAD_RAG",
            properties: { weight: "0.7" },
        })
    })

    ragGraph.edges.forEach((rawEdge, index) => {
        const sourceKey = graphText(rawEdge.source ?? rawEdge.from, 120)
        const targetKey = graphText(rawEdge.target ?? rawEdge.to, 120)
        const source = nodeIdByKey.get(sourceKey)
        const target = nodeIdByKey.get(targetKey)

        if (!source || !target || source === target) return

        const relation = graphText(rawEdge.type ?? rawEdge.label ?? "RELACION_RAG", 80) || "RELACION_RAG"
        edges.push({
            id: `edge_rag_relation_${index}`,
            source,
            target,
            type: relation,
            label: graphText(rawEdge.label ?? rawEdge.type ?? "RELACION_RAG", 80) || "RELACION_RAG",
            properties: {
                description: getLightRAGEdgeDescription(rawEdge),
                source: "LightRAG",
                weight: "0.8",
            },
        })
    })
}

function getLightRAGNodeKey(node: LightRAGGraphNode, index: number): string {
    return graphText(node.id ?? node.name ?? node.label ?? node.entity ?? `node_${index}`, 120)
}

function getLightRAGNodeName(node: LightRAGGraphNode, index: number): string {
    return graphText(node.label ?? node.name ?? node.entity ?? node.id ?? `Entidad ${index + 1}`, 100)
}

function getLightRAGDescription(node: LightRAGGraphNode): string {
    return graphText(
        node.properties?.description ??
        node.properties?.summary ??
        node.type ??
        "Entidad semantica recuperada desde LightRAG"
    )
}

function getLightRAGEdgeDescription(edge: LightRAGGraphEdge): string {
    return graphText(
        edge.properties?.description ??
        edge.properties?.keywords ??
        edge.label ??
        edge.type ??
        "Relacion semantica recuperada desde LightRAG"
    )
}

function graphText(value: unknown, maxLength = MAX_GRAPH_TEXT_LENGTH): string {
    return String(value ?? "")
        .normalize("NFKC")
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength)
}
