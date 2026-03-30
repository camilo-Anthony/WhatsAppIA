---
name: design-preferences
description: Enforce a clean, professional design without emojis or gradients.
---

# Preferencias de Diseño Rigurosas (UI & Texto)

Esta skill establece las reglas fundamentales de diseño visual y comunicación escrita para todo el proyecto.

## 1. Prohibición Absoluta de Emojis
**NUNCA uses emojis** en ninguna parte del código, interfaz o comunicación:
- ❌ INCORRECTO: `<h1>¡Bienvenido! 👋</h1>`, `console.log("Servidor listo 🚀")`, `// TODO: Arreglar bug 🐛`
- ✅ CORRECTO: `<h1>Bienvenido</h1>`, `console.log("Servidor listo - OK")`, `// TODO: Arreglar bug - Critico`
- No uses emojis en mensajes de commit, documentación, comentarios de código, ni en la interfaz de usuario (textos, botones, alertas).
- Si necesitas un recurso visual, usa iconos SVG limpios (ej. Lucide, Heroicons, o iconos nativos).

## 2. Prohibición Absoluta de Degradados (Gradients)
**NUNCA uses fondos, textos o bordes con degradados (`linear-gradient`, `radial-gradient`, etc.)**:
- ❌ INCORRECTO: `background: linear-gradient(135deg, #6366f1, #4f46e5);`, `background-clip: text;`
- ✅ CORRECTO: `background-color: #4f46e5;`, `color: #4f46e5;`
- Usa colores sólidos y planos.
- Mantén un estilo corporativo, flat y profesional.
- Si necesitas jerarquía visual, usa sombras sutiles (box-shadow) o variaciones de opacidad y contraste en colores sólidos, no degradados.

## Cuándo aplicar esta skill
- Al escribir código CSS o crear componentes UI (React/Next.js).
- Al redactar textos, copys, notificaciones o mensajes del sistema.
- Al escribir documentación o logs en consola.
