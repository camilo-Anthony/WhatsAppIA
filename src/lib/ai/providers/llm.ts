/**
 * Proveedor Unificado de LLM con Rotación de API Keys y Fallback Automático
 * Soporta Gemini, Groq, Mistral, OpenRouter, NVIDIA, Cerebras y GitHub Models.
 */

import { generateResponse as generateGroqResponse, AIMessage, AIToolDefinition, AIResponse } from "./groq"
import { generateGeminiResponse } from "./gemini"
import { generateOpenAICompatibleResponse } from "./openai-compatible"

export type { AIMessage, AIToolCall, AIToolDefinition, AIResponse } from "./groq"

// Índices en memoria para el balanceo round-robin por proveedor
const keyIndices: Record<string, number> = {
    gemini: 0,
    groq: 0,
    mistral: 0,
    openrouter: 0,
    nvidia: 0,
    cerebras: 0,
    github: 0
}

/**
 * Obtiene el listado de API keys configuradas para un proveedor
 */
function getApiKeysForProvider(provider: string): string[] {
    let keysStr = ""
    if (provider === "gemini") {
        keysStr = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ""
    } else if (provider === "groq") {
        keysStr = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || ""
    } else if (provider === "mistral") {
        keysStr = process.env.MISTRAL_API_KEYS || process.env.MISTRAL_API_KEY || ""
    } else if (provider === "openrouter") {
        keysStr = process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || ""
    } else if (provider === "nvidia") {
        keysStr = process.env.NVIDIA_API_KEYS || process.env.NVIDIA_API_KEY || ""
    } else if (provider === "cerebras") {
        keysStr = process.env.CEREBRAS_API_KEYS || process.env.CEREBRAS_API_KEY || ""
    } else if (provider === "github") {
        keysStr = process.env.GITHUB_API_KEYS || process.env.GITHUB_API_KEY || ""
    }

    return keysStr.split(",").map(k => k.trim()).filter(Boolean)
}

/**
 * Obtiene la siguiente API key del pool round-robin para el proveedor
 */
function getNextApiKey(provider: string, keys: string[]): string {
    const idx = keyIndices[provider] % keys.length
    keyIndices[provider] = (idx + 1) % keys.length
    return keys[idx]
}

/**
 * Mapea y selecciona el modelo adecuado para cada proveedor en base al modelo solicitado
 */
function resolveModelForProvider(requestedModel: string | undefined, provider: string): string {
    const isLarge = requestedModel && (
        requestedModel.includes("70b") ||
        requestedModel.includes("pro") ||
        requestedModel.includes("large") ||
        requestedModel.includes("rplus") ||
        requestedModel.includes("72b") ||
        requestedModel.includes("gpt-4")
    )
    const isCoder = requestedModel && requestedModel.includes("coder")

    if (provider === "gemini") {
        return process.env.GEMINI_MODEL || "gemini-2.5-flash"
    }
    if (provider === "groq") {
        if (isCoder) return "qwen-2.5-coder-32b"
        if (isLarge) return "llama-3.3-70b-versatile"
        return process.env.GROQ_MODEL || "llama-3.1-8b-instant"
    }
    if (provider === "mistral") {
        if (isCoder) return "codestral-latest"
        if (isLarge) return "mistral-large-latest"
        return process.env.MISTRAL_MODEL || "open-mistral-nemo"
    }
    if (provider === "openrouter") {
        if (isLarge) return "qwen/qwen-2.5-72b-instruct:free"
        return process.env.OPENROUTER_MODEL || "meta-llama/llama-3-8b-instruct:free"
    }
    if (provider === "nvidia") {
        if (isLarge) return "meta/llama-3.3-70b-instruct"
        return process.env.NVIDIA_MODEL || "meta/llama-3.1-8b-instruct"
    }
    if (provider === "cerebras") {
        if (isLarge) return "llama3.1-70b"
        return process.env.CEREBRAS_MODEL || "llama3.1-8b"
    }
    if (provider === "github") {
        if (isLarge) return "gpt-4o"
        return process.env.GITHUB_MODEL || "gpt-4o-mini"
    }
    return requestedModel || ""
}

/**
 * Modelos que preservan el tono configurado en el system prompt.
 *
 * Fix #2: La rotacion original cae a modelos 8B / free tier cuando Gemini falla.
 * Esos modelos tienden a IGNORE el system prompt y responder con tono default.
 *
 * Solucion: clasificar el request por nivel de exigencia tonal:
 *  - "response": respuesta directa al usuario (tool result o chat libre). Requiere
 *    modelos 70B+ o Gemini 2.5 Flash+ que respeten el tono del dashboard.
 *  - "classifier": clasificacion de intent / extraccion de slots. Solo importa
 *    que devuelva JSON valido. Modelos 8B son aceptables.
 *
 * Los tiers se configuran por env: AI_RESPONSE_TIER y AI_CLASSIFIER_TIER (CSV provs).
 */
const RESPONSE_TIER_PROVIDERS: string[] = (process.env.AI_RESPONSE_TIER || "groq,gemini,mistral,github")
    .split(",").map(p => p.trim().toLowerCase()).filter(Boolean)
const CLASSIFIER_TIER_PROVIDERS: string[] = (process.env.AI_CLASSIFIER_TIER || "groq,gemini,mistral,openrouter,nvidia,cerebras,github")
    .split(",").map(p => p.trim().toLowerCase()).filter(Boolean)

/**
 * Determina si el request actual es de "respuesta tonal" (request sensible)
 * o de "classifier" (request barato).
 *
 * Heuristica: presence de `tools` en opciones indica respuesta con tool result;
 * maxTokens pequeno (<=300) indica clasificador JSON; otherwise es response.
 */
function isTonalResponseRequest(options?: { temperature?: number; maxTokens?: number; model?: string; tools?: AIToolDefinition[] }): boolean {
    if (!options) return true // default: response
    if (options.tools && options.tools.length > 0) return true // tool result respuesta
    if (options.maxTokens && options.maxTokens <= 300) return false // classifier JSON
    return true
}

/**
 * Genera respuesta de LLM implementando rotación de claves y fallback de proveedores
 */
export async function generateResponse(
    messages: AIMessage[],
    options?: {
        temperature?: number
        maxTokens?: number
        model?: string
        tools?: AIToolDefinition[]
    }
): Promise<AIResponse> {
    // 1. Elegir tier segun el tipo de request (Fix #2)
    const tonal = isTonalResponseRequest(options)
    const tierProviders = tonal ? RESPONSE_TIER_PROVIDERS : CLASSIFIER_TIER_PROVIDERS

    // Backward-compat: si un override explicito AI_ROTATION_ORDER/AI_PROVIDER esta
    // seteado, lo usamos para ambos tiers (mantiene deployments existentes).
    const fallbackOrderStr = process.env.AI_ROTATION_ORDER || process.env.AI_PROVIDER || "groq,gemini,mistral,openrouter,nvidia,cerebras,github"
    const fallbackProviders = fallbackOrderStr.split(",").map(p => p.trim().toLowerCase()).filter(Boolean)
    const providers = tierProviders.length > 0 ? tierProviders : fallbackProviders

    // Log para observabilidad del tier elegido
    console.log(`[LLM Rotator] tier=${tonal ? "response" : "classifier"} providers=${providers.join(",")}`)

    const errors: string[] = []

    // 2. Intentar secuencialmente por cada proveedor configurado
    for (const provider of providers) {
        const keys = getApiKeysForProvider(provider)
        if (keys.length === 0) {
            continue
        }

        const resolvedModel = resolveModelForProvider(options?.model, provider)
        const providerOptions = {
            ...options,
            model: resolvedModel
        }

        // 3. Rotar claves dentro del proveedor actual
        // Hacemos tantos intentos como claves tenga ese proveedor para probar todas antes de cambiar de proveedor
        for (let attempt = 0; attempt < keys.length; attempt++) {
            const apiKey = getNextApiKey(provider, keys)
            console.log(`[LLM Rotator] Intentando con proveedor: ${provider} (Modelo: ${resolvedModel}, Key index: ${keyIndices[provider]})`)

            try {
                if (provider === "gemini") {
                    return await generateGeminiResponse(messages, { ...providerOptions, apiKey })
                } else if (provider === "groq") {
                    return await generateGroqResponse(messages, { ...providerOptions, apiKey })
                } else if (provider === "mistral") {
                    return await generateOpenAICompatibleResponse(
                        messages,
                        { ...providerOptions, model: resolvedModel },
                        { apiKey, baseUrl: "https://api.mistral.ai/v1" }
                    )
                } else if (provider === "openrouter") {
                    return await generateOpenAICompatibleResponse(
                        messages,
                        { ...providerOptions, model: resolvedModel },
                        { apiKey, baseUrl: "https://openrouter.ai/api/v1" }
                    )
                } else if (provider === "nvidia") {
                    return await generateOpenAICompatibleResponse(
                        messages,
                        { ...providerOptions, model: resolvedModel },
                        { apiKey, baseUrl: "https://integrate.api.nvidia.com/v1" }
                    )
                } else if (provider === "cerebras") {
                    return await generateOpenAICompatibleResponse(
                        messages,
                        { ...providerOptions, model: resolvedModel },
                        { apiKey, baseUrl: "https://api.cerebras.ai/v1" }
                    )
                } else if (provider === "github") {
                    return await generateOpenAICompatibleResponse(
                        messages,
                        { ...providerOptions, model: resolvedModel },
                        { apiKey, baseUrl: "https://models.inference.ai.azure.com" }
                    )
                }
            } catch (error: any) {
                const errMsg = error?.message || String(error)
                console.warn(`[LLM Rotator] Falló intento en '${provider}': ${errMsg}`)
                errors.push(`${provider} (intento ${attempt + 1}): ${errMsg}`)
                // Si falla, el bucle continúa con la siguiente clave o proveedor
            }
        }
    }

    // 4. Si todos los proveedores fallan
    console.error("[LLM Rotator] Todos los proveedores y claves fallaron:", errors)
    throw new Error(`AI_ROTATION_FAILED: Todos los proveedores configurados fallaron. Errores: ${errors.join("; ")}`)
}
