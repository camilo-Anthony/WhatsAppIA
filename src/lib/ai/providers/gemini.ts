/**
 * Proveedor de IA — Google Gen AI SDK (Gemini)
 * Soporta chat completions + tool calling para el loop agéntico.
 */

import { GoogleGenAI, Content, Part, Tool } from "@google/genai"
import { AIMessage, AIToolCall, AIToolDefinition, AIResponse } from "./groq"

let ai: GoogleGenAI;

export function getGeminiClient() {
    if (!ai) {
        // En .env suele estar como GEMINI_API_KEY o GOOGLE_API_KEY
        const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        ai = new GoogleGenAI({ apiKey });
    }
    return ai;
}

/**
 * Genera respuestas usando la API de Gemini (SDK oficial moderno @google/genai)
 */
export async function generateGeminiResponse(
    messages: AIMessage[],
    options?: {
        temperature?: number
        maxTokens?: number
        model?: string
        tools?: AIToolDefinition[]
        apiKey?: string
    }
): Promise<AIResponse> {
    const {
        temperature = 0.7,
        maxTokens = 2048,
        model = process.env.GEMINI_MODEL || "gemini-2.5-flash",
        tools,
        apiKey,
    } = options || {}

    try {
        const client = apiKey ? new GoogleGenAI({ apiKey }) : getGeminiClient();

        // 1. Extraer system instruction
        let systemInstruction = "";
        const systemMessage = messages.find(m => m.role === "system");
        if (systemMessage && systemMessage.content) {
            systemInstruction = systemMessage.content;
        }

        // 2. Mapear mensajes de historial
        const contents: Content[] = [];

        for (const m of messages) {
            if (m.role === "system") continue;

            const parts: Part[] = [];

            if (m.role === "user") {
                parts.push({ text: m.content || "" });
                contents.push({ role: "user", parts });
            } else if (m.role === "assistant") {
                if (m.content) {
                    parts.push({ text: m.content });
                }
                if (m.tool_calls && m.tool_calls.length > 0) {
                    for (const tc of m.tool_calls) {
                        let parsedArgs = {};
                        try {
                            parsedArgs = JSON.parse(tc.function.arguments);
                        } catch {
                            parsedArgs = {};
                        }
                        parts.push({
                            functionCall: {
                                name: tc.function.name,
                                args: parsedArgs,
                            }
                        });
                    }
                }
                contents.push({ role: "model", parts });
            } else if (m.role === "tool") {
                // Las respuestas de herramientas van como role "user" con functionResponse en Gemini
                let parsedResponse = {};
                try {
                    parsedResponse = JSON.parse(m.content || "{}");
                } catch {
                    parsedResponse = { result: m.content };
                }

                // Intentamos emparejar con el nombre de la herramienta.
                // Buscamos el nombre de la función en la lista de tools o usamos el ID/nombre
                // Si la respuesta no es un objeto estructurado, la envolvemos
                const functionResponseObject = typeof parsedResponse === "object" && parsedResponse !== null
                    ? parsedResponse
                    : { result: parsedResponse };

                parts.push({
                    functionResponse: {
                        name: m.tool_call_id || "tool_result",
                        response: functionResponseObject as Record<string, any>,
                    }
                });
                contents.push({ role: "user", parts });
            }
        }

        // 3. Mapear herramientas (tools)
        const geminiTools: Tool[] = [];
        if (tools && tools.length > 0) {
            const functionDeclarations = tools.map(t => {
                // Asegurarse de que los parámetros cumplan con el esquema OpenAPI que Gemini requiere
                const parameters = t.function.parameters as any;
                
                // Gemini requiere type object para los parámetros y que contenga properties
                if (parameters && !parameters.type) {
                    parameters.type = "OBJECT";
                }
                
                return {
                    name: t.function.name,
                    description: t.function.description,
                    parameters: parameters,
                };
            });
            geminiTools.push({ functionDeclarations });
        }

        // 4. Llamada al modelo
        const response = await client.models.generateContent({
            model,
            contents,
            config: {
                systemInstruction: systemInstruction || undefined,
                temperature,
                maxOutputTokens: maxTokens,
                tools: geminiTools.length > 0 ? geminiTools : undefined,
            }
        });

        // 5. Procesar respuesta del modelo
        const candidate = response.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        
        let textContent = "";
        const toolCalls: AIToolCall[] = [];

        for (const part of parts) {
            if (part.text) {
                textContent += part.text;
            }
            if (part.functionCall) {
                const fc = part.functionCall;
                toolCalls.push({
                    id: (fc.name || "call") + "_" + Math.random().toString(36).substr(2, 9),
                    type: "function",
                    function: {
                        name: fc.name || "",
                        arguments: JSON.stringify(fc.args || {}),
                    }
                });
            }
        }

        // 6. Tokens utilizados
        // El SDK nuevo retorna metadata de uso
        const promptTokens = response.usageMetadata?.promptTokenCount || 0;
        const candidatesTokens = response.usageMetadata?.candidatesTokenCount || 0;
        const totalTokens = response.usageMetadata?.totalTokenCount || 0;

        return {
            content: textContent || null,
            toolCalls,
            tokensUsed: {
                prompt: promptTokens,
                completion: candidatesTokens,
                total: totalTokens,
            }
        };

    } catch (error: unknown) {
        console.error("Gemini API error:", error);
        const errMsg = error instanceof Error ? error.message : String(error);
        if (errMsg.includes("429") || errMsg.toLowerCase().includes("quota")) {
            throw new Error("RATE_LIMITED");
        }
        throw new Error("AI_ERROR");
    }
}
