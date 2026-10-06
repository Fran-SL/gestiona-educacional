BEGIN;

-- ============================================================
-- 1. AGREGA LOS NUEVOS PESOS
-- ============================================================

-- Agrega pesos configurables a la estructura actual.
ALTER TABLE "dimensions"
ADD COLUMN "weightBps" INTEGER;

ALTER TABLE "actions"
ADD COLUMN "weightBps" INTEGER;

-- Conserva esos pesos dentro de cada snapshot histórico.
ALTER TABLE "review_dimensions"
ADD COLUMN "weightBps" INTEGER;

ALTER TABLE "review_actions"
ADD COLUMN "weightBps" INTEGER;


-- ============================================================
-- 2. BACKFILL DE DIMENSIONES ACTUALES
-- ============================================================

-- Distribuye equitativamente 10000 BPS entre las dimensiones de cada plan.
WITH ranked_dimensions AS (
    SELECT
        id,
        "planId",
        ROW_NUMBER() OVER (
            PARTITION BY "planId"
            ORDER BY position, id
        ) AS rn,
        COUNT(*) OVER (
            PARTITION BY "planId"
        ) AS total
    FROM "dimensions"
)
UPDATE "dimensions" AS d
SET "weightBps" =
    FLOOR(10000.0 / rd.total)::INTEGER
    + CASE
        WHEN rd.rn <= (10000 % rd.total) THEN 1
        ELSE 0
      END
FROM ranked_dimensions AS rd
WHERE d.id = rd.id;


-- ============================================================
-- 3. BACKFILL DE ACCIONES ACTUALES
-- ============================================================

-- Distribuye equitativamente 10000 BPS entre las acciones de cada dimensión.
WITH ranked_actions AS (
    SELECT
        id,
        "dimensionId",
        ROW_NUMBER() OVER (
            PARTITION BY "dimensionId"
            ORDER BY position, id
        ) AS rn,
        COUNT(*) OVER (
            PARTITION BY "dimensionId"
        ) AS total
    FROM "actions"
)
UPDATE "actions" AS a
SET "weightBps" =
    FLOOR(10000.0 / ra.total)::INTEGER
    + CASE
        WHEN ra.rn <= (10000 % ra.total) THEN 1
        ELSE 0
      END
FROM ranked_actions AS ra
WHERE a.id = ra.id;


-- ============================================================
-- 4. BACKFILL DE SNAPSHOTS HISTÓRICOS
-- ============================================================

-- Las tablas históricas ya tienen triggers que impiden modificar
-- su estructura. Se deshabilitan exclusivamente durante este
-- backfill de migración.
ALTER TABLE "review_dimensions"
DISABLE TRIGGER "review_dimension_guard";

ALTER TABLE "review_actions"
DISABLE TRIGGER "review_action_guard";


-- Distribuye equitativamente 10000 BPS entre las dimensiones
-- existentes dentro de cada snapshot histórico.
WITH ranked_review_dimensions AS (
    SELECT
        id,
        "reviewId",
        ROW_NUMBER() OVER (
            PARTITION BY "reviewId"
            ORDER BY position, id
        ) AS rn,
        COUNT(*) OVER (
            PARTITION BY "reviewId"
        ) AS total
    FROM "review_dimensions"
)
UPDATE "review_dimensions" AS rd
SET "weightBps" =
    FLOOR(10000.0 / rrd.total)::INTEGER
    + CASE
        WHEN rrd.rn <= (10000 % rrd.total) THEN 1
        ELSE 0
      END
FROM ranked_review_dimensions AS rrd
WHERE rd.id = rrd.id;


-- Distribuye equitativamente 10000 BPS entre las acciones
-- existentes dentro de cada dimensión del snapshot histórico.
WITH ranked_review_actions AS (
    SELECT
        id,
        "reviewDimensionId",
        ROW_NUMBER() OVER (
            PARTITION BY "reviewDimensionId"
            ORDER BY position, id
        ) AS rn,
        COUNT(*) OVER (
            PARTITION BY "reviewDimensionId"
        ) AS total
    FROM "review_actions"
)
UPDATE "review_actions" AS ra
SET "weightBps" =
    FLOOR(10000.0 / rra.total)::INTEGER
    + CASE
        WHEN rra.rn <= (10000 % rra.total) THEN 1
        ELSE 0
      END
FROM ranked_review_actions AS rra
WHERE ra.id = rra.id;


-- Reactiva inmediatamente la protección histórica.
ALTER TABLE "review_dimensions"
ENABLE TRIGGER "review_dimension_guard";

ALTER TABLE "review_actions"
ENABLE TRIGGER "review_action_guard";


-- ============================================================
-- 5. VERIFICA QUE NO HAYAN QUEDADO PESOS NULL
-- ============================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "dimensions"
        WHERE "weightBps" IS NULL
    ) THEN
        RAISE EXCEPTION 'Existen dimensiones sin weightBps';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "actions"
        WHERE "weightBps" IS NULL
    ) THEN
        RAISE EXCEPTION 'Existen acciones sin weightBps';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "review_dimensions"
        WHERE "weightBps" IS NULL
    ) THEN
        RAISE EXCEPTION 'Existen dimensiones historicas sin weightBps';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "review_actions"
        WHERE "weightBps" IS NULL
    ) THEN
        RAISE EXCEPTION 'Existen acciones historicas sin weightBps';
    END IF;
END
$$;


-- ============================================================
-- 6. VERIFICA QUE LOS GRUPOS EXISTENTES SUMEN 10000 BPS
-- ============================================================

DO $$
BEGIN
    -- Dimensiones actuales por plan.
    IF EXISTS (
        SELECT "planId"
        FROM "dimensions"
        GROUP BY "planId"
        HAVING SUM("weightBps") <> 10000
    ) THEN
        RAISE EXCEPTION
            'Los pesos de las dimensiones de un plan no suman 10000 BPS';
    END IF;

    -- Acciones actuales por dimensión.
    IF EXISTS (
        SELECT "dimensionId"
        FROM "actions"
        GROUP BY "dimensionId"
        HAVING SUM("weightBps") <> 10000
    ) THEN
        RAISE EXCEPTION
            'Los pesos de las acciones de una dimension no suman 10000 BPS';
    END IF;

    -- Dimensiones históricas por revisión.
    IF EXISTS (
        SELECT "reviewId"
        FROM "review_dimensions"
        GROUP BY "reviewId"
        HAVING SUM("weightBps") <> 10000
    ) THEN
        RAISE EXCEPTION
            'Los pesos de las dimensiones historicas no suman 10000 BPS';
    END IF;

    -- Acciones históricas por dimensión histórica.
    IF EXISTS (
        SELECT "reviewDimensionId"
        FROM "review_actions"
        GROUP BY "reviewDimensionId"
        HAVING SUM("weightBps") <> 10000
    ) THEN
        RAISE EXCEPTION
            'Los pesos de las acciones historicas no suman 10000 BPS';
    END IF;
END
$$;


-- ============================================================
-- 7. HACE OBLIGATORIOS LOS PESOS
-- ============================================================

ALTER TABLE "dimensions"
ALTER COLUMN "weightBps" SET NOT NULL;

ALTER TABLE "actions"
ALTER COLUMN "weightBps" SET NOT NULL;

ALTER TABLE "review_dimensions"
ALTER COLUMN "weightBps" SET NOT NULL;

ALTER TABLE "review_actions"
ALTER COLUMN "weightBps" SET NOT NULL;


-- ============================================================
-- 8. LIMITA CADA PESO AL RANGO 0 - 10000 BPS
-- ============================================================

ALTER TABLE "dimensions"
ADD CONSTRAINT "dimensions_weightBps_check"
CHECK ("weightBps" BETWEEN 0 AND 10000);

ALTER TABLE "actions"
ADD CONSTRAINT "actions_weightBps_check"
CHECK ("weightBps" BETWEEN 0 AND 10000);

ALTER TABLE "review_dimensions"
ADD CONSTRAINT "review_dimensions_weightBps_check"
CHECK ("weightBps" BETWEEN 0 AND 10000);

ALTER TABLE "review_actions"
ADD CONSTRAINT "review_actions_weightBps_check"
CHECK ("weightBps" BETWEEN 0 AND 10000);


-- ============================================================
-- 9. PROTEGE EL TOTAL DE DIMENSIONES DE CADA PLAN
-- ============================================================

CREATE FUNCTION plan_dimension_weights_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT AS $$
DECLARE
    pid TEXT;
    n BIGINT;
    total BIGINT;
BEGIN
    -- Valida el padre nuevo en INSERT y UPDATE.
    IF TG_OP <> 'DELETE' THEN
        pid := NEW."planId";

        SELECT
            COUNT(*),
            COALESCE(SUM("weightBps"), 0)
        INTO
            n,
            total
        FROM "dimensions"
        WHERE "planId" = pid;

        IF n > 0 AND total <> 10000 THEN
            RAISE EXCEPTION
                'Las dimensiones del plan deben sumar 10000 BPS'
            USING ERRCODE = '23514';
        END IF;
    END IF;

    -- En DELETE valida el padre anterior.
    -- En UPDATE también lo valida si la dimensión cambió de plan.
    IF TG_OP = 'DELETE'
       OR (
            TG_OP = 'UPDATE'
            AND OLD."planId" IS DISTINCT FROM NEW."planId"
       )
    THEN
        pid := OLD."planId";

        SELECT
            COUNT(*),
            COALESCE(SUM("weightBps"), 0)
        INTO
            n,
            total
        FROM "dimensions"
        WHERE "planId" = pid;

        IF n > 0 AND total <> 10000 THEN
            RAISE EXCEPTION
                'Las dimensiones del plan deben sumar 10000 BPS'
            USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER plan_dimension_weights_check
AFTER INSERT OR UPDATE OR DELETE ON "dimensions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION plan_dimension_weights_check();


-- ============================================================
-- 10. PROTEGE EL TOTAL DE ACCIONES DE CADA DIMENSIÓN
-- ============================================================

CREATE FUNCTION dimension_action_weights_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT AS $$
DECLARE
    did TEXT;
    n BIGINT;
    total BIGINT;
BEGIN
    -- Valida la dimensión nueva en INSERT y UPDATE.
    IF TG_OP <> 'DELETE' THEN
        did := NEW."dimensionId";

        SELECT
            COUNT(*),
            COALESCE(SUM("weightBps"), 0)
        INTO
            n,
            total
        FROM "actions"
        WHERE "dimensionId" = did;

        IF n > 0 AND total <> 10000 THEN
            RAISE EXCEPTION
                'Las acciones de la dimension deben sumar 10000 BPS'
            USING ERRCODE = '23514';
        END IF;
    END IF;

    -- En DELETE valida la dimensión anterior.
    -- En UPDATE también la valida si la acción cambió de dimensión.
    IF TG_OP = 'DELETE'
       OR (
            TG_OP = 'UPDATE'
            AND OLD."dimensionId" IS DISTINCT FROM NEW."dimensionId"
       )
    THEN
        did := OLD."dimensionId";

        SELECT
            COUNT(*),
            COALESCE(SUM("weightBps"), 0)
        INTO
            n,
            total
        FROM "actions"
        WHERE "dimensionId" = did;

        IF n > 0 AND total <> 10000 THEN
            RAISE EXCEPTION
                'Las acciones de la dimension deben sumar 10000 BPS'
            USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER dimension_action_weights_check
AFTER INSERT OR UPDATE OR DELETE ON "actions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION dimension_action_weights_check();


-- ============================================================
-- 11. PROTEGE LAS DIMENSIONES DE CADA SNAPSHOT HISTÓRICO
-- ============================================================

CREATE FUNCTION review_dimension_weights_total_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT AS $$
DECLARE
    rid TEXT;
    n BIGINT;
    total BIGINT;
BEGIN
    rid := NEW."reviewId";

    SELECT
        COUNT(*),
        COALESCE(SUM("weightBps"), 0)
    INTO
        n,
        total
    FROM "review_dimensions"
    WHERE "reviewId" = rid;

    IF n > 0 AND total <> 10000 THEN
        RAISE EXCEPTION
            'Las dimensiones historicas de la revision deben sumar 10000 BPS'
        USING ERRCODE = '23514';
    END IF;

    RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER review_dimension_weights_total_check
AFTER INSERT ON "review_dimensions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION review_dimension_weights_total_check();


-- ============================================================
-- 12. PROTEGE LAS ACCIONES DE CADA DIMENSIÓN HISTÓRICA
-- ============================================================

CREATE FUNCTION review_action_weights_total_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT AS $$
DECLARE
    rdid TEXT;
    n BIGINT;
    total BIGINT;
BEGIN
    rdid := NEW."reviewDimensionId";

    SELECT
        COUNT(*),
        COALESCE(SUM("weightBps"), 0)
    INTO
        n,
        total
    FROM "review_actions"
    WHERE "reviewDimensionId" = rdid;

    IF n > 0 AND total <> 10000 THEN
        RAISE EXCEPTION
            'Las acciones historicas de la dimension deben sumar 10000 BPS'
        USING ERRCODE = '23514';
    END IF;

    RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER review_action_weights_total_check
AFTER INSERT ON "review_actions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION review_action_weights_total_check();


-- ============================================================
-- 13. FINALIZA LA MIGRACIÓN
-- ============================================================

COMMIT;