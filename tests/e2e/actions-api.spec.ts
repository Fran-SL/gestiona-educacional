import "dotenv/config";

import { test, expect } from "@playwright/test";

import { randomUUID } from "node:crypto";

import { readFileSync } from "node:fs";

import { hashPassword } from "better-auth/crypto";

import { PrismaClient } from "../../generated/prisma/client";

import { databaseAdapter } from "../../models/database-adapter";

const db = new PrismaClient({

  adapter: databaseAdapter(

    process.env.DATABASE_URL!

  ),

});

const manifest = JSON.parse(

  readFileSync(

    ".next/server/server-reference-manifest.json",

    "utf8"

  )

);

function actionId(name: string) {

  const id = Object.entries(

    manifest.node

  ).find(

    ([, v]) =>

      (v as { exportedName: string })

        .exportedName === name

  )?.[0];

  if (!id) {

    throw new Error(

      `Compila: ${name}`

    );

  }

  return id;

}

const saveId = actionId(

  "saveActionWithMilestones"

);

const structureId = actionId(

  "structureAction"

);

const saveWeightsId = actionId(

  "saveStructureWeights"

);

const origin =

  "http://localhost:3100";

const ids: string[] = [];

test.afterAll(async () => {

  await db.plan.deleteMany({

    where: {

      createdById: {

        in: ids,

      },

    },

  });

  await db.user.deleteMany({

    where: {

      id: {

        in: ids,

      },

    },

  });

  await db.$disconnect();

});

for (

  const role of [

    "SUPERUSUARIO",

    "ADMINISTRADOR",

  ] as const

) {

  test(

    `${role}: estructura preserva avances, rechaza manipulación y conserva concurrencia`,

    async ({

      request,

      playwright,

    }) => {

      const id = randomUUID();

      const password = randomUUID();

      const email =

        `${id}@example.invalid`;

      await db.user.create({

        data: {

          id,

          name: "Prueba acciones",

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

      ids.push(id);

      const plan =

        await db.plan.create({

          data: {

            name: `Prueba ${id}`,

            status: "CERRADO",

            createdById: id,

            dimensions: {

              create: {

                name: "Dimensión",

                // Única dimensión del plan: 100%.

                weightBps: 10000,

              },

            },

          },

          include: {

            dimensions: true,

          },

        });

      const other =

        await db.plan.create({

          data: {

            name: `Otro ${id}`,

            createdById: id,

            dimensions: {

              create: {

                name:

                  "Otra dimensión",

                // Única dimensión del plan: 100%.

                weightBps: 10000,

              },

            },

          },

          include: {

            dimensions: true,

          },

        });

      const dimensionId =

        plan.dimensions[0].id;

      const path =

        `/planes/${plan.id}`;

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

      const headers = {

        origin,

        "content-type":

          "text/plain;charset=UTF-8",

        "next-action": saveId,

      };

      const save = async (

        input: object

      ) =>

        (

          await request.post(

            path,

            {

              headers,

              data:

                JSON.stringify([

                  input,

                ]),

            }

          )

        ).text();

      const saveWeights = async (

        input: object

      ) =>

        (

          await request.post(

            path,

            {

              headers: {

                ...headers,

                "next-action":

                  saveWeightsId,

              },

              data:

                JSON.stringify([

                  {

                    planId: plan.id,

                    ...input,

                  },

                ]),

            }

          )

        ).text();

      const input = {

        planId: plan.id,

        dimensionId,

        name:

          "Acción con cuatro hitos",

        description:

          "Descripción",

        responsibleName:

          "Responsable",

        startDate:

          "2026-01-01",

        endDate:

          "2026-12-31",

        actualExpense:

          "123456",

        milestones: [

          1000,

          3000,

          3000,

          3000,

        ].map(

          (

            weightBps,

            i

          ) => ({

            name:

              `Hito ${i + 1}`,

            weightBps,

            newComment:

              i === 0

                ? "Primer comentario"

                : "",

          })

        ),

      };

      const anonymous =

        await playwright.request.newContext();

      try {

        expect(

          await (

            await anonymous.post(

              origin + path,

              {

                headers,

                data:

                  JSON.stringify([

                    input,

                  ]),

              }

            )

          ).text()

        ).toContain(

          '"ok":false'

        );

      } finally {

        await anonymous.dispose();

      }

      expect(

        await save({

          ...input,

          dimensionId:

            other.dimensions[0]

              .id,

        })

      ).toContain(

        '"ok":false'

      );

      for (

        const change of [

          {

            milestones: [],

          },

          {

            actualExpense: "-1",

          },

          {

            endDate:

              "2025-01-01",

          },

          {

            milestones: [

              {

                name: "H",

                weightBps:

                  5000,

              },

            ],

          },

        ]

      ) {

        expect(

          await save({

            ...input,

            ...change,

          })

        ).toContain(

          '"ok":false'

        );

      }

      expect(

        await db.action.count({

          where: {

            dimensionId,

          },

        })

      ).toBe(0);

      expect(

        await save({

          ...input,

          milestones:

            input.milestones.map(

              h => ({

                ...h,

                progressBps:

                  10000,

              })

            ),

        })

      ).toContain(

        '"ok":false'

      );

      expect(

        await db.action.count({

          where: {

            dimensionId,

          },

        })

      ).toBe(0);

      expect(

        await save(input)

      ).toContain(

        '"ok":true'

      );

      const firstActionAfterCreate =

        await db.action.findFirstOrThrow({

          where: {

            dimensionId,

          },

        });

      expect(

        firstActionAfterCreate.weightBps

      ).toBe(10000);

      expect(

        await save({

          ...input,

          name: "Segunda acción",

        })

      ).toContain(

        '"ok":true'

      );

      const secondAction =

        await db.action.findFirstOrThrow({

          where: {

            dimensionId,

            name: "Segunda acción",

          },

        });

      expect(

        secondAction.weightBps

      ).toBe(0);

      expect(

        (

          await db.action.findUniqueOrThrow({

            where: {

              id: firstActionAfterCreate.id,

            },

          })

        ).weightBps

      ).toBe(10000);

    // Guarda una distribución válida de pesos entre las dos acciones.
    expect(
      await saveWeights({
        kind: "action",
        parentId: dimensionId,
        weights: [
          {
            id: firstActionAfterCreate.id,
            weightBps: 7000,
          },
          {
            id: secondAction.id,
            weightBps: 3000,
          },
        ],
      })
    ).toContain('"ok":true');

    const actionsAfterWeightSave =
      await db.action.findMany({
        where: {
          id: {
            in: [
              firstActionAfterCreate.id,
              secondAction.id,
            ],
          },
        },
      });

    expect(
      actionsAfterWeightSave.find(
        item =>
          item.id === firstActionAfterCreate.id
      )?.weightBps
    ).toBe(7000);

    expect(
      actionsAfterWeightSave.find(
        item => item.id === secondAction.id
      )?.weightBps
    ).toBe(3000);

    // Rechaza una distribución que no suma 100 %.
    expect(
      await saveWeights({
        kind: "action",
        parentId: dimensionId,
        weights: [
          {
            id: firstActionAfterCreate.id,
            weightBps: 7000,
          },
          {
            id: secondAction.id,
            weightBps: 2000,
          },
        ],
      })
    ).toContain(
      "Los pesos deben sumar exactamente 100 %."
    );

    const actionsAfterInvalidWeightSum =
      await db.action.findMany({
        where: {
          id: {
            in: [
              firstActionAfterCreate.id,
              secondAction.id,
            ],
          },
        },
      });

    expect(
      actionsAfterInvalidWeightSum.find(
        item =>
          item.id === firstActionAfterCreate.id
      )?.weightBps
    ).toBe(7000);

    expect(
      actionsAfterInvalidWeightSum.find(
        item => item.id === secondAction.id
      )?.weightBps
    ).toBe(3000);

    // Rechaza guardar pesos si no se envían todas las acciones hermanas.
    expect(
      await saveWeights({
        kind: "action",
        parentId: dimensionId,
        weights: [
          {
            id: firstActionAfterCreate.id,
            weightBps: 10000,
          },
        ],
      })
    ).toContain(
      "La estructura cambió. Recarga la página antes de guardar los pesos."
    );

    const actionsAfterIncompleteWeightSave =
      await db.action.findMany({
        where: {
          id: {
            in: [
              firstActionAfterCreate.id,
              secondAction.id,
            ],
          },
        },
      });

    expect(
      actionsAfterIncompleteWeightSave.find(
        item =>
          item.id === firstActionAfterCreate.id
      )?.weightBps
    ).toBe(7000);

    expect(
      actionsAfterIncompleteWeightSave.find(
        item => item.id === secondAction.id
      )?.weightBps
    ).toBe(3000);

    // Restaura 100/0 para mantener el escenario de eliminación posterior.
    expect(
      await saveWeights({
        kind: "action",
        parentId: dimensionId,
        weights: [
          {
            id: firstActionAfterCreate.id,
            weightBps: 10000,
          },
          {
            id: secondAction.id,
            weightBps: 0,
          },
        ],
      })
    ).toContain('"ok":true');

    expect(
      (
        await db.action.findUniqueOrThrow({
          where: {
            id: firstActionAfterCreate.id,
          },
        })
      ).weightBps
    ).toBe(10000);

    expect(
      (
        await db.action.findUniqueOrThrow({
          where: {
            id: secondAction.id,
          },
        })
      ).weightBps
    ).toBe(0);

      const read = () =>

        db.action.findFirstOrThrow({

          where: {

            id: firstActionAfterCreate.id,

          },

          include: {

            milestones: {

              orderBy: {

                position: "asc",

              },

              include: {

                comments: true,

              },

            },

          },

        });

      let action =

        await read();

      expect(

        action.actualExpense

          ?.toString()

      ).toBe(

        "123456"

      );

      expect(

        action.milestones

      ).toHaveLength(4);

      expect(

        action.milestones.every(

          h =>

            h.progressBps === 0

        )

      ).toBe(true);

      // Set existing progress only on this

      // test's records; structure must preserve it.

      const initialProgress = [

        7000,

        5000,

        10000,

        0,

      ];

      await db.$transaction(

        action.milestones.map(

          (h, i) =>

            db.milestone.update({

              where: {

                id: h.id,

              },

              data: {

                progressBps:

                  initialProgress[i],

              },

            })

        )

      );

      action = await read();

      expect(

        action.milestones[0]

          .comments[0]

          .authorId

      ).toBe(id);

      const page = await (

        await request.get(path)

      ).text();

      expect(page).toContain(

        "Primer comentario"

      );

      expect(page).not.toContain(

        "Logro:"

      );

      expect(page).not.toContain(

        "progressBps"

      );

      const draft = () => ({

        ...input,

        id: action.id,

        version: action.version,

        milestones:

          action.milestones.map(

            h => ({

              id: h.id,

              name: h.name,

              weightBps:

                h.weightBps,

              newComment: "",

            })

          ),

      });

      let edit = draft();

      expect(

        await save({

          ...edit,

          milestones:

            edit.milestones.map(

              (h, i) =>

                i === 0

                  ? {

                      ...h,

                      id:

                        "foreign-hito",

                    }

                  : h

            ),

        })

      ).toContain(

        '"ok":false'

      );

      for (

        const progressBps of [

          0,

          10000,

        ]

      ) {

        expect(

          await save({

            ...edit,

            milestones:

              edit.milestones.map(

                (h, i) =>

                  i === 0

                    ? {

                        ...h,

                        progressBps,

                      }

                    : h

              ),

          })

        ).toContain(

          '"ok":false'

        );

        expect(

          (

            await read()

          ).milestones.map(

            h =>

              h.progressBps

          )

        ).toEqual(

          initialProgress

        );

      }

      expect(

        await save({

          ...edit,

          correctProgress:

            true,

        })

      ).toContain(

        '"ok":false'

      );

      expect(

        await save({

          ...edit,

          progressBps:

            10000,

        })

      ).toContain(

        '"ok":false'

      );

      // Rename and reweight existing milestones

      // without changing their progress.

      expect(

        await save({

          ...edit,

          milestones:

            edit.milestones.map(

              (h, i) => ({

                ...h,

                name:

                  `Renombrado ${i}`,

                weightBps:

                  2500,

              })

            ),

        })

      ).toContain(

        '"ok":true'

      );

      expect(

        (

          await read()

        ).milestones.map(

          h =>

            h.progressBps

        )

      ).toEqual(

        initialProgress

      );

      action = await read();

      edit = draft();

      const concurrent =

        await Promise.all([

          save({

            ...edit,

            description:

              "Primera edición",

          }),

          save({

            ...edit,

            description:

              "Segunda edición",

          }),

        ]);

      expect(

        concurrent.filter(

          r =>

            r.includes(

              '"ok":true'

            )

        )

      ).toHaveLength(1);

      expect(

        concurrent.filter(

          r =>

            r.includes(

              '"ok":false'

            )

        )

      ).toHaveLength(1);

      action = await read();

      edit = draft();

      const commentId =

        action.milestones[0]

          .comments[0].id;

      expect(

        await save({

          ...edit,

          milestones:

            edit.milestones.map(

              (h, i) => ({

                ...h,

                newComment:

                  i === 0

                    ? "Segundo comentario"

                    : "",

              })

            ),

        })

      ).toContain(

        '"ok":true'

      );

      action = await read();

      expect(

        action.milestones[0]

          .comments

      ).toHaveLength(2);

      expect(

        action.milestones[0]

          .comments.some(

            c =>

              c.id ===

              commentId

          )

      ).toBe(true);

      edit = draft();

      const removedId =

        edit.milestones[0].id;

      const remaining =

        edit.milestones

          .slice(1)

          .map(

            (h, i) => ({

              ...h,

              weightBps:

                i === 0

                  ? 4000

                  : 3000,

            })

          );

      expect(

        await save({

          ...edit,

          milestones:

            remaining,

        })

      ).toContain(

        '"ok":false'

      );

      expect(

        (

          await read()

        ).milestones

      ).toHaveLength(4);

      expect(

        await save({

          ...edit,

          milestones:

            remaining,

          confirmedRemovedIds: [

            removedId,

          ],

        })

      ).toContain(

        '"ok":true'

      );

      expect(

        await db.milestoneComment.count(

          {

            where: {

              milestoneId:

                removedId,

            },

          }

        )

      ).toBe(0);

      action = await read();

      edit = draft();

      expect(

        await save({

          ...edit,

          milestones: [

            ...edit.milestones.map(

              h => ({

                ...h,

                weightBps:

                  2000,

              })

            ),

            {

              name:

                "Nuevo hito",

              weightBps:

                4000,

              newComment:

                "Nuevo comentario",

            },

          ],

        })

      ).toContain(

        '"ok":true'

      );

      const saved =

        await read();

      expect(

        saved.milestones

          .filter(

            h =>

              edit.milestones.some(

                old =>

                  old.id ===

                  h.id

              )

          )

          .map(

            h =>

              h.progressBps

          )

      ).toEqual(

        initialProgress.slice(1)

      );

      expect(

        saved.milestones.find(

          h =>

            h.name ===

            "Nuevo hito"

        )?.progressBps

      ).toBe(0);

      const target = {

        planId: plan.id,

        kind: "action",

        id: action.id,

      };

      const structure = async (

        op: string,

        data: object

      ) =>

        (

          await request.post(

            path,

            {

              headers: {

                ...headers,

                "next-action":

                  structureId,

              },

              data:

                JSON.stringify([

                  op,

                  data,

                ]),

            }

          )

        ).text();

      const preview =

        await structure(

          "preview",

          target

        );

      expect(

        preview

      ).toContain(

        '"milestones":4'

      );

      const token =

        preview.match(

          /"token":"([a-f0-9]{64})"/

        )?.[1];

      expect(

        await structure(

          "remove",

          {

            ...target,

            token,

          }

        )

      ).toContain(

        '"ok":false'

      );

      expect(

        await structure(

          "remove",

          {

            ...target,

            token,

            confirmed: true,

          }

        )

      ).toContain(

        "Antes de eliminar esta acción"

      );

      expect(

        await db.action.count({

          where: {

            id: action.id,

          },

        })

      ).toBe(1);

      const secondTarget = {

        planId: plan.id,

        kind: "action",

        id: secondAction.id,

      };

      const secondPreview =

        await structure(

          "preview",

          secondTarget

        );

      const secondToken =

        secondPreview.match(

          /"token":"([a-f0-9]{64})"/

        )?.[1];

      expect(secondToken).toBeTruthy();

      expect(

        await structure(

          "remove",

          {

            ...secondTarget,

            token: secondToken,

            confirmed: true,

          }

        )

      ).toContain(

        '"ok":true'

      );

      expect(

        await db.action.count({

          where: {

            id: secondAction.id,

          },

        })

      ).toBe(0);

      const finalPreview =

        await structure(

          "preview",

          target

        );

      const finalToken =

        finalPreview.match(

          /"token":"([a-f0-9]{64})"/

        )?.[1];

      expect(finalToken).toBeTruthy();

      expect(

        await structure(

          "remove",

          {

            ...target,

            token: finalToken,

            confirmed: true,

          }

        )

      ).toContain(

        '"ok":true'

      );

      expect(

        await db.dimension.count({

          where: {

            id: dimensionId,

          },

        })

      ).toBe(1);

    }

  );

}