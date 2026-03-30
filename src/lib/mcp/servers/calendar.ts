/**
 * Google Calendar MCP Server (Built-in)
 * Expone herramientas de calendario como tools MCP.
 */

import type { MCPTool } from "../mcp-client"

// ==========================================
// DEFINICIÓN DE HERRAMIENTAS
// ==========================================

export function getCalendarTools(): MCPTool[] {
    return [
        {
            name: "check_availability",
            description:
                "Consulta la disponibilidad de horarios en el calendario para una fecha específica. Devuelve los bloques de tiempo libre.",
            inputSchema: {
                type: "object",
                properties: {
                    date: {
                        type: "string",
                        description: "Fecha a consultar en formato YYYY-MM-DD",
                    },
                    timezone: {
                        type: "string",
                        description: "Zona horaria (ej: America/Bogota). Por defecto America/Lima",
                    },
                },
                required: ["date"],
            },
        },
        {
            name: "list_events",
            description:
                "Lista los eventos del calendario para un rango de fechas.",
            inputSchema: {
                type: "object",
                properties: {
                    startDate: {
                        type: "string",
                        description: "Fecha de inicio en formato YYYY-MM-DD",
                    },
                    endDate: {
                        type: "string",
                        description: "Fecha de fin en formato YYYY-MM-DD. Si no se especifica, se usa el mismo día.",
                    },
                    timezone: {
                        type: "string",
                        description: "Zona horaria (ej: America/Bogota)",
                    },
                },
                required: ["startDate"],
            },
        },
        {
            name: "create_event",
            description:
                "Crea un nuevo evento o cita en el calendario. Retorna el enlace al evento creado.",
            inputSchema: {
                type: "object",
                properties: {
                    title: {
                        type: "string",
                        description: "Título del evento",
                    },
                    date: {
                        type: "string",
                        description: "Fecha del evento en formato YYYY-MM-DD",
                    },
                    startTime: {
                        type: "string",
                        description: "Hora de inicio en formato HH:MM (24h)",
                    },
                    endTime: {
                        type: "string",
                        description: "Hora de fin en formato HH:MM (24h). Si no se especifica, se asume 1 hora.",
                    },
                    description: {
                        type: "string",
                        description: "Descripción o notas del evento",
                    },
                    attendeeEmail: {
                        type: "string",
                        description: "Email del asistente (opcional)",
                    },
                    timezone: {
                        type: "string",
                        description: "Zona horaria",
                    },
                },
                required: ["title", "date", "startTime"],
            },
        },
        {
            name: "cancel_event",
            description:
                "Cancela un evento del calendario por su ID.",
            inputSchema: {
                type: "object",
                properties: {
                    eventId: {
                        type: "string",
                        description: "ID del evento a cancelar",
                    },
                },
                required: ["eventId"],
            },
        },
    ]
}

// ==========================================
// EJECUCIÓN DE HERRAMIENTAS
// ==========================================

export async function executeCalendarTool(
    toolName: string,
    args: Record<string, unknown>,
    credentials: Record<string, unknown>,
    config: Record<string, unknown> | null
): Promise<string> {
    // Importar googleapis dinámicamente para evitar bundling innecesario
    const { google } = await import("googleapis")

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    )

    oauth2Client.setCredentials({
        access_token: credentials.accessToken as string,
        refresh_token: credentials.refreshToken as string,
    })

    // Manejar token refresh automático
    oauth2Client.on("tokens", (tokens: { access_token?: string | null; refresh_token?: string | null }) => {
        console.log("[Calendar] Token refrescado automáticamente")
        if (tokens.access_token) {
            credentials.accessToken = tokens.access_token
        }
    })

    const calendar = google.calendar({ version: "v3", auth: oauth2Client })
    const calendarId = (config?.calendarId as string) || "primary"
    const defaultTimezone = (config?.timezone as string) || "America/Lima"

    switch (toolName) {
        case "check_availability":
            return await checkAvailability(calendar, calendarId, args, defaultTimezone)
        case "list_events":
            return await listEvents(calendar, calendarId, args, defaultTimezone)
        case "create_event":
            return await createEvent(calendar, calendarId, args, defaultTimezone)
        case "cancel_event":
            return await cancelEvent(calendar, calendarId, args)
        default:
            return `Herramienta "${toolName}" no implementada para Calendar.`
    }
}

// ==========================================
// IMPLEMENTACIÓN DE HERRAMIENTAS
// ==========================================

/* eslint-disable @typescript-eslint/no-explicit-any */

async function checkAvailability(
    calendar: any,
    calendarId: string,
    args: Record<string, unknown>,
    defaultTz: string
): Promise<string> {
    const date = args.date as string
    const timezone = (args.timezone as string) || defaultTz

    const timeMin = `${date}T00:00:00`
    const timeMax = `${date}T23:59:59`

    const response = await calendar.freebusy.query({
        requestBody: {
            timeMin: new Date(`${timeMin}${getOffsetString(timezone)}`).toISOString(),
            timeMax: new Date(`${timeMax}${getOffsetString(timezone)}`).toISOString(),
            timeZone: timezone,
            items: [{ id: calendarId }],
        },
    })

    const busySlots = response.data.calendars?.[calendarId]?.busy || []

    if (busySlots.length === 0) {
        return `El día ${date} está completamente libre. Puedes agendar en cualquier horario.`
    }

    const busyTimes = busySlots
        .map((slot: any) => {
            const start = new Date(slot.start).toLocaleTimeString("es", { timeZone: timezone, hour: "2-digit", minute: "2-digit" })
            const end = new Date(slot.end).toLocaleTimeString("es", { timeZone: timezone, hour: "2-digit", minute: "2-digit" })
            return `${start} - ${end}`
        })
        .join(", ")

    return `Horarios ocupados el ${date}: ${busyTimes}. Los demás horarios están disponibles.`
}

async function listEvents(
    calendar: any,
    calendarId: string,
    args: Record<string, unknown>,
    defaultTz: string
): Promise<string> {
    const startDate = args.startDate as string
    const endDate = (args.endDate as string) || startDate
    const timezone = (args.timezone as string) || defaultTz

    const response = await calendar.events.list({
        calendarId,
        timeMin: new Date(`${startDate}T00:00:00${getOffsetString(timezone)}`).toISOString(),
        timeMax: new Date(`${endDate}T23:59:59${getOffsetString(timezone)}`).toISOString(),
        timeZone: timezone,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 20,
    })

    const events = response.data.items || []

    if (events.length === 0) {
        return `No hay eventos del ${startDate} al ${endDate}.`
    }

    const eventList = events
        .map((event: any) => {
            const start = event.start?.dateTime
                ? new Date(event.start.dateTime).toLocaleTimeString("es", { timeZone: timezone, hour: "2-digit", minute: "2-digit" })
                : "Todo el día"
            return `- ${start}: ${event.summary || "Sin título"} (ID: ${event.id})`
        })
        .join("\n")

    return `Eventos del ${startDate} al ${endDate}:\n${eventList}`
}

async function createEvent(
    calendar: any,
    calendarId: string,
    args: Record<string, unknown>,
    defaultTz: string
): Promise<string> {
    const title = args.title as string
    const date = args.date as string
    const startTime = args.startTime as string
    const timezone = (args.timezone as string) || defaultTz

    // Calcular hora de fin (default: 1 hora después)
    let endTime = args.endTime as string
    if (!endTime) {
        const [hours, minutes] = startTime.split(":").map(Number)
        endTime = `${String(hours + 1).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
    }

    const event = {
        summary: title,
        description: (args.description as string) || undefined,
        start: {
            dateTime: `${date}T${startTime}:00`,
            timeZone: timezone,
        },
        end: {
            dateTime: `${date}T${endTime}:00`,
            timeZone: timezone,
        },
        attendees: args.attendeeEmail ? [{ email: args.attendeeEmail as string }] : undefined,
    }

    const response = await calendar.events.insert({
        calendarId,
        requestBody: event,
    })

    return `Evento creado: "${title}" el ${date} de ${startTime} a ${endTime}. Enlace: ${response.data.htmlLink || "N/A"}`
}

async function cancelEvent(
    calendar: any,
    calendarId: string,
    args: Record<string, unknown>
): Promise<string> {
    const eventId = args.eventId as string

    await calendar.events.delete({
        calendarId,
        eventId,
    })

    return `Evento ${eventId} cancelado exitosamente.`
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ==========================================
// HELPERS
// ==========================================

function getOffsetString(timezone: string): string {
    // Simplificación: para zonas comunes de LATAM
    const offsets: Record<string, string> = {
        "America/Lima": "-05:00",
        "America/Bogota": "-05:00",
        "America/Mexico_City": "-06:00",
        "America/Santiago": "-04:00",
        "America/Buenos_Aires": "-03:00",
        "America/Sao_Paulo": "-03:00",
    }
    return offsets[timezone] || "-05:00"
}
