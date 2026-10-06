BEGIN;

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('ABIERTA', 'FINALIZADA');

-- CreateEnum
CREATE TYPE "ProgressEventType" AS ENUM ('ACTUALIZACION', 'CORRECCION');

-- CreateTable
CREATE TABLE "plan_reviews" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "referenceStartDate" DATE NOT NULL,
    "referenceEndDate" DATE NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'ABIERTA',
    "planName" TEXT NOT NULL,
    "planDescription" TEXT NOT NULL,
    "planStartDate" DATE,
    "planEndDate" DATE,
    "planStatus" "PlanStatus" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "finalizedAt" TIMESTAMPTZ(3),
    "finalizedById" TEXT,
    "relatedReviewId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "snapshotTransactionId" BIGINT NOT NULL DEFAULT txid_current(),

    CONSTRAINT "plan_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_dimensions" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "sourceDimensionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "review_dimensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_actions" (
    "id" TEXT NOT NULL,
    "reviewDimensionId" TEXT NOT NULL,
    "sourceActionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "responsibleName" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "actualExpense" DECIMAL(18,2),
    "currency" CHAR(3) NOT NULL,
    "position" INTEGER NOT NULL,
    "lastReviewedAt" TIMESTAMPTZ(3),
    "lastReviewedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "review_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_milestones" (
    "id" TEXT NOT NULL,
    "reviewActionId" TEXT NOT NULL,
    "sourceMilestoneId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "weightBps" INTEGER NOT NULL,
    "initialProgressBps" INTEGER NOT NULL,
    "progressBps" INTEGER NOT NULL,

    CONSTRAINT "review_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_events" (
    "id" TEXT NOT NULL,
    "reviewMilestoneId" TEXT NOT NULL,
    "actionVersion" INTEGER NOT NULL,
    "previousBps" INTEGER NOT NULL,
    "newBps" INTEGER NOT NULL,
    "type" "ProgressEventType" NOT NULL,
    "reason" TEXT,
    "confirmedAt" TIMESTAMPTZ(3),
    "actorId" TEXT NOT NULL,
    "actorRole" "Role" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "progress_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_reviews_planId_referenceStartDate_createdAt_idx" ON "plan_reviews"("planId", "referenceStartDate", "createdAt");

-- CreateIndex
CREATE INDEX "plan_reviews_createdById_idx" ON "plan_reviews"("createdById");

-- CreateIndex
CREATE INDEX "plan_reviews_finalizedById_idx" ON "plan_reviews"("finalizedById");

-- CreateIndex
CREATE INDEX "plan_reviews_relatedReviewId_idx" ON "plan_reviews"("relatedReviewId");

-- CreateIndex
CREATE INDEX "review_dimensions_reviewId_position_idx" ON "review_dimensions"("reviewId", "position");

-- CreateIndex
CREATE INDEX "review_dimensions_sourceDimensionId_idx" ON "review_dimensions"("sourceDimensionId");

-- CreateIndex
CREATE UNIQUE INDEX "review_dimensions_reviewId_sourceDimensionId_key" ON "review_dimensions"("reviewId", "sourceDimensionId");

-- CreateIndex
CREATE INDEX "review_actions_reviewDimensionId_position_idx" ON "review_actions"("reviewDimensionId", "position");

-- CreateIndex
CREATE INDEX "review_actions_sourceActionId_idx" ON "review_actions"("sourceActionId");

-- CreateIndex
CREATE INDEX "review_actions_lastReviewedById_idx" ON "review_actions"("lastReviewedById");

-- CreateIndex
CREATE UNIQUE INDEX "review_actions_reviewDimensionId_sourceActionId_key" ON "review_actions"("reviewDimensionId", "sourceActionId");

-- CreateIndex
CREATE INDEX "review_milestones_reviewActionId_position_idx" ON "review_milestones"("reviewActionId", "position");

-- CreateIndex
CREATE INDEX "review_milestones_sourceMilestoneId_idx" ON "review_milestones"("sourceMilestoneId");

-- CreateIndex
CREATE UNIQUE INDEX "review_milestones_reviewActionId_sourceMilestoneId_key" ON "review_milestones"("reviewActionId", "sourceMilestoneId");

-- CreateIndex
CREATE INDEX "progress_events_reviewMilestoneId_createdAt_idx" ON "progress_events"("reviewMilestoneId", "createdAt");

-- CreateIndex
CREATE INDEX "progress_events_actorId_createdAt_idx" ON "progress_events"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "progress_events_type_createdAt_idx" ON "progress_events"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "progress_events_reviewMilestoneId_actionVersion_key" ON "progress_events"("reviewMilestoneId", "actionVersion");

-- AddForeignKey
ALTER TABLE "plan_reviews" ADD CONSTRAINT "plan_reviews_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "plan_reviews" ADD CONSTRAINT "plan_reviews_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "plan_reviews" ADD CONSTRAINT "plan_reviews_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "plan_reviews" ADD CONSTRAINT "plan_reviews_relatedReviewId_fkey" FOREIGN KEY ("relatedReviewId") REFERENCES "plan_reviews"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "review_dimensions" ADD CONSTRAINT "review_dimensions_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "plan_reviews"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "review_actions" ADD CONSTRAINT "review_actions_reviewDimensionId_fkey" FOREIGN KEY ("reviewDimensionId") REFERENCES "review_dimensions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "review_actions" ADD CONSTRAINT "review_actions_lastReviewedById_fkey" FOREIGN KEY ("lastReviewedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "review_milestones" ADD CONSTRAINT "review_milestones_reviewActionId_fkey" FOREIGN KEY ("reviewActionId") REFERENCES "review_actions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "progress_events" ADD CONSTRAINT "progress_events_reviewMilestoneId_fkey" FOREIGN KEY ("reviewMilestoneId") REFERENCES "review_milestones"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "progress_events" ADD CONSTRAINT "progress_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- PostgreSQL-only integrity. No existing row or structural table is modified.
CREATE UNIQUE INDEX "plan_reviews_one_open_per_plan"
ON "plan_reviews" ("planId") WHERE "status" = 'ABIERTA';

ALTER TABLE "plan_reviews" ADD CONSTRAINT "reviews_values_valid" CHECK (
  length(btrim("title")) > 0 AND "version" >= 0
  AND "referenceEndDate" >= "referenceStartDate"
  AND ("planStartDate" IS NULL OR "planEndDate" IS NULL OR "planEndDate" >= "planStartDate")
  AND ("relatedReviewId" IS NULL OR "relatedReviewId" <> "id")
  AND (("status" = 'ABIERTA' AND "finalizedAt" IS NULL AND "finalizedById" IS NULL)
    OR ("status" = 'FINALIZADA' AND "finalizedAt" IS NOT NULL AND "finalizedById" IS NOT NULL AND "finalizedAt" >= "createdAt"))
);
ALTER TABLE "review_dimensions" ADD CONSTRAINT "review_dimensions_position_valid" CHECK ("position" >= 0);
ALTER TABLE "review_actions" ADD CONSTRAINT "review_actions_values_valid" CHECK (
  "position" >= 0 AND "version" >= 0 AND "endDate" >= "startDate"
  AND ("actualExpense" IS NULL OR ("actualExpense" >= 0 AND "actualExpense"::text NOT IN ('NaN','Infinity','-Infinity')))
  AND ("currency" <> 'CLP' OR "actualExpense" IS NULL OR "actualExpense" = trunc("actualExpense"))
  AND (("lastReviewedAt" IS NULL AND "lastReviewedById" IS NULL AND "version" = 0)
    OR ("lastReviewedAt" IS NOT NULL AND "lastReviewedById" IS NOT NULL AND "version" > 0))
);
ALTER TABLE "review_milestones" ADD CONSTRAINT "review_milestones_values_valid" CHECK (
  "position" >= 0 AND "weightBps" BETWEEN 0 AND 10000
  AND "initialProgressBps" BETWEEN 0 AND 10000 AND "progressBps" BETWEEN 0 AND 10000
);
ALTER TABLE "progress_events" ADD CONSTRAINT "progress_events_values_valid" CHECK (
  "previousBps" BETWEEN 0 AND 10000 AND "newBps" BETWEEN 0 AND 10000 AND "actionVersion" > 0
  AND (("type" = 'ACTUALIZACION' AND "newBps" > "previousBps" AND "confirmedAt" IS NULL)
    OR ("type" = 'CORRECCION' AND "newBps" < "previousBps" AND "actorRole" = 'SUPERUSUARIO'
      AND "reason" IS NOT NULL AND length(btrim("reason")) > 0
      AND "confirmedAt" IS NOT NULL AND "confirmedAt" <= "createdAt"))
);

-- Each function binds the schema in which the migration runs (also isolated tests).
CREATE FUNCTION review_require_open(review_id TEXT, creating BOOLEAN DEFAULT false)
RETURNS void LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE r plan_reviews%ROWTYPE;
BEGIN
  SELECT * INTO r FROM plan_reviews WHERE id = review_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'ABIERTA' THEN
    RAISE EXCEPTION 'La revisión no existe o está finalizada' USING ERRCODE = '23514';
  END IF;
  IF creating AND r."snapshotTransactionId" <> txid_current() THEN
    RAISE EXCEPTION 'El snapshot solo se construye en la transacción que inicia la revisión' USING ERRCODE = '23514';
  END IF;
END $$;

CREATE FUNCTION review_header_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'No se elimina historial de revisiones' USING ERRCODE = '23514';
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'ABIERTA' OR NEW.version <> 0 OR NEW."snapshotTransactionId" <> txid_current() THEN
      RAISE EXCEPTION 'Una revisión debe iniciar abierta y en la transacción actual' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW."createdById" AND active) THEN
      RAISE EXCEPTION 'Creador inactivo' USING ERRCODE = '23514';
    END IF;
    IF NEW."relatedReviewId" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM plan_reviews WHERE id = NEW."relatedReviewId" AND "planId" = NEW."planId" AND status = 'FINALIZADA'
    ) THEN RAISE EXCEPTION 'La revisión relacionada debe estar finalizada y pertenecer al mismo plan' USING ERRCODE = '23514'; END IF;
  ELSE
    IF OLD.status = 'FINALIZADA' THEN
      RAISE EXCEPTION 'Una revisión finalizada es inmutable' USING ERRCODE = '23514';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['status','finalizedAt','finalizedById','version']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','finalizedAt','finalizedById','version']) OR NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'Cabecera histórica inmutable o versión inválida' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'FINALIZADA' AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW."finalizedById" AND active) THEN
      RAISE EXCEPTION 'Finalizador inactivo' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER review_header_guard BEFORE INSERT OR UPDATE OR DELETE ON plan_reviews
FOR EACH ROW EXECUTE FUNCTION review_header_guard();

CREATE FUNCTION review_dimension_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'La dimensión histórica es inmutable' USING ERRCODE = '23514';
  END IF;
  PERFORM review_require_open(NEW."reviewId", true);
  IF NOT EXISTS (SELECT 1 FROM dimensions d JOIN plan_reviews r ON r."planId" = d."planId"
    WHERE r.id = NEW."reviewId" AND d.id = NEW."sourceDimensionId") THEN
    RAISE EXCEPTION 'Dimensión de origen inválida al crear snapshot' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER review_dimension_guard BEFORE INSERT OR UPDATE OR DELETE ON review_dimensions
FOR EACH ROW EXECUTE FUNCTION review_dimension_guard();

CREATE FUNCTION review_action_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE rid TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'No se elimina la acción histórica' USING ERRCODE = '23514'; END IF;
  SELECT "reviewId" INTO rid FROM review_dimensions WHERE id = NEW."reviewDimensionId";
  PERFORM review_require_open(rid, TG_OP = 'INSERT');
  IF TG_OP = 'INSERT' THEN
    IF NEW.version <> 0 OR NEW."lastReviewedAt" IS NOT NULL OR NEW."lastReviewedById" IS NOT NULL THEN
      RAISE EXCEPTION 'La acción histórica inicia pendiente' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM actions a JOIN review_dimensions d ON d."sourceDimensionId" = a."dimensionId"
      WHERE d.id = NEW."reviewDimensionId" AND a.id = NEW."sourceActionId") THEN
      RAISE EXCEPTION 'Acción de origen inválida al crear snapshot' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF (to_jsonb(NEW) - ARRAY['lastReviewedAt','lastReviewedById','version']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['lastReviewedAt','lastReviewedById','version']) OR NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'Estructura histórica inmutable o versión de acción inválida' USING ERRCODE = '23514';
    END IF;
    IF NEW."lastReviewedAt" IS NULL OR NEW."lastReviewedById" IS NULL
       OR NEW."lastReviewedAt" < (SELECT "createdAt" FROM plan_reviews WHERE id = rid)
       OR NEW."lastReviewedAt" < OLD."lastReviewedAt"
       OR NOT EXISTS (SELECT 1 FROM users WHERE id = NEW."lastReviewedById" AND active) THEN
      RAISE EXCEPTION 'Confirmación de revisión inválida' USING ERRCODE = '23514';
    END IF;
    -- Also invalidates a previously displayed finalization summary. No structural lock.
    UPDATE plan_reviews SET version = version + 1 WHERE id = rid;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER review_action_guard BEFORE INSERT OR UPDATE OR DELETE ON review_actions
FOR EACH ROW EXECUTE FUNCTION review_action_guard();

CREATE FUNCTION review_milestone_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE rid TEXT; av INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'No se elimina el hito histórico' USING ERRCODE = '23514'; END IF;
  SELECT d."reviewId", a.version INTO rid, av FROM review_actions a JOIN review_dimensions d ON d.id = a."reviewDimensionId"
    WHERE a.id = NEW."reviewActionId";
  PERFORM review_require_open(rid, TG_OP = 'INSERT');
  IF TG_OP = 'INSERT' THEN
    IF NEW."initialProgressBps" <> NEW."progressBps" OR NOT EXISTS (
      SELECT 1 FROM milestones m JOIN review_actions a ON a."sourceActionId" = m."actionId"
      WHERE a.id = NEW."reviewActionId" AND m.id = NEW."sourceMilestoneId" AND m."progressBps" = NEW."initialProgressBps"
    ) THEN RAISE EXCEPTION 'Avance inicial u origen de hito inválido' USING ERRCODE = '23514'; END IF;
  ELSE
    IF (to_jsonb(NEW) - 'progressBps') IS DISTINCT FROM (to_jsonb(OLD) - 'progressBps') THEN
      RAISE EXCEPTION 'Nombre, peso, origen y avance inicial históricos son inmutables' USING ERRCODE = '23514';
    END IF;
    IF NEW."progressBps" <> OLD."progressBps" AND NOT EXISTS (
      SELECT 1 FROM progress_events WHERE "reviewMilestoneId" = NEW.id AND "actionVersion" = av
        AND "previousBps" = OLD."progressBps" AND "newBps" = NEW."progressBps"
    ) THEN RAISE EXCEPTION 'El avance histórico requiere un evento de la versión actual' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER review_milestone_guard BEFORE INSERT OR UPDATE OR DELETE ON review_milestones
FOR EACH ROW EXECUTE FUNCTION review_milestone_guard();

CREATE FUNCTION progress_event_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE h review_milestones%ROWTYPE; a review_actions%ROWTYPE; rid TEXT; current_progress INTEGER; actual_role "Role"; active_actor BOOLEAN;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Los eventos son de solo inserción' USING ERRCODE = '23514'; END IF;
  SELECT * INTO h FROM review_milestones WHERE id = NEW."reviewMilestoneId";
  SELECT * INTO a FROM review_actions WHERE id = h."reviewActionId";
  SELECT "reviewId" INTO rid FROM review_dimensions WHERE id = a."reviewDimensionId";
  PERFORM review_require_open(rid);
  -- Re-read after the revision lock; never validate against a pre-lock snapshot.
  SELECT * INTO h FROM review_milestones WHERE id = NEW."reviewMilestoneId";
  SELECT * INTO a FROM review_actions WHERE id = h."reviewActionId";
  SELECT role, active INTO actual_role, active_actor FROM users WHERE id = NEW."actorId" FOR SHARE;
  IF NOT FOUND OR NOT active_actor OR NEW."actorRole" <> actual_role THEN
    RAISE EXCEPTION 'Actor o rol histórico inválido' USING ERRCODE = '23514';
  END IF;
  IF NEW."actionVersion" <> a.version OR a.version = 0 OR a."lastReviewedById" <> NEW."actorId"
    OR NEW."createdAt" < a."lastReviewedAt" OR NEW."previousBps" <> h."progressBps" THEN
    RAISE EXCEPTION 'Evento incompatible con la versión, confirmación o avance de revisión' USING ERRCODE = '23514';
  END IF;
  SELECT m."progressBps" INTO current_progress FROM milestones m
    JOIN actions live_action ON live_action.id = m."actionId"
    JOIN dimensions live_dimension ON live_dimension.id = live_action."dimensionId"
    JOIN plan_reviews r ON r."planId" = live_dimension."planId"
    WHERE m.id = h."sourceMilestoneId" AND m."actionId" = a."sourceActionId" AND r.id = rid
    FOR UPDATE OF m;
  IF NOT FOUND THEN RAISE EXCEPTION 'El hito fue eliminado o ya no pertenece al plan; se rechaza todo el guardado' USING ERRCODE = '23514'; END IF;
  IF current_progress <> NEW."previousBps" THEN
    RAISE EXCEPTION 'Conflicto entre avance vigente y revisión' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER progress_event_guard BEFORE INSERT OR UPDATE OR DELETE ON progress_events
FOR EACH ROW EXECUTE FUNCTION progress_event_guard();

-- A deferred check sees the whole snapshot, not an incomplete sequence of INSERTs.
CREATE FUNCTION review_weights_check() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE aid TEXT; n BIGINT; total BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'review_actions' THEN aid := NEW.id; ELSE aid := NEW."reviewActionId"; END IF;
  SELECT count(*), coalesce(sum("weightBps"),0) INTO n,total FROM review_milestones WHERE "reviewActionId" = aid;
  IF n < 1 OR total <> 10000 THEN RAISE EXCEPTION 'Cada acción histórica necesita hitos con peso total 10000 BPS' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER review_action_weights_check AFTER INSERT ON review_actions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION review_weights_check();
CREATE CONSTRAINT TRIGGER review_milestone_weights_check AFTER INSERT ON review_milestones
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION review_weights_check();

CREATE FUNCTION review_event_chain_check() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE expected INTEGER; h review_milestones%ROWTYPE; e RECORD; av INTEGER; last_time TIMESTAMPTZ; live_progress INTEGER;
BEGIN
  SELECT * INTO h FROM review_milestones WHERE id = NEW."reviewMilestoneId";
  expected := h."initialProgressBps";
  SELECT version INTO av FROM review_actions WHERE id = h."reviewActionId";
  FOR e IN SELECT * FROM progress_events WHERE "reviewMilestoneId" = h.id ORDER BY "actionVersion" LOOP
    IF e."previousBps" <> expected OR e."actionVersion" > av OR e."createdAt" < last_time THEN
      RAISE EXCEPTION 'Cadena de eventos inconsistente' USING ERRCODE = '23514';
    END IF;
    expected := e."newBps"; last_time := e."createdAt";
  END LOOP;
  IF h."progressBps" <> expected THEN RAISE EXCEPTION 'El evento y el avance histórico deben guardarse juntos' USING ERRCODE = '23514'; END IF;
  SELECT "progressBps" INTO live_progress FROM milestones WHERE id = h."sourceMilestoneId";
  IF NOT FOUND OR live_progress <> expected THEN
    RAISE EXCEPTION 'El avance vigente y el histórico deben guardarse juntos; no recrear hitos eliminados' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER review_event_chain_check AFTER INSERT ON progress_events
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION review_event_chain_check();

COMMIT;
