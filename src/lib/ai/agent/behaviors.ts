/**
 * Comportamientos Modulares del Agente
 * 
 * Contiene preestablecidos de instrucciones de comportamiento
 * que se inyectan en el prompt del sistema únicamente si
 * la herramienta correspondiente está activa.
 */

export const TOOL_BEHAVIORS: Record<string, string> = {
    "google_calendar__create_event": `
### Comportamiento: Agendamiento de Citas
- Para agendar una cita o evento, **DEBES** obtener obligatoriamente: Fecha, Hora y Motivo.
- Si faltan datos, pide **SOLO UN DATO A LA VEZ** para no abrumar al usuario.
- NUNCA asumas fechas relativas sin verificar. Si el usuario dice "mañana", confirma el día exacto (ej: "Perfecto, mañana martes 15. ¿A qué hora?").
- Una vez tengas todos los datos necesarios, **SIEMPRE** muestra un resumen y pide confirmación explícita (Sí/No) antes de agendar.
- Si el usuario dice "cancelar", "ya no" o "me equivoqué" durante la recolección de datos, aborta el agendamiento y pregúntale cómo más le puedes ayudar.
`,
    "google_calendar__check_availability": `
### Comportamiento: Consulta de Disponibilidad
- Para revisar disponibilidad, debes pedirle al usuario el día específico o rango de tiempo que desea consultar.
- Sé claro al mostrar los horarios disponibles. Si no hay disponibilidad, ofrécele alternativas cercanas.
`,
    // Podemos agregar más módulos aquí conforme agreguemos más herramientas
}
