import "dotenv/config";

import {
  test,
  expect,
  type APIRequestContext,
} from "@playwright/test";
import { setTimeout as pause } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { hashPassword } from "better-auth/crypto";

import { PrismaClient } from "../../generated/prisma/client";
import { databaseAdapter } from "../../models/database-adapter";

const url = process.env.DATABASE_URL!;

if (
  !new URL(url)
    .searchParams
    .get("schema")
    ?.startsWith("tracking_test_")
) {
  throw new Error(
    "Ejecuta test:tracking:http: requiere esquema aislado."
  );
}

const db = new PrismaClient({
  adapter: databaseAdapter(url),
});

const manifest = JSON.parse(
  readFileSync(
    ".next/server/server-reference-manifest.json",
    "utf8"
  )
);

const origin = "http://localhost:3100";

async function call(
  request: APIRequestContext,
  name: string,
  input: Record<string, unknown>
) {
  const id = Object.entries(
    manifest.node
  ).find(
    ([, v]) =>
      (v as { exportedName: string })
        .exportedName === name
  )?.[0];

  if (!id) {
    throw new Error(
      `Falta Server Action de prueba: ${name}`
    );
  }

  const response = await request.post(
    `/planes/${input.planId}/seguimiento`,
    {
      headers: {
        origin,
        "content-type":
          "text/plain;charset=UTF-8",
        "next-action": id,
      },

      data: JSON.stringify([
        input,
      ]),
    }
  );

  const text =
    await response.text();

  expect(
    response.status()
  ).toBe(200);

  expect(
    text
  ).not.toContain(
    "snapshotTransactionId"
  );

  const line = text
    .split("\n")
    .find(
      l =>
        /^[0-9a-f]+:\{"ok":/.test(
          l
        )
    );

  if (!line) {
    throw new Error(
      "Respuesta de acción no encontrada"
    );
  }

  return JSON.parse(
    line.slice(
      line.indexOf(":") + 1
    )
  );
}

// Share the existing authentication rate limit;
// never disable it for tests.
test.beforeEach(async () => {
  await pause(11_000);
});

test.afterAll(async () => {
  await db.$disconnect();
});

for (
  const role of [
    "ADMINISTRADOR",
    "SUPERUSUARIO",
  ] as const
) {
  test(
    `${role}: seguimiento autenticado completo por HTTP`,
    async ({
      request,
      playwright,
    }) => {
      const id =
        randomUUID();

      const password =
        randomUUID();

      const email =
        `${id}@example.invalid`;

      await db.user.create({
        data: {
          id,
          name:
            "Usuario prueba",
          email,
          role,

          accounts: {
            create: {
              accountId: id,
              providerId:
                "credential",

              password:
                await hashPassword(
                  password
                ),
            },
          },
        },
      });

      const plan =
        await db.plan.create({
          data: {
            name:
              "Plan seguimiento HTTP",

            createdById: id,

            dimensions: {
              create: {
                name:
                  "Dimensión",

                // Única dimensión del plan: 100%.
                weightBps:
                  10000,

                actions: {
                  create: {
                    name:
                      "Acción",

                    description:
                      "Descripción",

                    responsibleName:
                      "Encargado",

                    startDate:
                      new Date(
                        "2026-01-01"
                      ),

                    endDate:
                      new Date(
                        "2026-12-31"
                      ),

                    // Única acción de la dimensión: 100%.
                    weightBps:
                      10000,

                    milestones: {
                      create: {
                        name:
                          "Hito",

                        // Único hito de la acción: 100%.
                        weightBps:
                          10000,

                        progressBps:
                          4000,
                      },
                    },
                  },
                },
              },
            },
          },
        });

      const input = {
        planId: plan.id,
        title: "Revisión",

        referenceStartDate:
          "2026-01-01",

        referenceEndDate:
          "2026-12-31",
      };

      expect(
        await call(
          request,
          "startReview",
          input
        )
      ).toMatchObject({
        ok: false,
        code: "ACCESS_DENIED",
      });

      expect(
        (
          await request.post(
            "/api/auth/sign-in/email",
            {
              headers: {
                origin,
              },

              data: {
                email,
                password,
              },
            }
          )
        ).ok()
      ).toBe(true);

      expect(
        await call(
          request,
          "startReview",
          {
            ...input,
            actorRole:
              "SUPERUSUARIO",
          }
        )
      ).toMatchObject({
        ok: false,
        code: "INVALID_INPUT",
      });

      const started =
        await call(
          request,
          "startReview",
          input
        );

      expect(
        started.ok
      ).toBe(true);

      const target = {
        planId: plan.id,
        reviewId:
          started.data.id,
      };

      expect(
        await call(
          request,
          "startReview",
          input
        )
      ).toMatchObject({
        ok: false,
        code: "OPEN_REVIEW",
      });

      const read =
        await call(
          request,
          "readReview",
          target
        );

      const a =
        read.data
          .dimensions[0]
          .actions[0];

      const h =
        a.milestones[0];

      const save = {
        ...target,

        reviewActionId:
          a.id,

        version: 0,

        milestones: [
          {
            reviewMilestoneId:
              h.id,

            progressBps:
              6000,
          },
        ],
      };

      const updated =
        await call(
          request,
          "saveTrackingAction",
          save
        );

      expect(
        updated
      ).toMatchObject({
        ok: true,
        data: {
          version: 1,
        },
      });

      expect(
        updated.data
          .dimensions[0]
          .actions[0]
          .achievement
      ).toBe(60);

      const correction = {
        ...save,

        version: 1,

        milestones: [
          {
            reviewMilestoneId:
              h.id,

            progressBps:
              5000,

            confirmDecrease:
              true,

            reason:
              "Dato corregido",
          },
        ],
      };

      const corrected =
        await call(
          request,
          "saveTrackingAction",
          correction
        );

      expect(
        corrected.ok
      ).toBe(
        role ===
          "SUPERUSUARIO"
      );

      if (
        role ===
        "ADMINISTRADOR"
      ) {
        expect(
          corrected.code
        ).toBe(
          "CORRECTION_FORBIDDEN"
        );
      }

      const version =
        role ===
        "SUPERUSUARIO"
          ? 2
          : 1;

      expect(
        await call(
          request,
          "finalizeReview",
          {
            ...target,
            version: 0,
          }
        )
      ).toMatchObject({
        ok: false,
        code: "CONFLICT",
      });

      expect(
        await call(
          request,
          "finalizeReview",
          {
            ...target,
            version,
          }
        )
      ).toMatchObject({
        ok: true,

        data: {
          status:
            "FINALIZADA",

          pending: 0,
        },
      });

      expect(
        await call(
          request,
          "saveTrackingAction",
          {
            ...save,
            version,
          }
        )
      ).toMatchObject({
        ok: false,
        code: "FINALIZED",
      });

      const events =
        await call(
          request,
          "readProgressEvents",
          {
            ...target,
            reviewActionId:
              a.id,
          }
        );

      expect(
        events.data
      ).toHaveLength(
        role ===
          "SUPERUSUARIO"
          ? 2
          : 1
      );

      expect(
        events.data[0]
          .actorId
      ).toBe(id);

      const list =
        await call(
          request,
          "listReviews",
          {
            planId:
              plan.id,

            status:
              "FINALIZADA",
          }
        );

      expect(
        list.data
      ).toHaveLength(1);

      const anonymous =
        await playwright
          .request
          .newContext({
            baseURL:
              origin,
          });

      try {
        expect(
          await call(
            anonymous,
            "readReview",
            target
          )
        ).toMatchObject({
          ok: false,
          code:
            "ACCESS_DENIED",
        });
      } finally {
        await anonymous.dispose();
      }

      await db.user.update({
        where: {
          id,
        },

        data: {
          active: false,
        },
      });

      expect(
        await call(
          request,
          "readReview",
          target
        )
      ).toMatchObject({
        ok: false,
        code: "ACCESS_DENIED",
      });
    }
  );
}