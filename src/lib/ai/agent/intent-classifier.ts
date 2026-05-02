/**
 * Intent Classifier — Clasificación de intenciones via LLM.
 *
 * Inspirado en ZeroClaw `agent/classifier.rs` pero usando LLM con
 * JSON output forzado en vez de keyword matching, porque los mensajes
 * de WhatsApp son ambiguos y en español/informal.
 *
 * El LLM SOLO clasifica — no genera respuesta.
 * Temperature 0 para máxima consistencia.
 *
 * @module agent/intent-classifier
 */

import { generateResponse, type AIMessage } from "../providers/groq"
import type { ClassificationResult, ToolSpec, ConversationContext } from "./types"

// ==========================================
// CLASSIFICATION PROMPT
// ==========================================

function buildClassificationPrompt(
    tools: ToolSpec[],
    conversationState: ConversationContext
): string {
    const toolList = tools.map((t) => `- ${t.name}: ${t.description}`).join("\n")
    const slotInfo = Object.keys(conversationState.collectedSlots).length > 0
        ? `\nDatos ya recolectados: ${JSON.stringify(conversationState.collectedSlots)}`
        : ""

    return `Eres un clasificador de intenciones. Tu ÚNICA tarea es analizar el mensaje del usuario y clasificar su intención.

## Intenciones válidas (conjunto cerrado)
### Acciones (tools disponibles):
${toolList}

### Categorías especiales:
- greeting: saludo simple (hola, buenos días, etc.)
- info: pregunta sobre el negocio, servicios, precios
- followup: respuesta a una pregunta anterior del asistente
- unknown: no se puede determinar la intención

## Estado actual de la conversación
- Estado: ${conversationState.state}
- Intent pendiente: ${conversationState.pendingIntent || "ninguno"}${slotInfo}

## Reglas de clasificación
1. Si el mensaje es un saludo simple → "greeting"
2. Si pregunta sobre el negocio → "info"
3. Si responde a una pregunta previa (dando datos) → "followup"
4. Si pide una acción que coincide con una tool → nombre de la tool
5. Si no encaja en nada → "unknown"
6. Extraer TODOS los datos mencionados en el mensaje como slots

## Output
Responde EXCLUSIVAMENTE con un objeto JSON con esta estructura:
{
  "intent": "nombre_de_tool | greeting | info | followup | unknown",
  "confidence": 0.0 a 1.0,
  "extractedSlots": { "slotName": "value" },
  "missingSlots": ["slot1", "slot2"]
}

NO incluyas texto adicional, SOLO el JSON.`
}

// ==========================================
// CLASSIFIER
// ==========================================

/**
 * Clasifica la intención de un mensaje de usuario.
 *
 * Usa Groq con temperature 0 y response_format json_object
 * para obtener clasificación determinística.
 */
export async function classifyIntent(
    message: string,
    conversationState: ConversationContext,
    tools: ToolSpec[],
    userId: string
): Promise<ClassificationResult> {
    const systemPrompt = buildClassificationPrompt(tools, conversationState)

    const messages: AIMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
    ]

    try {
        const response = await generateResponse(messages, {
            temperature: 0,
            maxTokens: 300,
        })

        // Limpiar markdown blocks si el LLM los incluye por error
        let rawContent = response.content || "{}"
        rawContent = rawContent.replace(/```json\s*/g, "").replace(/```\s*$/g, "").trim()

        const parsed = JSON.parse(rawContent)
        return {
            intent: typeof parsed.intent === "string" ? parsed.intent : "unknown",
            confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
            extractedSlots: typeof parsed.extractedSlots === "object" && parsed.extractedSlots !== null
                ? parsed.extractedSlots
                : {},
            missingSlots: Array.isArray(parsed.missingSlots) ? parsed.missingSlots : [],
        }
    } catch (error) {
        console.error("[IntentClassifier] Error clasificando intent:", error)

        // Fallback seguro — no asumir nada
        return {
            intent: "unknown",
            confidence: 0,
            extractedSlots: {},
            missingSlots: [],
        }
    }
}

/**
 * Clasificación rápida por keywords (sin LLM).
 * Complemento al LLM para casos obvios y ahorrar tokens.
 * Inspirado en classifier.rs → classify_with_decision.
 */
export function quickClassify(message: string): ClassificationResult | null {
    const lower = message.toLowerCase().trim()

    // Saludos puros (exact match o saludo + puntuación) — no compound messages
    const greetings = ["hola", "hi", "hello", "buenos días", "buenas tardes", "buenas noches", "hey", "buen día", "buenas"]
    // Normalizar: quitar puntuación final
    const normalized = lower.replace(/[!.,?¿¡]+$/g, "").trim()
    if (greetings.includes(normalized)) {
        return {
            intent: "greeting",
            confidence: 0.95,
            extractedSlots: {},
            missingSlots: [],
        }
    }

    // Mensajes muy cortos sin contexto → probablemente followup
    if (lower.length <= 3 && !["no", "si", "sí", "ok"].includes(lower)) {
        return null // Dejar que el LLM decida
    }

    return null // No hay match rápido, usar LLM
}
