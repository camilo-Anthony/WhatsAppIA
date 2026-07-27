-- Migration: Fix InfoField assistantConfigId null fallback (Issue #6)
--
-- Elimina el antipatron del codigo que hacia fallback a assistantConfigId=null
-- para que cada asistente use exclusivamente sus propios InfoFields.
-- 1) Backfill: cualquier InfoField con assistantConfigId=NULL se asigna al primer
--    AssistantConfig del mismo usuario (preserva el comportamiento legacy en
--    instalaciones con unico asistente por usuario).
-- 2) Aplica constraint NOT NULL para evitar regresiones.

-- 1) Backfill. Si un usuario tiene varios AssistantConfig, el primero por
--    createdAt hereda los InfoFields globales. Revisar manualmente antes de
--    aplicar si tenes multi-asistente con InfoFields compartidos por diseno.
UPDATE "info_fields" f
SET "assistantConfigId" = (
    SELECT ac.id
    FROM "assistant_configs" ac
    WHERE ac."userId" = f."userId"
    ORDER BY ac."createdAt" ASC
    LIMIT 1
)
WHERE f."assistantConfigId" IS NULL;

-- 2) Eliminar InfoFields huerfanos (sin AssistantConfig matching) si los hubiera.
DELETE FROM "info_fields"
WHERE "assistantConfigId" IS NULL
   OR "assistantConfigId" NOT IN (SELECT id FROM "assistant_configs");

-- 3) Aplicar NOT NULL constraint a la columna.
ALTER TABLE "info_fields" ALTER COLUMN "assistantConfigId" SET NOT NULL;

-- 4) FK ya existe; Prisma la regenera al aplicar eldiff. Confirmar constraint:
-- ALTER TABLE "info_fields" ADD CONSTRAINT "info_fields_assistantConfigId_fkey"
--   FOREIGN KEY ("assistantConfigId") REFERENCES "assistant_configs"("id")
--   ON DELETE CASCADE ON UPDATE CASCADE;
