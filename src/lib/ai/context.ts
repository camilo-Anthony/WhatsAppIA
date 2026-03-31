import { prisma } from "@/lib/db"
import type { AIMessage } from "@/lib/ai/providers/groq"
import { getMemories } from "@/lib/agent-memory"

interface ContextOptions {
    userId: string
    clientPhone: string
    incomingMessage: string
    recentMessagesCount?: number
}

export async function buildContext(options: ContextOptions): Promise<AIMessage[]> {
    const { userId, clientPhone, incomingMessage, recentMessagesCount = 5 } = options

    // Load assistant config
    const config = await prisma.assistantConfig.findUnique({
        where: { userId },
    })

    if (!config) {
        throw new Error("ASSISTANT_NOT_CONFIGURED")
    }

    if (!config.isActive) {
        throw new Error("ASSISTANT_INACTIVE")
    }

    // Build knowledge base
    let knowledgeBase = ""

    if (config.infoMode === "SIMPLE") {
        knowledgeBase = config.simpleInfo || ""
    } else {
        const fields = await prisma.infoField.findMany({
            where: { userId },
            orderBy: { order: "asc" },
        })

        knowledgeBase = fields
            .map((field) => `## ${field.label}\n${field.content}`)
            .join("\n\n")
    }

    // Load recent conversation history
    const conversation = await prisma.conversation.findFirst({
        where: { userId, clientPhone },
        include: {
            messages: {
                orderBy: { timestamp: "desc" },
                take: recentMessagesCount,
            },
        },
    })

    const recentMessages = conversation?.messages?.reverse() || []

    // Build prompt messages
    const messages: AIMessage[] = []

    // System prompt
    let systemPrompt = config.behaviorPrompt

    if (knowledgeBase.trim()) {
        systemPrompt += `\n\n---\n\n# INFORMACIÓN DISPONIBLE\nUsa ÚNICAMENTE la siguiente información para responder. Si la pregunta no puede ser respondida con esta información, indícalo amablemente.\n\n${knowledgeBase}`
    }

    // Load agent memory for this client
    const memories = await getMemories({ userId, phone: clientPhone })
    if (memories.length > 0) {
        systemPrompt += `\n\n---\n\n# NOTAS SOBRE ESTE CLIENTE`
        for (const m of memories) {
            systemPrompt += `\n- ${m.key}: ${m.value}`
        }
    }

    const today = new Date()
    const fechaLegible = today.toLocaleDateString("es", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    })
    const horaLegible = today.toLocaleTimeString("es", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    })
    const fechaISO = today.toISOString().split("T")[0]

    systemPrompt += `\n\n---\n\n# FECHA Y HORA ACTUAL\nHoy es ${fechaLegible}. La hora actual es ${horaLegible}. Zona horaria: America/Lima.`

    systemPrompt += `

---

# REGLAS DE CONVERSACIÓN
- Responde en el mismo idioma que el cliente. Si escribe en español, responde en español.
- Sé natural, cálido y conciso. Máximo 2-3 oraciones por respuesta.
- NO menciones que eres una IA a menos que te lo pregunten directamente.
- Si el usuario saluda ("hola", "buenos días", etc.), salúdalo de vuelta de forma natural y pregunta en qué puedes ayudarle. NO ejecutes ninguna herramienta.
- Si el usuario pide "información" sin especificar, pregunta qué tipo de información necesita. NO asumas que quiere reservar o usar una herramienta.
- Responde SOLO con la información disponible. Si no sabes algo, dilo amablemente sin inventar datos.

# FLUJO PARA RECOLECTAR INFORMACIÓN
- Haz UNA sola pregunta a la vez. Nunca incluyas más de una pregunta en el mismo mensaje.
- Si necesitas varios datos, recógelos de forma progresiva y conversacional en mensajes separados.
- Extrae la información que el usuario ya te dio sin volverla a pedir.
  Ejemplo: si dijo "consulta para mañana a las 7pm", ya tienes motivo=consulta, fecha=mañana, hora=19:00.
- Para reservas y citas, recopila SIEMPRE en este orden antes de actuar:
  1. Motivo o tipo (consulta, reunión, cita médica, etc.)
  2. Fecha y hora
  3. Nombre del cliente
  Una vez que tengas los tres datos, muestra el resumen y pide confirmación.

# CONFIRMACIÓN OBLIGATORIA ANTES DE ACTUAR
- Antes de ejecutar cualquier herramienta que CREA, MODIFICA o ELIMINA datos, muestra un resumen y pide confirmación explícita.
- Ejemplo de confirmación: "Perfecto, voy a agendar una Consulta para el martes 31 de marzo a las 7:00 pm a nombre de [nombre]. ¿Confirmas?"
- Ejecuta la herramienta SOLO después de recibir una confirmación clara ("sí", "confirmo", "ok", "adelante", "dale").
- Las herramientas de SOLO LECTURA (consultar disponibilidad, ver eventos, listar registros) pueden ejecutarse directamente sin confirmación.

# USO DE HERRAMIENTAS
- Usa herramientas SOLO cuando el usuario haya pedido una acción concreta, tengas todos los datos necesarios y haya confirmado.
- Llama SOLO UNA herramienta por respuesta. Nunca encadenes herramientas en el mismo turno.
- Usa el motivo o nombre exacto que dio el usuario como título o referencia (nunca generes títulos genéricos como "Reserva para mañana").
- Después de ejecutar una herramienta, responde con el resultado en lenguaje natural. No llames más herramientas en ese turno.
- Usa la fecha actual como referencia para fechas relativas. Hoy es ${fechaISO}.

# CUÁNDO SÍ USAR HERRAMIENTAS
- "reserva una cita / agenda una reunión" → crear evento (después de recolectar datos y confirmar)
- "¿qué citas tengo?" / "¿qué hay en mi calendario?" → listar eventos
- "cancela mi cita del jueves" → cancelar evento (pide confirmación primero)
- "¿hay disponibilidad el viernes?" → verificar disponibilidad
- Acciones sobre Sheets, Notion, Slack u otras integraciones activas → sus herramientas respectivas

# CUÁNDO NO USAR HERRAMIENTAS
- Saludos, despedidas, agradecimientos o conversación casual
- Preguntas de información general, precios o servicios
- Cuando falten datos necesarios para ejecutar la acción
- Cuando el usuario aún no ha confirmado la acción`

    messages.push({ role: "system", content: systemPrompt })

    // Add recent conversation history
    for (const msg of recentMessages) {
        messages.push({
            role: msg.direction === "INCOMING" ? "user" : "assistant",
            content: msg.content,
        })
    }

    // Add current message
    messages.push({ role: "user", content: incomingMessage })

    return messages
}
