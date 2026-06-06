export interface StructuredDashboardConfig {
    agentIdentity: string
    mission: string
    toneAndFormat: string
    strictConstraints: string
    toolPrompts?: Record<string, string>
    // Legacy fields for backward compatibility.
    role?: string
    objective?: string
    grammaticalPerson?: string
    tone?: string
    additionalNotes?: string
}

export interface ParsedStructuredDashboardConfig {
    config: StructuredDashboardConfig
    isStructured: boolean
}

export const STRUCTURED_DASHBOARD_CONFIG_MARKER = "STRUCTURED_DASHBOARD_CONFIG_V1"

export const DEFAULT_STRUCTURED_DASHBOARD_CONFIG: StructuredDashboardConfig = {
    agentIdentity: "",
    mission: "",
    toneAndFormat: "",
    strictConstraints: "",
    toolPrompts: {},
}

const MAX_FIELD_LENGTH = 1200
const MAX_LIST_ITEM_LENGTH = 240

export function composeStructuredDashboardConfigPrompt(
    input: Partial<StructuredDashboardConfig>
): string {
    const config = normalizeStructuredDashboardConfig(input)
    return `${STRUCTURED_DASHBOARD_CONFIG_MARKER}\n${JSON.stringify(config, null, 2)}`
}

export function parseStructuredDashboardConfigPrompt(value: string): ParsedStructuredDashboardConfig {
    const raw = String(value ?? "").trim()

    if (!raw.includes(STRUCTURED_DASHBOARD_CONFIG_MARKER)) {
        return {
            config: normalizeStructuredDashboardConfig({
                ...DEFAULT_STRUCTURED_DASHBOARD_CONFIG,
                mission: raw,
            }),
            isStructured: false,
        }
    }

    const jsonStart = raw.indexOf("{")
    const jsonEnd = raw.lastIndexOf("}")

    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
        return {
            config: DEFAULT_STRUCTURED_DASHBOARD_CONFIG,
            isStructured: false,
        }
    }

    try {
        const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as Partial<StructuredDashboardConfig>
        return {
            config: normalizeStructuredDashboardConfig(parsed),
            isStructured: true,
        }
    } catch {
        return {
            config: DEFAULT_STRUCTURED_DASHBOARD_CONFIG,
            isStructured: false,
        }
    }
}

export function normalizeStructuredDashboardConfig(
    input: Partial<StructuredDashboardConfig>
): StructuredDashboardConfig {
    const legacyIdentity = sanitizeText((input as Record<string, unknown>).displayName)
    const legacyObjective = sanitizeText((input as Record<string, unknown>).authorizedScope)
    const legacyNotes = sanitizeText((input as Record<string, unknown>).fallbackBehavior)
    const legacyStyle = sanitizeText((input as Record<string, unknown>).responseStyle)

    const mission =
        sanitizeText(input.mission) ||
        sanitizeText(input.objective) ||
        legacyObjective ||
        sanitizeText(input.role)
    const grammaticalPersonDesc = input.grammaticalPerson
        ? ` Persona gramatical recomendada: ${input.grammaticalPerson}.`
        : ""
    const toneAndFormat = sanitizeText(input.toneAndFormat) ||
        (sanitizeText(input.tone) ? `${sanitizeText(input.tone)}.${grammaticalPersonDesc}` : "")
    const strictConstraints =
        sanitizeText(input.strictConstraints) ||
        sanitizeText(input.additionalNotes) ||
        legacyNotes ||
        legacyStyle

    return {
        agentIdentity: sanitizeText(input.agentIdentity) || legacyIdentity,
        mission,
        toneAndFormat,
        strictConstraints,
        toolPrompts: input.toolPrompts || {},
    }
}

export function parseTextareaList(value: string): string[] {
    return String(value ?? "")
        .split(/\r?\n/)
        .map((item) => sanitizeText(item, MAX_LIST_ITEM_LENGTH))
        .filter(Boolean)
}

export function formatTextareaList(items: string[]): string {
    return sanitizeList(items).join("\n")
}

export function getStructuredDashboardSummary(value: string): string {
    const { config } = parseStructuredDashboardConfigPrompt(value)
    return (
        config.mission ||
        config.agentIdentity ||
        config.toneAndFormat ||
        "Sin comportamiento configurado"
    )
}

function sanitizeList(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value
        .map((item) => sanitizeText(item, MAX_LIST_ITEM_LENGTH))
        .filter(Boolean)
        .slice(0, 30)
}

function sanitizeText(value: unknown, maxLength = MAX_FIELD_LENGTH): string {
    return String(value ?? "")
        .normalize("NFKC")
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "")
        .replace(/[ \t]{2,}/g, " ")
        .trim()
        .slice(0, maxLength)
}
