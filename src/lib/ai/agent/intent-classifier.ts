/**
 * Intent Classifier — Clasificación de intenciones via LLM.
 *
 * Usa LLM con JSON output forzado en vez de keyword matching, porque los mensajes
 * de WhatsApp son ambiguos y en español/informal.
 *
 * El LLM SOLO clasifica — no genera respuesta.
 * Temperature 0 para máxima consistencia.
 *
 * @module agent/intent-classifier
 */

import { generateResponse, type AIMessage } from "../providers/llm"
import type { ClassificationResult, ToolSpec, ConversationContext } from "./types"

// ==========================================
// CLASSIFICATION PROMPT
// ==========================================

function buildClassificationPrompt(
    tools: ToolSpec[],
    conversationState: ConversationContext
): string {
    const toolList = tools.map((t) => `- ${t.name}: ${t.description}\n  Parámetros requeridos: ${JSON.stringify(t.parameters)}`).join("\n")
    const slotInfo = Object.keys(conversationState.collectedSlots).length > 0
        ? `\nDatos ya recolectados: ${JSON.stringify(conversationState.collectedSlots)}`
        : ""

    return `Eres un clasificador de intenciones. Tu ÚNICA tarea es analizar el mensaje del usuario y clasificar su intención.

## Intenciones válidas (conjunto cerrado)
### Acciones (tools disponibles):
${toolList}

### Categorías especiales:
- greeting: saludo simple (hola, buenos días, etc.)
- info: pregunta sobre conocimiento configurado, datos disponibles o alcance del agente
- followup: respuesta a una pregunta anterior del asistente
- unknown: no se puede determinar la intención

## Estado actual de la conversación
- Estado: ${conversationState.state}
- Intent pendiente: ${conversationState.pendingIntent || "ninguno"}${slotInfo}

## Reglas de clasificación
1. Si el mensaje es un saludo simple → "greeting"
2. Si pregunta sobre conocimiento configurado o datos disponibles → "info"
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
    tools: ToolSpec[]
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
 *
 * Fix #3: expandir para cubrir greeting + info-basic + followup-corto para
 * reducir ~40-60% de llamadas LLM. Solo se aplica si no requiere extraccion
 * de slots (slot extraction necesita LLM por ambiguedad del lenguaje natural).
 */
export function quickClassify(message: string): ClassificationResult | null {
    const lower = message.toLowerCase().trim()
    const normalized = lower.replace(/[!.,?¿¡]+$/g, "").trim()

    // === 1. SALUDOS (exact match o + nombre del bot) ===
    const greetings = ["hola", "hi", "hello", "buenos dias", "buenas tardes",
                        "buenas noches", "hey", "buen dia", "buenas", "que tal", "ola"]
    if (greetings.includes(normalized)) {
        return {
            intent: "greeting",
            confidence: 0.95,
            extractedSlots: {},
            missingSlots: [],
        }
    }
    // "hola [nombre_del_bot]" o "holaa" repetido
    if (/^(h+o+l+a+|hi+|hey+|buenas|buenos dias|buenas tardes|buenas noches)\b.{0,30}$/.test(lower)) {
        return {
            intent: "greeting",
            confidence: 0.85,
            extractedSlots: {},
            missingSlots: [],
        }
    }

    // === 2. INFO BASICA: pregunto que sos / que podes hacer / alcance ===
    // Matcheador de preguntas comunes sin slots. En estas el contexto del
    // dashboard basta para responder, no necesitamos classifyIntent.
    const infoPatterns: RegExp[] = [
        /\b(que|q)\s+(eres|sos|puedes\s+hacer|haces)\b/,
        /\b(quien|quién)\s+(eres|sos)\b/,
        /\b(que|q)\s+(puedes\s+hacer|podes\s+hacer|haces)\b/,
        /\b(como|cómo)\s+(funcionas|trabajas|me\s+puedes\s+ayudar)\b/,
        /\b(que|q)\s+(info|informacion|información)\s+(tienes|tenes|manejas|das)\b/,
        /\b(que|q)\s+(temas?)\s+(puedes|podes|manejas|sabes)\b/,
        /\b(me\s+puedes\s+ayudar|puedes\s+ayudarme)\b.{0,20}$/i,
        /\b(que\s+horarios?|donde\s+estan?|donde\s+quedan?|como\s+llego)\b/i,
        /\b(alcanz[ae]\s+del?\s+(bot|asistente|sistema))\b/i,
    ]
    if (infoPatterns.some(p => p.test(normalized))) {
        return {
            intent: "info",
            confidence: 0.85,
            extractedSlots: {},
            missingSlots: [],
        }
    }

    // === 3. FOLLOWUP CORTO: confirmaciones / negaciones / acks a preguntas del bot ===
    // Solo se aplica este branch si la conversation state ya esta en collecting_slots
    // o confirming (evaluado en el caller). Aqui devolvemos intent="followup".
    const shortFollowups = ["si", "sí", "si", "no", "ok", "okay", "dale", "listo",
                            "confirmo", "confirmo", "claro", "perfecto", "esta bien",
                            "esta bien", "esta ok", "asi es", "exacto", "negativo",
                            "cancelar", "cancela", "no gracias", "no, gracias"]
    if (shortFollowups.includes(normalized) || /^s+i+$/i.test(normalized) ||
        /^n+o+p+e+$/i.test(normalized) || /^o+k+a*y*$/i.test(normalized)) {
        return {
            intent: "followup",
            confidence: 0.85,
            extractedSlots: {},
            missingSlots: [],
        }
    }

    // === 4. MENSAJES MUY CORTOS sin match => probable followup ===
    if (lower.length <= 3 && !["no", "si", "sí", "ok"].includes(lower)) {
        return null // Dejar que el LLM decida
    }

    return null // No hay match rapido, usar LLM (incluyendo requests con slots)
}
