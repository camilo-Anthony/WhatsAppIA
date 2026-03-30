/**
 * WhatsApp Cloud API Client
 * Wrapper para la API oficial de WhatsApp Cloud de Meta.
 */

const META_API_VERSION = process.env.META_API_VERSION || "v21.0"
const GRAPH_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

// ==========================================
// TIPOS
// ==========================================

export interface CloudAPIMessageResponse {
    messaging_product: string
    contacts: Array<{ input: string; wa_id: string }>
    messages: Array<{ id: string }>
}

export interface CloudAPIPhoneNumber {
    id: string
    display_phone_number: string
    verified_name: string
    quality_rating: string
    code_verification_status?: string
}

export interface CloudAPIError {
    error: {
        message: string
        type: string
        code: number
        error_subcode?: number
        fbtrace_id?: string
    }
}

// ==========================================
// FUNCIONES DE ENVÍO
// ==========================================

/**
 * Envía un mensaje de texto mediante la Cloud API.
 */
export async function sendTextMessage(
    phoneNumberId: string,
    accessToken: string,
    recipientPhone: string,
    text: string
): Promise<CloudAPIMessageResponse> {
    const url = `${GRAPH_API_BASE}/${phoneNumberId}/messages`

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: recipientPhone,
            type: "text",
            text: { body: text },
        }),
    })

    if (!response.ok) {
        const error: CloudAPIError = await response.json()
        console.error("[Cloud API] Error sending message:", error)
        throw new Error(`Cloud API Error: ${error.error.message}`)
    }

    return response.json()
}

/**
 * Marca un mensaje como leído.
 */
export async function markAsRead(
    phoneNumberId: string,
    accessToken: string,
    messageId: string
): Promise<void> {
    const url = `${GRAPH_API_BASE}/${phoneNumberId}/messages`

    await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            status: "read",
            message_id: messageId,
        }),
    })
}

// ==========================================
// FUNCIONES DE CONSULTA
// ==========================================

/**
 * Obtiene información del número de teléfono.
 */
export async function getPhoneNumberInfo(
    phoneNumberId: string,
    accessToken: string
): Promise<CloudAPIPhoneNumber> {
    const url = `${GRAPH_API_BASE}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`

    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
        const error: CloudAPIError = await response.json()
        throw new Error(`Cloud API Error: ${error.error.message}`)
    }

    return response.json()
}

/**
 * Obtiene el perfil de negocio asociado al número.
 */
export async function getBusinessProfile(
    phoneNumberId: string,
    accessToken: string
): Promise<Record<string, unknown>> {
    const url = `${GRAPH_API_BASE}/${phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`

    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
        const error: CloudAPIError = await response.json()
        throw new Error(`Cloud API Error: ${error.error.message}`)
    }

    const data = await response.json()
    return data.data?.[0] || {}
}
