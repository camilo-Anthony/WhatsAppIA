import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { LightRAGClient } from "@/lib/ai/rag/lightrag-client"

// GET: Listar todos los documentos de conocimiento del asistente
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

        const documents = await prisma.knowledgeDocument.findMany({
            where: {
                assistantConfigId: profileId,
                userId: session.user.id,
            },
            orderBy: { createdAt: "desc" },
        })

        return NextResponse.json({ documents })
    } catch (error) {
        console.error("[Documents GET] Error:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}

// POST: Subir e indexar un nuevo documento en la base de conocimiento
export async function POST(
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

        const formData = await request.formData()
        const file = formData.get("file") as File | null

        if (!file) {
            return NextResponse.json({ error: "No se proporcionó ningún archivo" }, { status: 400 })
        }

        const filename = file.name
        const fileSize = file.size
        const fileType = filename.split(".").pop()?.toLowerCase() || ""

        // Validar tipos de archivos soportados
        const allowedTypes = ["pdf", "docx", "doc", "txt", "md", "json", "csv"]
        if (!allowedTypes.includes(fileType)) {
            return NextResponse.json(
                { error: `Tipo de archivo no soportado (.${fileType}). Tipos válidos: PDF, DOCX, TXT, MD, JSON, CSV` },
                { status: 400 }
            )
        }

        // Crear registro en la base de datos en estado pendiente
        const docRecord = await prisma.knowledgeDocument.create({
            data: {
                userId: session.user.id,
                assistantConfigId: profileId,
                filename,
                fileType,
                fileSize,
                processed: false,
            }
        })

        try {
            // Leer archivo como buffer
            const arrayBuffer = await file.arrayBuffer()
            const fileBuffer = Buffer.from(arrayBuffer)

            // Indexar en el microservicio de LightRAG
            const ragClient = new LightRAGClient()
            await ragClient.uploadFile(profileId, docRecord.id, fileBuffer, filename)

            // Actualizar a completado
            const updatedDoc = await prisma.knowledgeDocument.update({
                where: { id: docRecord.id },
                data: { processed: true }
            })

            return NextResponse.json({ document: updatedDoc })
        } catch (indexingError: any) {
            console.error("[Documents POST] Error indexando en LightRAG:", indexingError)
            
            // Guardar el error en base de datos
            const failedDoc = await prisma.knowledgeDocument.update({
                where: { id: docRecord.id },
                data: { 
                    processed: false, 
                    error: indexingError.message || "Error al procesar el archivo en RAG" 
                }
            })

            return NextResponse.json(
                { error: "Error al indexar el archivo", details: indexingError.message, document: failedDoc },
                { status: 500 }
            )
        }

    } catch (error) {
        console.error("[Documents POST] Error general:", error)
        return NextResponse.json({ error: "Error interno al subir el documento" }, { status: 500 })
    }
}
