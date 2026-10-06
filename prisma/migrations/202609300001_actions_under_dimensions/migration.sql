BEGIN;
-- Transfer every action before removing the obsolete hierarchy level.
ALTER TABLE "actions" ADD COLUMN "dimensionId" TEXT;
UPDATE "actions" AS a SET "dimensionId" = m."dimensionId"
FROM "managements" AS m WHERE a."managementId" = m."id";
ALTER TABLE "actions" ALTER COLUMN "dimensionId" SET NOT NULL;
ALTER TABLE "actions" ADD CONSTRAINT "actions_dimensionId_fkey"
FOREIGN KEY ("dimensionId") REFERENCES "dimensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "actions_dimensionId_position_idx" ON "actions"("dimensionId", "position");
ALTER TABLE "actions" DROP CONSTRAINT "actions_managementId_fkey";
DROP INDEX "actions_managementId_position_idx";
ALTER TABLE "actions" DROP COLUMN "managementId";
DROP TABLE "managements";
COMMIT;
