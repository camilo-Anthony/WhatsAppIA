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

## Evolución Arquitectónica (Basada en filosofía Microkernel / ZeroClaw)

Esta sección documenta la decisión arquitectónica de **NO** usar el binario de ZeroClaw, sino adaptar su arquitectura de Microkernel nativamente en nuestro código Node.js/Next.js para mantener control total sobre el SaaS multi-tenant.

### 1. Arquitectura Base (Agent Loop & Módulos)
- [ ] Consolidar la separación estricta: `Channels` (WhatsApp), `Providers` (AI), `Tools` (MCP/Calendar), `Memory` (RAG).
- [ ] Implementar el **Agent Loop** central en `src/lib/ai`:
  - Recibe mensaje de `whatsapp` -> Busca historial en `agent-memory` -> Envía a LLM -> Ejecuta `Tools` (Calendar/MCP) autónomamente -> Retorna a WhatsApp.
- [ ] **Proveedor de IA:** Configurar `gemini-2.5-flash` como motor principal por su límite gratuito de 1 a 2 Millones de tokens (indispensable para pasar esquemas de herramientas y MCP sin errores de "Payload Too Large" que ocurrían con Groq).

### 2. Estrategia de Conexión de WhatsApp (Híbrida)
- [x] **Fase 1 (Actual - Starter/Trial):** Conexión vía Baileys (Código QR). Ideal para onboarding inmediato, pruebas rápidas y planes gratuitos sin fricción técnica para el cliente.
- [ ] **Fase 2 (SaaS Pro - Meta Cloud API):** Integrar **WhatsApp Embedded Signup (Registro Integrado)**.
  - [ ] Añadir botón "Conectar con Facebook" en el Dashboard del cliente.
  - [ ] Implementar flujo OAuth de 3 clics para que el cliente conecte su número oficial sin ir a la consola de desarrolladores de Meta.
  - [ ] Configurar endpoints de Webhooks para Meta y validación criptográfica de firmas (`X-Hub-Signature`).
  - [ ] Aprovechar el nivel **"Unverified Trial" (Tier 0)** de Meta, permitiendo a los clientes lanzar su bot y recibir mensajes inmediatamente tras los 3 clics, sin necesidad de completar la verificación legal de empresa de inmediato.
