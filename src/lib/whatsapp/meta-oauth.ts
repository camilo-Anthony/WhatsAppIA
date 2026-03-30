/**
 * Meta OAuth Helpers
 * Gestiona el flujo de Embedded Signup / Login de Meta
 * para que los clientes autoricen su WABA.
 */

const META_API_VERSION = process.env.META_API_VERSION || "v21.0"
const META_APP_ID = process.env.META_APP_ID || ""
const META_APP_SECRET = process.env.META_APP_SECRET || ""
const GRAPH_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

// ==========================================
// TIPOS
// ==========================================

export interface MetaTokenResponse {
    access_token: string
    token_type: string
    expires_in?: number
}

export interface MetaWABA {
    id: string
    name: string
    currency: string
    timezone_id: string
}

export interface MetaPhoneNumber {
    id: string
    display_phone_number: string
    verified_name: string
    quality_rating: string
}

// ==========================================
// FLUJO OAUTH
// ==========================================

/**
 * Genera la URL de login de Meta para el Embedded Signup.
 * El usuario será redirigido aquí para autorizar la app.
 */
export function getMetaLoginUrl(state: string, redirectUri: string): string {
    if (!META_APP_ID) {
        throw new Error("META_APP_ID no está configurado")
    }

    const params = new URLSearchParams({
        client_id: META_APP_ID,
        redirect_uri: redirectUri,
        state,
        scope: "whatsapp_business_management,whatsapp_business_messaging,business_management",
        response_type: "code",
        config_id: "", // Se puede configurar con el Config ID del Embedded Signup
    })

    // Eliminar config_id vacío si no se usa
    if (!params.get("config_id")) {
        params.delete("config_id")
    }

    return `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?${params.toString()}`
}

/**
 * Intercambia el código de autorización por un token de acceso.
 */
export async function exchangeCodeForToken(
    code: string,
    redirectUri: string
): Promise<MetaTokenResponse> {
    if (!META_APP_ID || !META_APP_SECRET) {
        throw new Error("META_APP_ID o META_APP_SECRET no configurados")
    }

    const params = new URLSearchParams({
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        redirect_uri: redirectUri,
        code,
    })

    const response = await fetch(
        `${GRAPH_API_BASE}/oauth/access_token?${params.toString()}`
    )

    if (!response.ok) {
        const error = await response.json()
        throw new Error(`Error al intercambiar código: ${JSON.stringify(error)}`)
    }

    return response.json()
}

/**
 * Intercambia un token de corta duración por uno de larga duración (60 días).
 */
export async function getLongLivedToken(
    shortLivedToken: string
): Promise<MetaTokenResponse> {
    const params = new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        fb_exchange_token: shortLivedToken,
    })

    const response = await fetch(
        `${GRAPH_API_BASE}/oauth/access_token?${params.toString()}`
    )

    if (!response.ok) {
        const error = await response.json()
        throw new Error(`Error al obtener token largo: ${JSON.stringify(error)}`)
    }

    return response.json()
}

// ==========================================
// CONSULTAS DE WABA Y NÚMEROS
// ==========================================

/**
 * Lista WABAs a los que el usuario dio acceso.
 */
export async function getConnectedWABAs(
    accessToken: string
): Promise<MetaWABA[]> {
    const response = await fetch(
        `${GRAPH_API_BASE}/me/businesses?fields=id,name&access_token=${accessToken}`
    )

    if (!response.ok) {
        const error = await response.json()
        throw new Error(`Error al obtener negocios: ${JSON.stringify(error)}`)
    }

    const data = await response.json()
    const businesses = data.data || []

    // Para cada negocio, obtener sus WABAs
    const wabas: MetaWABA[] = []
    for (const business of businesses) {
        const wabaRes = await fetch(
            `${GRAPH_API_BASE}/${business.id}/owned_whatsapp_business_accounts?fields=id,name,currency,timezone_id&access_token=${accessToken}`
        )
        if (wabaRes.ok) {
            const wabaData = await wabaRes.json()
            wabas.push(...(wabaData.data || []))
        }
    }

    return wabas
}

/**
 * Lista los números de teléfono bajo un WABA.
 */
export async function getPhoneNumbers(
    wabaId: string,
    accessToken: string
): Promise<MetaPhoneNumber[]> {
    const response = await fetch(
        `${GRAPH_API_BASE}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating&access_token=${accessToken}`
    )

    if (!response.ok) {
        const error = await response.json()
        throw new Error(`Error al obtener números: ${JSON.stringify(error)}`)
    }

    const data = await response.json()
    return data.data || []
}
