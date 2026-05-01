# Tareas Pendientes — WhatsApp IA

## MCP Remoto vía HTTP (Prioridad Media)

Implementar soporte para servidores MCP remotos usando transporte HTTP/SSE, permitiendo que los clientes conecten sus propios MCP servers.

### Nivel 1 — Built-in (ya implementado)
- [x] Servidores embebidos en `lib/mcp/servers/` (Calendar)
- [x] Ejecución directa sin procesos externos

### Nivel 2 — MCP Remoto vía HTTP (pendiente)
- [ ] Agregar `StreamableHTTPClientTransport` en `mcp-client.ts`
- [ ] Nuevo modelo en Prisma para registrar MCP servers externos del usuario (URL, auth, estado)
- [ ] API `/api/mcp-servers` para CRUD de servidores MCP del usuario
- [ ] Descubrimiento dinámico de herramientas via `listTools()` al conectar un servidor remoto
- [ ] Integrar herramientas descubiertas en `tool-registry.ts` junto a las built-in
- [ ] UI en Integraciones: sección "MCP Personalizado" con campo de URL + test de conexión
- [ ] Las herramientas descubiertas aparecen en Asistente > Herramientas con toggles granulares

### Nivel 3 — Marketplace (futuro)
- [ ] Catálogo de MCP servers oficiales hosteados por la plataforma
- [ ] Instalación con un clic desde la UI
- [ ] Configuración compartida multi-tenant

### Notas técnicas
- Usar HTTP transport en vez de Stdio para evitar procesos en el servidor
- El cliente hostea su MCP server, nosotros solo nos conectamos vía URL
- Validar seguridad: rate limiting, timeout, y sandboxing de respuestas
- Cache de herramientas descubiertas con TTL de 5 min (ya existe en `mcp-client.ts`)
