/**
 * Security Guardrails
 *
 * Defense-in-depth controls that run outside the model:
 * input normalization, risk scoring, memory filtering, tool policy checks,
 * and response validation.
 */

export type SecurityDecision = "allow" | "sanitize" | "block" | "quarantine"

export interface SecurityAssessment {
    original: string
    sanitized: string
    riskScore: number
    decision: SecurityDecision
    reasons: string[]
    detectedPatterns: string[]
}

export interface OutputValidation {
    allowed: boolean
    sanitized: string
    reasons: string[]
}

export interface ToolPolicyRequest {
    userId: string
    toolName: string
    arguments: Record<string, unknown>
    conversationId?: string
    enabledTools?: unknown
    allowedScopes?: unknown
    isActive?: boolean
    provider?: string
}

export interface ToolPolicyDecision {
    allowed: boolean
    requiresConfirmation: boolean
    reason?: string
    riskScore: number
    sanitizedArguments: Record<string, unknown>
}

export interface MemoryStorageRequest {
    key: string
    value: string
    category?: string
}

export interface MemoryStorageDecision {
    allowed: boolean
    sanitizedKey: string
    sanitizedValue: string
    category: "preference" | "fact" | "general"
    reason?: string
}

interface RiskRule {
    id: string
    reason: string
    pattern: RegExp
    weight: number
    block?: boolean
}

const MAX_INPUT_LENGTH = 2000
const MAX_TOOL_ARGUMENT_LENGTH = 5000
const MAX_MEMORY_KEY_LENGTH = 80
const MAX_MEMORY_VALUE_LENGTH = 1000

const ZERO_WIDTH_PATTERN = /[\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g
const CONTROL_CHARS_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/
const SCRIPT_STYLE_PATTERN = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/i
const BASE64_BLOB_PATTERN = /\b[A-Za-z0-9+/]{160,}={0,2}\b/

const RISK_RULES: RiskRule[] = [
    {
        id: "override_system_rules_es",
        reason: "override de instrucciones del sistema",
        pattern: /\b(ignora|olvida|omite|desobedece|salta|anula|reemplaza)\b.{0,100}\b(instrucciones|reglas|politicas|sistema|prompt|directivas)\b/i,
        weight: 0.55,
        block: true,
    },
    {
        id: "override_system_rules_en",
        reason: "override de instrucciones del sistema",
        pattern: /\b(ignore|forget|bypass|override|discard|replace)\b.{0,100}\b(instructions|rules|system|developer|prompt|policy|policies)\b/i,
        weight: 0.55,
        block: true,
    },
    {
        id: "prompt_extraction_es",
        reason: "intento de extraer prompt o secretos",
        pattern: /\b(revela|muestra|imprime|dime|filtra|expone|entrega)\b.{0,100}\b(prompt|sistema|secreto|clave|token|credencial|api key|password)\b/i,
        weight: 0.6,
        block: true,
    },
    {
        id: "prompt_extraction_en",
        reason: "intento de extraer prompt o secretos",
        pattern: /\b(reveal|show|print|dump|leak|expose|share)\b.{0,100}\b(system prompt|developer prompt|secret|token|credential|api key|password|private key)\b/i,
        weight: 0.6,
        block: true,
    },
    {
        id: "jailbreak_roleplay",
        reason: "jailbreak o cambio de rol privilegiado",
        pattern: /\b(jailbreak|developer mode|modo desarrollador|modo admin|admin mode|sin restricciones|unrestricted|no tienes reglas|no rules)\b/i,
        weight: 0.5,
        block: true,
    },
    {
        id: "personality_hijack",
        reason: "secuestro de personalidad o rol",
        pattern: /\b(actua|pretend|roleplay|haz de cuenta|simula)\b.{0,80}\b(admin|administrador|hacker|sin reglas|developer|system|root)\b/i,
        weight: 0.45,
    },
    {
        id: "tool_hijack",
        reason: "intento de secuestrar herramientas",
        pattern: /\b(delete_user|drop table|rm -rf|exec|shell|run command|ejecuta comando|borra usuarios|elimina usuarios)\b/i,
        weight: 0.65,
        block: true,
    },
    {
        id: "memory_poisoning",
        reason: "intento de envenenar memoria",
        pattern: /\b(recuerda|guardar en memoria|nota_para_memoria|memory note|remember this)\b.{0,120}\b(ignora|override|reglas|instrucciones|system|prompt|siempre entrega)\b/i,
        weight: 0.55,
        block: true,
    },
]

const OUTPUT_SECRET_PATTERNS: RiskRule[] = [
    {
        id: "system_prompt_tag",
        reason: "salida contiene etiquetas internas de prompt",
        pattern: /<\/?(SYSTEM_RULES|CORE_SYSTEM_RULES|SYSTEM_INSTRUCTIONS|PERSONALITY_CONFIG|MEMORY|USER_MESSAGE)\b/i,
        weight: 1,
    },
    {
        id: "secret_env",
        reason: "salida contiene posible secreto o variable sensible",
        pattern: /\b(DATABASE_URL|AUTH_SECRET|NEXTAUTH_SECRET|GROQ_API_KEY|OPENAI_API_KEY|API_KEY|PRIVATE_KEY|PASSWORD)\s*=/i,
        weight: 1,
    },
    {
        id: "internal_prompt_terms",
        reason: "salida intenta revelar instrucciones internas",
        pattern: /\b(prompt interno|instrucciones internas|mis reglas del sistema|system prompt|developer instructions)\b/i,
        weight: 1,
    },
]

const DANGEROUS_TOOL_NAME_PATTERN = /(^|__|\b)(delete_user|drop|truncate|shell|exec|run_command|filesystem|read_secret|get_env|rotate_secret|admin_override)(\b|__|$)/i
const WRITE_TOOL_NAME_PATTERN = /(^|__|\b)(create|update|delete|cancel|send|post|pay|charge|remove|invite|grant|revoke|write)(_|[a-z]|\b)/i

export const SECURITY_REFUSAL_MESSAGE =
    "No puedo compartir configuracion interna, datos privados ni ejecutar instrucciones que intenten manipular reglas o herramientas. Puedo ayudarte con una solicitud normal relacionada con el negocio."

export function stripInvisibleCharacters(value: unknown): string {
    return String(value ?? "")
        .normalize("NFKC")
        .replace(ZERO_WIDTH_PATTERN, "")
        .replace(CONTROL_CHARS_PATTERN, "")
}

export function escapePromptContent(value: unknown, maxLength = MAX_INPUT_LENGTH): string {
    const assessment = sanitizeModelInput(String(value ?? ""), { maxLength, blockThreshold: 1.1 })
    if (assessment.decision === "block" || assessment.decision === "quarantine") {
        return `[contenido no confiable removido: ${assessment.reasons.join(", ")}]`
    }

    return assessment.sanitized
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
}

export function sanitizeModelInput(
    value: unknown,
    options: { maxLength?: number; blockThreshold?: number } = {}
): SecurityAssessment {
    const original = String(value ?? "")
    const maxLength = options.maxLength ?? MAX_INPUT_LENGTH
    const blockThreshold = options.blockThreshold ?? 0.75
    const reasons: string[] = []
    const detectedPatterns: string[] = []
    let riskScore = 0
    let hardBlock = false

    let sanitized = stripInvisibleCharacters(original)

    if (sanitized !== original.normalize("NFKC")) {
        riskScore += 0.35
        reasons.push("caracteres invisibles o de control removidos")
        detectedPatterns.push("hidden_unicode")
    }

    if (HTML_COMMENT_PATTERN.test(sanitized)) {
        riskScore += 0.25
        reasons.push("comentarios HTML removidos")
        detectedPatterns.push("html_comment")
        sanitized = sanitized.replace(/<!--[\s\S]*?-->/g, " ")
    }

    if (SCRIPT_STYLE_PATTERN.test(sanitized)) {
        riskScore += 0.4
        reasons.push("bloques script/style removidos")
        detectedPatterns.push("script_style")
        sanitized = sanitized.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    }

    if (BASE64_BLOB_PATTERN.test(sanitized)) {
        riskScore += 0.25
        reasons.push("bloques codificados removidos")
        detectedPatterns.push("encoded_blob")
        sanitized = sanitized.replace(/\b[A-Za-z0-9+/]{160,}={0,2}\b/g, "[contenido_codificado_removido]")
    }

    sanitized = sanitized.replace(/[ \t]{2,}/g, " ").trim()

    const detectionText = canonicalizeForDetection(sanitized)
    for (const rule of RISK_RULES) {
        if (rule.pattern.test(detectionText)) {
            riskScore += rule.weight
            hardBlock ||= rule.block === true
            reasons.push(rule.reason)
            detectedPatterns.push(rule.id)
        }
    }

    if (sanitized.length > maxLength) {
        riskScore += 0.15
        reasons.push("mensaje truncado por longitud")
        detectedPatterns.push("long_input")
        sanitized = sanitized.slice(0, maxLength).trimEnd()
    }

    riskScore = clampRisk(riskScore)

    let decision: SecurityDecision = "allow"
    if (hardBlock || riskScore >= blockThreshold) {
        decision = "block"
    } else if (riskScore >= 0.35 || sanitized !== original) {
        decision = "sanitize"
    }

    return {
        original,
        sanitized,
        riskScore,
        decision,
        reasons: unique(reasons),
        detectedPatterns: unique(detectedPatterns),
    }
}

export function validateModelOutput(value: unknown): OutputValidation {
    const original = stripInvisibleCharacters(value)
    const reasons: string[] = []

    for (const rule of OUTPUT_SECRET_PATTERNS) {
        if (rule.pattern.test(canonicalizeForDetection(original))) {
            reasons.push(rule.reason)
        }
    }

    if (reasons.length > 0) {
        return {
            allowed: false,
            sanitized: SECURITY_REFUSAL_MESSAGE,
            reasons: unique(reasons),
        }
    }

    return {
        allowed: true,
        sanitized: original.trim(),
        reasons: [],
    }
}

export function authorizeToolCall(request: ToolPolicyRequest): ToolPolicyDecision {
    const sanitizedArguments = sanitizeToolArguments(request.arguments)
    const argsAssessment = sanitizeModelInput(JSON.stringify(sanitizedArguments), {
        maxLength: MAX_TOOL_ARGUMENT_LENGTH,
    })

    if (request.isActive === false) {
        return denyTool("integracion inactiva", argsAssessment.riskScore, sanitizedArguments)
    }

    if (DANGEROUS_TOOL_NAME_PATTERN.test(request.toolName)) {
        return denyTool("herramienta administrativa o peligrosa no permitida", 1, sanitizedArguments)
    }

    if (!isToolEnabled(request.toolName, request.enabledTools)) {
        return denyTool("herramienta no habilitada para este usuario", argsAssessment.riskScore, sanitizedArguments)
    }

    if (argsAssessment.decision === "block") {
        return denyTool(
            `argumentos bloqueados por seguridad: ${argsAssessment.reasons.join(", ")}`,
            argsAssessment.riskScore,
            sanitizedArguments
        )
    }

    if (isWriteTool(request.toolName) && !hasWritePermission(request.allowedScopes)) {
        return denyTool("scope de escritura insuficiente", argsAssessment.riskScore, sanitizedArguments)
    }

    return {
        allowed: true,
        requiresConfirmation: isWriteTool(request.toolName),
        riskScore: argsAssessment.riskScore,
        sanitizedArguments,
    }
}

export function classifyMemoryForStorage(request: MemoryStorageRequest): MemoryStorageDecision {
    const category = normalizeMemoryCategory(request.category)
    const keyAssessment = sanitizeModelInput(request.key, { maxLength: MAX_MEMORY_KEY_LENGTH })
    const valueAssessment = sanitizeModelInput(request.value, { maxLength: MAX_MEMORY_VALUE_LENGTH })

    if (request.category === "instruction") {
        return {
            allowed: false,
            sanitizedKey: keyAssessment.sanitized,
            sanitizedValue: valueAssessment.sanitized,
            category,
            reason: "no se almacenan instrucciones como memoria persistente",
        }
    }

    if (keyAssessment.decision === "block" || valueAssessment.decision === "block") {
        return {
            allowed: false,
            sanitizedKey: keyAssessment.sanitized,
            sanitizedValue: valueAssessment.sanitized,
            category,
            reason: `memoria rechazada por instrucciones sospechosas: ${[
                ...keyAssessment.reasons,
                ...valueAssessment.reasons,
            ].join(", ")}`,
        }
    }

    if (!keyAssessment.sanitized || !valueAssessment.sanitized) {
        return {
            allowed: false,
            sanitizedKey: keyAssessment.sanitized,
            sanitizedValue: valueAssessment.sanitized,
            category,
            reason: "memoria vacia despues de sanitizacion",
        }
    }

    return {
        allowed: true,
        sanitizedKey: keyAssessment.sanitized,
        sanitizedValue: valueAssessment.sanitized,
        category,
    }
}

function canonicalizeForDetection(value: string): string {
    return stripInvisibleCharacters(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
}

function sanitizeToolArguments(args: Record<string, unknown>): Record<string, unknown> {
    return sanitizeJsonValue(args) as Record<string, unknown>
}

function sanitizeJsonValue(value: unknown): unknown {
    if (typeof value === "string") {
        return sanitizeModelInput(value, { maxLength: MAX_INPUT_LENGTH, blockThreshold: 1.1 }).sanitized
    }

    if (Array.isArray(value)) {
        return value.map((item) => sanitizeJsonValue(item))
    }

    if (value && typeof value === "object") {
        const sanitized: Record<string, unknown> = {}
        for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
            const safeKey = sanitizeModelInput(key, {
                maxLength: MAX_MEMORY_KEY_LENGTH,
                blockThreshold: 1.1,
            }).sanitized
            sanitized[safeKey] = sanitizeJsonValue(nestedValue)
        }
        return sanitized
    }

    return value
}

function isToolEnabled(toolName: string, enabledTools: unknown): boolean {
    if (!Array.isArray(enabledTools) || enabledTools.length === 0) return true

    const baseName = getToolBaseName(toolName)
    return enabledTools.some((entry) => {
        if (typeof entry !== "string") return false
        return entry === toolName || entry === baseName || getToolBaseName(entry) === baseName
    })
}

function hasWritePermission(allowedScopes: unknown): boolean {
    if (!Array.isArray(allowedScopes) || allowedScopes.length === 0) return true

    return allowedScopes.some((scope) => {
        if (typeof scope !== "string") return false
        return scope === "*" || scope.endsWith(".write") || scope.includes(":write")
    })
}

function isWriteTool(toolName: string): boolean {
    return WRITE_TOOL_NAME_PATTERN.test(getToolBaseName(toolName))
}

function getToolBaseName(toolName: string): string {
    return toolName.includes("__")
        ? toolName.split("__").slice(1).join("__")
        : toolName
}

function denyTool(
    reason: string,
    riskScore: number,
    sanitizedArguments: Record<string, unknown>
): ToolPolicyDecision {
    return {
        allowed: false,
        requiresConfirmation: false,
        reason,
        riskScore: clampRisk(riskScore || 1),
        sanitizedArguments,
    }
}

function normalizeMemoryCategory(category: string | undefined): "preference" | "fact" | "general" {
    if (category === "preference" || category === "fact") return category
    return "general"
}

function clampRisk(score: number): number {
    return Math.max(0, Math.min(1, Number(score.toFixed(2))))
}

function unique(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean)))
}
