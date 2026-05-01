# Agent Skills - Guía Maestra

29 skills organizados en 4 categorías para selección contextual automática.

---

## 🤖 Selección Automática por Proyecto

### Next.js / React / Web App
```
✅ Universal (todos los 16)
✅ Web/Frontend (todos los 7)
✅ docker-expert, sql-optimization-patterns (si hay DB)
```

### Backend (Go/Python/Node/PHP)
```
✅ Universal (todos los 16)
✅ DevOps/Tooling (todos los 4)
❌ Web/Frontend (no aplicables)
```

### CLI / Scripts / Tools
```
✅ Universal (todos los 16)
❌ Web/Frontend (no aplicables)
⚠️  DevOps según necesidad
```

### Mobile Nativo (iOS/Android)
```
✅ Universal (todos los 16)
❌ Web/Frontend (mayoría no aplicables)
⚠️  DevOps según necesidad
```

---

## 🌍 Universal (16 skills) - Usar Siempre

**Aplican a cualquier lenguaje/plataforma/proyecto**

### Debugging & Testing
- `systematic-debugging` - Metodología paso a paso debugging
- `debugging-strategies` - Estrategias generales
- `test-driven-development` - TDD methodology
- `error-handling-patterns` - Patterns de manejo de errores

### Colaboración & Code Review
- `code-review-excellence` - Best practices de reviews
- `requesting-code-review` - Cómo solicitar reviews
- `receiving-code-review` - Cómo recibir feedback
- `doc-coauthoring` - Colaboración en docs

### Planificación & Ejecución
- `writing-plans` - Crear implementation plans
- `brainstorming` - Técnicas de ideación
- `executing-plans` - Ejecutar planes
- `verification-before-completion` - Checklist de verificación

### Git & Releases
- `git-advanced-workflows` - Workflows Git avanzados
- `using-git-worktrees` - Git worktrees
- `release-skills` - Gestión de releases
- `changelog-automation` - Automatizar changelogs

---

## 🌐 Web/Frontend (7 skills) - Solo Proyectos Web

**Para React, Next.js, Vue, apps web**

### Performance & UX
- `performance-profiling` - Lighthouse, Core Web Vitals, bundle optimization
- `design-system-patterns` - Design tokens, themes, componentes React
- `accessibility-compliance` - WCAG, ARIA, accesibilidad web
- `responsive-design` - Media queries, breakpoints, mobile-first
- `ui-ux-pro-max` - Intelligent design system generation, 67 styles, 161 palettes


### Testing & APIs
- `e2e-testing-patterns` - Playwright/Cypress patterns
- `api-design-principles` - REST/GraphQL API design

### Deployment
- `deployment-pipeline-design` - CI/CD para web, cloud deployment

**No usar para:** Python/Go backends, CLI tools, mobile nativo

---

## 🔧 DevOps/Tooling (4 skills) - Tecnologías Específicas

**Para Docker, SQL, deployment infrastructure**

- `docker-expert` - Dockerfile, Docker Compose, container optimization
- `sql-optimization-patterns` - SQL queries, indexes, EXPLAIN plans
- `database-migration` - Schema migrations
- `secrets-management` - Gestión de secretos/credenciales

**Requiere:** Docker instalado, DB SQL, o sistema de secretos

---

## 🎯 Specialized (2 skills) - Sesgo Moderado

**Para arquitecturas definidas o autenticación**

- `architecture-decision-records` - Documentar ADRs
- `auth-implementation-patterns` - Patterns de autenticación/autorización

**Asume:** Proyectos estructurados con arquitectura o sistema de auth

---

## 💡 Reglas de Uso

1. **Siempre:** Consultar skills Universal para cualquier proyecto
2. **Evaluar:** Web/Frontend solo si es proyecto web
3. **Considerar:** DevOps/Tooling según tech stack específico
4. **Preguntar:** Si no está claro, consultar al usuario

---

## 📝 Ubicación

Skills instalados en: `.agents/skills/[nombre-skill]/SKILL.md`

