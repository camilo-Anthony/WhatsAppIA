/**
 * Registro de Números de Teléfono
 * Permite registrar números de clientes dentro del WABA
 * administrado por la plataforma.
 */

const META_API_VERSION = process.env.META_API_VERSION || "v21.0"
const META_WABA_ID = process.env.META_WABA_ID || ""
const META_WA_PHONE_ID = process.env.META_WA_PHONE_ID || ""
const GRAPH_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

/**
 * Obtiene el token del sistema de la plataforma.
 * En producción, este debería ser un System User Token de la app de Meta.
 */
function getPlatformToken(): string {
    const token = process.env.META_PLATFORM_TOKEN || process.env.META_APP_SECRET || ""
    if (!token) {
        throw new Error("META_PLATFORM_TOKEN no está configurado")
    }
    return token
}

// ==========================================
// TIPOS
// ==========================================

export interface PhoneRegistrationResult {
    phoneNumberId: string
    phoneNumber: string
}

export interface VerificationResult {
    success: boolean
    phoneNumberId: string
}

// ==========================================
// REGISTRO
// ==========================================

/**
 * Registra un número de teléfono en el WABA de la plataforma.
 * Retorna el ID del número registrado.
 */
export async function registerPhoneNumber(
    phoneNumber: string,
    displayName: string
): Promise<PhoneRegistrationResult> {
    if (!META_WABA_ID) {
        throw new Error("META_WABA_ID no está configurado")
    }

    const token = getPlatformToken()
    const url = `${GRAPH_API_BASE}/${META_WABA_ID}/phone_numbers`

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            cc: phoneNumber.replace(/\D/g, "").substring(0, 3), // Country code
            phone_number: phoneNumber.replace(/\D/g, ""),
            verified_name: displayName,
        }),
    })

    if (!response.ok) {
        const error = await response.json()
        throw new Error(`Error al registrar número: ${JSON.stringify(error)}`)
    }

    const data = await response.json()
    return {
        phoneNumberId: data.id,
        phoneNumber: phoneNumber,
    }
}

/**
 * Solicita un código de verificación para el número registrado.
 * @param method - "SMS" o "VOICE"
 */
export async function requestVerificationCode(
    phoneNumberId: string,
    method: "SMS" | "VOICE" = "SMS",
    language: string = "es"
): Promise<{ success: boolean }> {
    const token = getPlatformToken()
    const id = phoneNumberId || META_WA_PHONE_ID
    const url = `${GRAPH_API_BASE}/${id}/request_code`

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            code_method: method,
            language,
        }),
    })

    if (!response.ok) {
        const error = await response.json()
        throw new Error(`Error al solicitar código: ${JSON.stringify(error)}`)
    }

    const data = await response.json()
    return { success: data.success === true }
}

/**
 * Verifica el código enviado al número de teléfono.
 */
export async function verifyCode(
    phoneNumberId: string,
    code: string
): Promise<VerificationResult> {
    const token = getPlatformToken()
    const id = phoneNumberId || META_WA_PHONE_ID
    const url = `${GRAPH_API_BASE}/${id}/verify_code`

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
    })

    if (!response.ok) {
        const error = await response.json()
        throw new Error(`Error al verificar código: ${JSON.stringify(error)}`)
    }

    const data = await response.json()
    return {
        success: data.success === true,
        phoneNumberId: id,
    }
}

/**
 * Registra el número en la Cloud API después de verificarlo.
 * Este paso es necesario para poder enviar/recibir mensajes.
 */
export async function registerNumberForMessaging(
    phoneNumberId: string
): Promise<{ success: boolean }> {
    const token = getPlatformToken()
    const id = phoneNumberId || META_WA_PHONE_ID
    const url = `${GRAPH_API_BASE}/${id}/register`

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            pin: "123456", // PIN for 2FA — should be configurable
        }),
    })

    if (!response.ok) {
        const error = await response.json()
        throw new Error(`Error al registrar para mensajería: ${JSON.stringify(error)}`)
    }

    const data = await response.json()
    return { success: data.success === true }
}
