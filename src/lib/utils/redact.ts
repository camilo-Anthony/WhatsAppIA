/**
 * Redacta información sensible para logs.
 * Convierte "+573001234567" → "+57***4567"
 * Convierte "573001234567@s.whatsapp.net" → "57***4567@s.whatsapp.net"
 */
export function redactPhone(phone: string): string {
    if (!phone) return "[unknown]"

    // Handle JID format (573001234567@s.whatsapp.net)
    const jidMatch = phone.match(/^(\d+)(@.+)$/)
    if (jidMatch) {
        const digits = jidMatch[1]
        const suffix = jidMatch[2]
        if (digits.length > 4) {
            return `${digits.slice(0, 2)}***${digits.slice(-4)}${suffix}`
        }
        return `***${digits}${suffix}`
    }

    // Handle plain phone (+573001234567 or 573001234567)
    const cleaned = phone.replace(/[^\d+]/g, "")
    if (cleaned.length > 6) {
        const prefix = cleaned.startsWith("+") ? cleaned.slice(0, 3) : cleaned.slice(0, 2)
        return `${prefix}***${cleaned.slice(-4)}`
    }
    return "***"
}
