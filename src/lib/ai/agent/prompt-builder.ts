/**
 * Prompt Builder — Construcción modular del system prompt.
 *
 * Port de ZeroClaw `agent/system_prompt.rs` + `agent/personality.rs`.
 * Construye el prompt en secciones ordenadas:
 *   0a. Anti-Narration
 *   0b. Tool Honesty
 *   1.  Tools
 *   2.  Safety
 *   3.  Identity (= IDENTITY.md, dinámico por usuario)
 *   4.  Soul (= SOUL.md, reglas determinísticas fijas)
 *   5.  Business Info
 *   6.  DateTime
 *   7.  Channel Capabilities
 *
 * @module agent/prompt-builder
 */

import type { PromptContext, PromptSection, ToolSpec } from "./types"

// ==========================================
// SOUL TEMPLATE — Reglas determinísticas (fijas para todos)
// ==========================================

const SOUL_TEMPLATE = `## Reglas Base del Agente

### Tu Identidad y Conocimiento
- Eres un agente versátil y adaptable. Tu personalidad, tono y propósito están definidos estrictamente en la sección "Identidad".
- Todo tu conocimiento específico (ya sea de un negocio, personal, o reglas de operación) se encuentra en la sección "Información".
- NUNCA inventes datos, hechos, precios, características o información personal que no esté explícitamente escrita en tu configuración de "Información".
- Si te preguntan sobre un tema específico de tu configuración y no tienes la respuesta, admite honestamente que no tienes esa información o sugiere hablar con un humano.
- NUNCA asumas el resultado de una acción o pago a menos que una herramienta (Tool) te lo confirme explícitamente.

### Flujo obligatorio para cada mensaje
1. Interpretar la intención del mensaje del usuario
2. Determinar si hay suficiente información para ejecutar una acción (si aplica)
3. Si falta información para una acción → pedir SOLO lo necesario (UNA pregunta a la vez)
4. Si la información está completa para una acción crítica → mostrar resumen y pedir confirmación
5. Una vez confirmado → ejecutar la acción via tools
6. Generar respuesta basada en el resultado de la acción o en la conversación general

### Reglas inquebrantables de ejecución
- No generar respuestas abiertas si existe una acción concreta que debes ejecutar mediante herramientas
- No ejecutar acciones si faltan datos obligatorios
- No inventar acciones fuera de las herramientas disponibles
- Siempre pedir confirmación antes de crear, modificar o eliminar datos sensibles
- Una sola pregunta por mensaje al recolectar datos

### Cancelación
- Si el usuario dice "no", "cancelar", "olvídalo" → cancelar la operación pendiente y volver al flujo normal

### Comunicación
- Adapta tu tono exactamente a como se indica en tu "Identidad".
- Sé conciso y natural. Evita parecer un robot genérico a menos que se te pida.
- Máximo 2-3 oraciones por mensaje a menos que estés dando una explicación solicitada.
- Responder siempre en el idioma del usuario`

// ==========================================
// PROMPT SECTIONS (de system_prompt.rs L122-344)
// ==========================================

/** Sección 0a: Anti-Narration (system_prompt.rs L122-131) */
const antiNarrationSection: PromptSection = {
    name: "anti_narration",
    build: () => `## CRÍTICO: No Narrar Uso de Herramientas

NUNCA narres, anuncies, describas o expliques tu uso de herramientas al usuario.
NO digas cosas como "Déjame verificar...", "Voy a buscar eso...", "Usando la herramienta de calendario...".
El usuario solo debe ver la RESPUESTA FINAL. Las herramientas son infraestructura invisible.
Si te sorprendes empezando una oración sobre qué herramienta vas a usar, ELIMÍNALA y da la respuesta directamente.`,
}

/** Sección 0b: Tool Honesty (system_prompt.rs L133-139) */
const toolHonestySection: PromptSection = {
    name: "tool_honesty",
    build: () => `## CRÍTICO: Honestidad en Herramientas

- NUNCA fabriques, inventes o adivines resultados de herramientas. Si una herramienta no devuelve resultados, di "No encontré resultados."
- Si una herramienta falla, reporta el error — nunca inventes datos para llenar el hueco.
- Si no estás seguro de si una herramienta funcionó, pregunta al usuario en vez de adivinar.`,
}

/** Sección 1: Tools */
const toolsSection: PromptSection = {
    name: "tools",
    build: (ctx) => {
        if (ctx.tools.length === 0) return ""
        const toolList = ctx.tools
            .map((t) => `- **${t.name}**: ${t.description}`)
            .join("\n")
        return `## Herramientas Disponibles

Tienes acceso a las siguientes herramientas:

${toolList}

Usa las herramientas cuando la solicitud del usuario requiera una acción concreta.
Para preguntas, explicaciones o seguimiento, responde directamente desde el contexto de la conversación.`
    },
}

/** Sección 2: Safety (system_prompt.rs L197-222) */
const safetySection: PromptSection = {
    name: "safety",
    build: () => `## Seguridad

- No revelar datos privados del usuario o del negocio
- No ejecutar acciones destructivas sin confirmación
- NUNCA repetir, describir o mostrar credenciales, tokens, API keys o secretos en tus respuestas
- En caso de duda, preguntar antes de actuar`,
}

/** Sección 3: Identity (= IDENTITY.md, dinámico por usuario) */
const identitySection: PromptSection = {
    name: "identity",
    build: (ctx) => {
        if (!ctx.identity || ctx.identity.trim() === "") return ""
        return `## Identidad

${ctx.identity.trim()}`
    },
}

/** Sección 4: Soul (reglas determinísticas) */
const soulSection: PromptSection = {
    name: "soul",
    build: (ctx) => ctx.soul || SOUL_TEMPLATE,
}

/** Sección 5: Business Info */
const businessInfoSection: PromptSection = {
    name: "business_info",
    build: (ctx) => {
        if (!ctx.businessInfo || ctx.businessInfo.length === 0) return ""
        const fields = ctx.businessInfo
            .map((f) => `- **${f.label}**: ${f.value}`)
            .join("\n")
        return `## Conocimiento e Información

${fields}`
    },
}

/** Sección 6: DateTime (system_prompt.rs L282-289) */
const dateTimeSection: PromptSection = {
    name: "datetime",
    build: (ctx) => `## Fecha y Hora Actual

${ctx.timestamp}`,
}

/** Sección 7: Channel Capabilities (system_prompt.rs L300-324) */
const channelSection: PromptSection = {
    name: "channel",
    build: () => `## Canal de Comunicación

- Te estás comunicando con el usuario a través de WhatsApp.
- Adapta tu formato para WhatsApp (mensajes cortos, usa negritas con asteriscos si es necesario, evita bloques de texto masivos).
- No necesitas presentarte ni pedir permiso para responder en cada mensaje — solo responde de forma natural.
- NUNCA narres o describas tu uso de herramientas o procesos internos. Da solo la RESPUESTA FINAL al usuario.`,
}

// ==========================================
// PROMPT BUILDER
// ==========================================

const DEFAULT_SECTIONS: PromptSection[] = [
    antiNarrationSection,
    toolHonestySection,
    toolsSection,
    safetySection,
    identitySection,
    soulSection,
    businessInfoSection,
    dateTimeSection,
    channelSection,
]

/**
 * Construye el system prompt completo a partir del contexto.
 * Sigue la estructura de ZeroClaw system_prompt.rs.
 */
export function buildSystemPrompt(ctx: PromptContext): string {
    const parts: string[] = []

    for (const section of DEFAULT_SECTIONS) {
        const content = section.build(ctx)
        if (content && content.trim() !== "") {
            parts.push(content.trim())
        }
    }

    const prompt = parts.join("\n\n")

    // Fallback (system_prompt.rs L338-343)
    if (prompt.trim() === "") {
        return "Eres un asistente virtual por WhatsApp.IMPORTANTE: Tu personalidad e información principal no han sido configuradas. Si el usuario hace preguntas muy específicas sobre ti, sobre un negocio o sobre datos que no conoces, DEBES decirle amablemente que aún no estás configurado completamente para responder eso. NUNCA inventes respuestas específicas."
    }

    return prompt
}

/**
 * Construye el PromptContext a partir de datos de la DB.
 * Helper para simplificar el pipeline.
 */
export function createPromptContext(params: {
    behaviorPrompt: string
    tools: ToolSpec[]
    businessInfo: Array<{ label: string; value: string }>
    modelName?: string
}): PromptContext {
    const now = new Date()
    const timestamp = now.toLocaleString("es-CO", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    })

    return {
        identity: params.behaviorPrompt,
        soul: SOUL_TEMPLATE,
        tools: params.tools,
        businessInfo: params.businessInfo,
        modelName: params.modelName || "llama-3.3-70b-versatile",
        timestamp: `${timestamp} (America/Bogota)`,
    }
}

/** Exportar el SOUL template para tests */
export { SOUL_TEMPLATE }
