import {
  beforeAll,
  afterAll,
  it,
  expect,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import { PrismaClient } from "../../generated/prisma/client";
import { databaseAdapter } from "../../models/database-adapter";
import { createReviewModel } from "../../models/review";
import { actionModel } from "../../models/action";
import * as databaseModule from "../../models/db";
import { createTrackingController } from "../../controllers/tracking-controller";
import { isolatedDatabase } from "../helpers/isolated-database.mjs";

let db: PrismaClient;

let cleanup: () => Promise<void>;

let model: ReturnType<
  typeof createReviewModel
>;

let admin: {
  id: string;
  role: "ADMINISTRADOR";
  active: boolean;
};

let superuser: {
  id: string;
  role: "SUPERUSUARIO";
  active: boolean;
};

beforeAll(async () => {
  const isolated =
    await isolatedDatabase();

  cleanup = isolated.cleanup;

  db = new PrismaClient({
    adapter:
      databaseAdapter(
        isolated.url
      ),
  });

  model =
    createReviewModel(
      () => db
    );

  vi.spyOn(
    databaseModule,
    "getDatabase"
  ).mockReturnValue(db);

  admin = {
    ...(await db.user.create({
      data: {
        name: "Admin",
        email:
          "admin@example.invalid",
        role:
          "ADMINISTRADOR",
      },
    })),

    role:
      "ADMINISTRADOR",
  };

  superuser = {
    ...(await db.user.create({
      data: {
        name: "Super",
        email:
          "super@example.invalid",
        role:
          "SUPERUSUARIO",
      },
    })),

    role:
      "SUPERUSUARIO",
  };
});

afterAll(async () => {
  await db?.$disconnect();

  await cleanup?.();

  vi.restoreAllMocks();
});

async function fixture(
  user:
    | typeof admin
    | typeof superuser = admin
) {
  const plan =
    await db.plan.create({
      data: {
        name: "Plan",

        description:
          "Descripción plan",

        status: "CERRADO",

        createdById:
          user.id,

        startDate:
          new Date(
            "2026-01-01"
          ),

        endDate:
          new Date(
            "2026-12-31"
          ),

        dimensions: {
          create: [
            {
              name:
                "Dimensión",

              description:
                "Descripción dimensión",

              position: 2,

              // Primera de dos dimensiones: 50%.
              weightBps:
                5000,

              actions: {
                create: {
                  name:
                    "Acción",

                  description:
                    "Descripción acción",

                  responsibleName:
                    "Responsable",

                  startDate:
                    new Date(
                      "2026-02-01"
                    ),

                  endDate:
                    new Date(
                      "2026-11-01"
                    ),

                  actualExpense:
                    "123456",

                  position: 3,

                  // Única acción de esta dimensión: 100%.
                  weightBps:
                    10000,

                  milestones: {
                    create: [
                      2000,
                      3000,
                      5000,
                    ].map(
                      (
                        weightBps,
                        i
                      ) => ({
                        name:
                          `H${i}`,

                        position:
                          i,

                        weightBps,

                        progressBps:
                          [
                            4000,
                            5000,
                            7000,
                          ][i],
                      })
                    ),
                  },
                },
              },
            },

            {
              name: "Vacía",
              position: 4,

              // Segunda de dos dimensiones: 50%.
              weightBps:
                5000,
            },
          ],
        },
      },

      include: {
        dimensions: {
          orderBy: {
            position:
              "asc",
          },

          include: {
            actions: {
              include: {
                milestones: {
                  orderBy: {
                    position:
                      "asc",
                  },
                },
              },
            },
          },
        },
      },
    });

  const c =
    createTrackingController(
      async () => user,
      model
    );

  const input = {
    planId: plan.id,
    title: "Revisión",

    referenceStartDate:
      "2026-03-01",

    referenceEndDate:
      "2026-05-30",
  };

  const r =
    await c.start(input);

  const target = {
    planId: plan.id,
    reviewId: r.id,
  };

  const read =
    await c.read(target);

  const a =
    read.dimensions[0]
      .actions[0];

  const save = {
    ...target,

    reviewActionId:
      a.id,

    version:
      a.version,

    milestones:
      a.milestones.map(
        h => ({
          reviewMilestoneId:
            h.id,

          progressBps:
            h.progressBps,
        })
      ),
  };

  return {
    plan,
    c,
    input,
    r,
    target,
    a,
    save,
  };
}

for (
  const role of [
    "ADMINISTRADOR",
    "SUPERUSUARIO",
  ] as const
) {
  it(
    `${role}: inicio, snapshot completo y actualización sincronizada`,
    async () => {
      const f =
        await fixture(
          role ===
            "ADMINISTRADOR"
            ? admin
            : superuser
        );

      expect(
        f.r.planStatus
      ).toBe("CERRADO");

      expect(
        f.a.achievement
      ).toBe(58);

      expect(
        f.a.initialAchievement
      ).toBe(58);

      expect(
        f.a.actualExpense
      ).toBe("123456");

      expect(
        f.a.responsibleName
      ).toBe("Responsable");

      expect(
        f.a.position
      ).toBe(3);

      const r =
        await f.c.read({
          ...f.target,
          includeEvents: true,
        });

      expect(
        r.dimensions
      ).toHaveLength(2);

      expect(
        r.dimensions[1]
          .actions
      ).toHaveLength(0);

      expect(
        r.planDescription
      ).toBe(
        "Descripción plan"
      );

      expect(
        r.planStartDate
      ).toBe("2026-01-01");

      expect(
        r.dimensions[0]
          .description
      ).toBe(
        "Descripción dimensión"
      );

      expect(
        f.a.description
      ).toBe(
        "Descripción acción"
      );

      expect(
        f.a.startDate
      ).toBe("2026-02-01");

      expect(
        f.a.endDate
      ).toBe("2026-11-01");

      expect(
        f.a.currency
      ).toBe("CLP");

      expect(
        f.a.milestones.map(
          h =>
            h.initialProgressBps
        )
      ).toEqual([
        4000,
        5000,
        7000,
      ]);

      expect(
        f.a.milestones.map(
          h => h.weightBps
        )
      ).toEqual([
        2000,
        3000,
        5000,
      ]);

      expect(
        JSON.stringify(r)
      ).not.toContain(
        "snapshotTransactionId"
      );

      expect(
        JSON.stringify(r)
      ).not.toContain(
        "comments"
      );

      f.save.milestones[0]
        .progressBps = 6000;

      const updated =
        await f.c.save(
          f.save
        );

      expect(
        updated.version
      ).toBe(1);

      expect(
        updated.dimensions[0]
          .actions[0]
          .version
      ).toBe(1);

      expect(
        updated.dimensions[0]
          .actions[0]
          .achievement
      ).toBe(62);

      expect(
        (
          await db.milestone
            .findUniqueOrThrow({
              where: {
                id:
                  f.a
                    .milestones[0]
                    .sourceMilestoneId,
              },
            })
        ).progressBps
      ).toBe(6000);

      expect(
        (
          await db.action
            .findUniqueOrThrow({
              where: {
                id:
                  f.a
                    .sourceActionId,
              },
            })
        ).version
      ).toBe(1);

      const events =
        await f.c.events({
          ...f.target,

          reviewActionId:
            f.a.id,
        });

      expect(
        events
      ).toHaveLength(1);

      expect(
        events[0]
      ).toMatchObject({
        type:
          "ACTUALIZACION",

        previousBps:
          4000,

        newBps:
          6000,

        actorRole:
          role,

        confirmedAt:
          null,
      });
    }
  );
}

it(
  "rechaza segunda abierta y conserva snapshot ante edición estructural",
  async () => {
    const f =
      await fixture();

    await expect(
      f.c.start(f.input)
    ).rejects.toMatchObject({
      code: "OPEN_REVIEW",
    });

    await db.action.update({
      where: {
        id:
          f.a.sourceActionId,
      },

      data: {
        name: "Cambio",

        actualExpense:
          "999",

        milestones: {
          update: {
            where: {
              id:
                f.a
                  .milestones[0]
                  .sourceMilestoneId,
            },

            data: {
              name:
                "Cambio hito",

              weightBps:
                1000,
            },
          },
        },
      },
    });

    const r =
      await f.c.read(
        f.target
      );

    expect(
      r.dimensions[0]
        .actions[0]
    ).toEqual(f.a);
  }
);

it(
  "confirmación sin cambios incrementa ambas versiones sin eventos",
  async () => {
    const f =
      await fixture();

    const r =
      await f.c.save(
        f.save
      );

    const a =
      r.dimensions[0]
        .actions[0];

    expect(
      r.version
    ).toBe(1);

    expect(
      a.version
    ).toBe(1);

    expect(
      a.state
    ).toBe(
      "REVISADA_SIN_CAMBIOS"
    );

    expect(
      a.lastReviewedBy?.id
    ).toBe(admin.id);

    expect(
      a.lastReviewedAt
    ).toBeTruthy();

    expect(
      await f.c.events({
        ...f.target,

        reviewActionId:
          a.id,
      })
    ).toEqual([]);

    expect(
      (
        await db.action
          .findUniqueOrThrow({
            where: {
              id:
                f.a
                  .sourceActionId,
            },
          })
      ).version
    ).toBe(0);
  }
);

it(
  "admin no disminuye aunque confirme; rollback de todo el lote",
  async () => {
    const f =
      await fixture();

    f.save.milestones[0]
      .progressBps = 6000;

    f.save.milestones[2]
      .progressBps = 6000;

    await expect(
      f.c.save({
        ...f.save,

        milestones:
          f.save.milestones.map(
            h => ({
              ...h,

              confirmDecrease:
                true,

              reason:
                "Corrección",
            })
          ),
      })
    ).rejects.toMatchObject({
      code:
        "CORRECTION_FORBIDDEN",
    });

    expect(
      (
        await f.c.read(
          f.target
        )
      ).version
    ).toBe(0);

    expect(
      (
        await f.c.read(
          f.target
        )
      ).dimensions[0]
        .actions[0]
        .achievement
    ).toBe(58);
  }
);

it(
  "superusuario requiere motivo y confirmación, conserva rol histórico y estado tras confirmar",
  async () => {
    const f =
      await fixture(
        superuser
      );

    f.save.milestones[2]
      .progressBps = 6000;

    for (
      const extra of [
        {},
        {
          confirmDecrease:
            true,
        },
        {
          reason: "Error",
        },
        {
          confirmDecrease:
            true,
          reason: "   ",
        },
      ]
    ) {
      await expect(
        f.c.save({
          ...f.save,

          milestones:
            f.save.milestones.map(
              h => ({
                ...h,
                ...extra,
              })
            ),
        })
      ).rejects.toMatchObject({
        code:
          "CORRECTION_REQUIRED",
      });
    }

    const r =
      await f.c.save({
        ...f.save,

        milestones:
          f.save.milestones.map(
            h => ({
              ...h,

              confirmDecrease:
                true,

              reason:
                " Error de registro ",
            })
          ),
      });

    const e = (
      await f.c.events({
        ...f.target,

        reviewActionId:
          f.a.id,

        reviewMilestoneId:
          f.a
            .milestones[2]
            .id,
      })
    )[0];

    expect(
      e
    ).toMatchObject({
      type: "CORRECCION",

      previousBps:
        7000,

      newBps:
        6000,

      actorId:
        superuser.id,

      actorRole:
        "SUPERUSUARIO",

      reason:
        "Error de registro",
    });

    expect(
      e.confirmedAt
    ).toBe(e.createdAt);

    expect(
      r.dimensions[0]
        .actions[0]
        .achievement
    ).toBe(53);

    const confirmed =
      await f.c.save({
        ...f.save,
        version: 1,
      });

    expect(
      confirmed.version
    ).toBe(2);

    expect(
      confirmed
        .dimensions[0]
        .actions[0]
        .state
    ).toBe(
      "REVISADA_CON_CAMBIOS"
    );

    await db.user.update({
      where: {
        id:
          superuser.id,
      },

      data: {
        role:
          "ADMINISTRADOR",
      },
    });

    try {
      expect(
        (
          await f.c.events({
            ...f.target,

            reviewActionId:
              f.a.id,
          })
        )[0].actorRole
      ).toBe(
        "SUPERUSUARIO"
      );

      f.save.milestones[2]
        .progressBps =
        5000;

      await expect(
        f.c.save({
          ...f.save,

          version: 2,

          milestones:
            f.save
              .milestones
              .map(
                h => ({
                  ...h,

                  confirmDecrease:
                    true,

                  reason:
                    "Más",
                })
              ),
        })
      ).rejects.toMatchObject({
        code:
          "CORRECTION_FORBIDDEN",
      });
    } finally {
      await db.user.update({
        where: {
          id:
            superuser.id,
        },

        data: {
          role:
            "SUPERUSUARIO",
        },
      });
    }
  }
);

for (
  const mode of [
    "deleted",
    "conflict",
    "version",
  ] as const
) {
  it(
    `${mode}: rechazo y rollback completo`,
    async () => {
      const f =
        await fixture();

      f.save.milestones[0]
        .progressBps =
        6000;

      if (
        mode === "deleted"
      ) {
        await db.milestone.delete({
          where: {
            id:
              f.a
                .milestones[2]
                .sourceMilestoneId,
          },
        });
      }

      if (
        mode === "conflict"
      ) {
        await db.milestone.update({
          where: {
            id:
              f.a
                .milestones[2]
                .sourceMilestoneId,
          },

          data: {
            progressBps:
              8000,
          },
        });
      }

      if (
        mode === "version"
      ) {
        f.save.version =
          4;
      }

      await expect(
        f.c.save(f.save)
      ).rejects.toMatchObject({
        code:
          mode ===
          "deleted"
            ? "SOURCE_DELETED"
            : "CONFLICT",
      });

      const r =
        await f.c.read(
          f.target
        );

      expect(
        r.version
      ).toBe(0);

      expect(
        r.dimensions[0]
          .actions[0]
          .milestones[0]
          .progressBps
      ).toBe(4000);

      expect(
        await f.c.events({
          ...f.target,

          reviewActionId:
            f.a.id,
        })
      ).toHaveLength(0);

      expect(
        (
          await db.milestone
            .findUniqueOrThrow({
              where: {
                id:
                  f.a
                    .milestones[0]
                    .sourceMilestoneId,
              },
            })
        ).progressBps
      ).toBe(4000);

      if (
        mode === "deleted"
      ) {
        expect(
          r.dimensions[0]
            .actions[0]
            .milestones[2]
            .sourceDeleted
        ).toBe(true);
      }
    }
  );
}

it(
  "finaliza con pendientes solo con confirmación y versión vigente; nunca reabre",
  async () => {
    const f =
      await fixture();

    await expect(
      f.c.finalize({
        ...f.target,
        version: 1,
        confirmPending:
          true,
      })
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });

    await expect(
      f.c.finalize({
        ...f.target,
        version: 0,
      })
    ).rejects.toMatchObject({
      code:
        "PENDING_CONFIRMATION",
    });

    const r =
      await f.c.finalize({
        ...f.target,
        version: 0,
        confirmPending:
          true,
      });

    expect(
      r
    ).toMatchObject({
      status:
        "FINALIZADA",

      version: 1,
      pending: 1,
      reviewed: 0,
    });

    await expect(
      f.c.save(f.save)
    ).rejects.toMatchObject({
      code: "FINALIZED",
    });

    await expect(
      f.c.finalize({
        ...f.target,
        version: 1,
      })
    ).rejects.toMatchObject({
      code: "FINALIZED",
    });

    await expect(
      f.c.finalize({
        ...f.target,
        version: 1,
        status: "ABIERTA",
      })
    ).rejects.toThrow();

    await expect(
      db.planReview.update({
        where: {
          id: r.id,
        },

        data: {
          status:
            "ABIERTA",

          version: 2,
        },
      })
    ).rejects.toThrow();
  }
);

it(
  "finaliza revisada; nueva revisión y eventos anteriores consultables",
  async () => {
    const f =
      await fixture();

    f.save.milestones[0]
      .progressBps =
      6000;

    await f.c.save(
      f.save
    );

    await expect(
      f.c.finalize({
        ...f.target,
        version: 0,
      })
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });

    expect(
      await f.c.finalize({
        ...f.target,
        version: 1,
      })
    ).toMatchObject({
      status:
        "FINALIZADA",

      version: 2,
      pending: 0,
      reviewed: 1,
    });

    await f.c.start(
      f.input
    );

    expect(
      await f.c.list({
        planId:
          f.plan.id,
      })
    ).toHaveLength(2);

    expect(
      await f.c.list({
        planId:
          f.plan.id,

        status:
          "ABIERTA",
      })
    ).toHaveLength(1);

    expect(
      await f.c.list({
        planId:
          f.plan.id,

        status:
          "FINALIZADA",
      })
    ).toHaveLength(1);

    await db.$transaction(async tx => {
      await tx.dimension.delete({
        where: {
          id: f.plan.dimensions[0].id,
        },
      });

      await tx.dimension.update({
        where: {
            id: f.plan.dimensions[1].id,
          },
          data: {
            weightBps: 10000,
          },
      });
    });

    const old =
      await f.c.read({
        ...f.target,
        includeEvents:
          true,
      });

    expect(
      old.dimensions[0]
        .actions[0]
        .milestones[0]
        .events?.[0]
        .actor.id
    ).toBe(admin.id);

    expect(
      old.dimensions[0]
        .actions[0]
        .achievement
    ).toBe(62);
  }
);

it(
  "comprueba lote completo, pertenencia y actor activo dentro de BD",
  async () => {
    const f =
      await fixture();

    const other =
      await fixture();

    await expect(
      f.c.save({
        ...f.save,

        milestones:
          f.save.milestones.slice(
            1
          ),
      })
    ).rejects.toMatchObject({
      code:
        "INVALID_MILESTONES",
    });

    await expect(
      f.c.save({
        ...f.save,

        reviewActionId:
          other.a.id,
      })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    await expect(
      f.c.read({
        ...f.target,

        planId:
          other.plan.id,
      })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    await expect(
      f.c.events({
        ...f.target,

        reviewActionId:
          f.a.id,

        reviewMilestoneId:
          other.a
            .milestones[0]
            .id,
      })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    await db.user.update({
      where: {
        id: admin.id,
      },

      data: {
        active: false,
      },
    });

    try {
      await expect(
        f.c.save(f.save)
      ).rejects.toMatchObject({
        code:
          "ACCESS_DENIED",
      });

      await expect(
        f.c.read(f.target)
      ).rejects.toMatchObject({
        code:
          "ACCESS_DENIED",
      });
    } finally {
      await db.user.update({
        where: {
          id: admin.id,
        },

        data: {
          active: true,
        },
      });
    }
  }
);

it(
  "dos guardados concurrentes: uno gana, otro debe recargar",
  async () => {
    const f =
      await fixture();

    f.save.milestones[0]
      .progressBps =
      6000;

    const results =
      await Promise.allSettled([
        f.c.save(f.save),
        f.c.save(f.save),
      ]);

    expect(
      results.filter(
        r =>
          r.status ===
          "fulfilled"
      )
    ).toHaveLength(1);

    expect(
      results.find(
        r =>
          r.status ===
          "rejected"
      )
    ).toMatchObject({
      reason: {
        code:
          "CONFLICT",
      },
    });

    expect(
      (
        await f.c.read(
          f.target
        )
      ).version
    ).toBe(1);
  }
);

it(
  "guardado frente a finalización concurrente: no sobrescribe el resumen",
  async () => {
    const f =
      await fixture();

    f.save.milestones[0]
      .progressBps =
      6000;

    const results =
      await Promise.allSettled([
        f.c.save(
          f.save
        ),

        f.c.finalize({
          ...f.target,
          version: 0,

          confirmPending:
            true,
        }),
      ]);

    expect(
      results.filter(
        r =>
          r.status ===
          "fulfilled"
      )
    ).toHaveLength(1);

    const rejected =
      results.find(
        r =>
          r.status ===
          "rejected"
      );

    expect([
      "CONFLICT",
      "FINALIZED",
    ]).toContain(
      rejected?.status ===
        "rejected"
        ? rejected.reason.code
        : null
    );
  }
);

it(
  "aperturas concurrentes devuelven un conflicto de dominio y una sola abierta",
  async () => {
    const plan =
      await db.plan.create({
        data: {
          name:
            "Inicio simultáneo",

          createdById:
            admin.id,
        },
      });

    const c =
      createTrackingController(
        async () => admin,
        model
      );

    const input = {
      planId:
        plan.id,

      title: "R",

      referenceStartDate:
        "2026-01-01",

      referenceEndDate:
        "2026-12-31",
    };

    const results =
      await Promise.allSettled([
        c.start(input),
        c.start(input),
      ]);

    expect(
      results.filter(
        r =>
          r.status ===
          "fulfilled"
      )
    ).toHaveLength(1);

    const failed =
      results.find(
        r =>
          r.status ===
          "rejected"
      );

    expect([
      "OPEN_REVIEW",
      "CONFLICT",
    ]).toContain(
      failed?.status ===
        "rejected"
        ? failed.reason.code
        : null
    );

    expect(
      await db.planReview.count({
        where: {
          planId:
            plan.id,

          status:
            "ABIERTA",
        },
      })
    ).toBe(1);
  }
);

it(
  "estructura con pesos incompletos no crea revisión parcial",
  async () => {
    const f =
      await fixture();

    await f.c.finalize({
      ...f.target,
      version: 0,
      confirmPending: true,
    });

    await db.milestone.update({
      where: {
        id:
          f.a
            .milestones[0]
            .sourceMilestoneId,
      },

      data: {
        weightBps: 0,
      },
    });

    await expect(
      f.c.start(f.input)
    ).rejects.toMatchObject({
      code:
        "INVALID_STRUCTURE",
    });

    expect(
      await db.planReview.count({
        where: {
          planId:
            f.plan.id,
        },
      })
    ).toBe(1);
  }
);

it(
  "Estructura sigue editable y una edición obsoleta no pisa seguimiento",
  async () => {
    const f =
      await fixture();

    const structural = {
      planId:
        f.plan.id,

      dimensionId:
        f.plan
          .dimensions[0]
          .id,

      id:
        f.a.sourceActionId,

      version: 0,

      name:
        "Nombre actualizado",

      description:
        "Descripción",

      responsibleName:
        "Responsable",

      startDate:
        "2026-02-01",

      endDate:
        "2026-11-01",

      actualExpense:
        "100",

      confirmedRemovedIds:
        [],

      milestones:
        f.a.milestones.map(
          h => ({
            id:
              h.sourceMilestoneId,

            name:
              h.name,

            weightBps:
              h.weightBps,

            newComment:
              "",
          })
        ),
    };

    f.save.milestones[0]
      .progressBps =
      6000;

    await f.c.save(
      f.save
    );

    await expect(
      actionModel.save(
        structural,
        admin
      )
    ).rejects.toThrow(
      "cambió"
    );

    await actionModel.save(
      {
        ...structural,
        version: 1,
      },
      admin
    );

    expect(
      (
        await db.milestone
          .findUniqueOrThrow({
            where: {
              id:
                f.a
                  .milestones[0]
                  .sourceMilestoneId,
            },
          })
      ).progressBps
    ).toBe(6000);

    expect(
      (
        await f.c.read(
          f.target
        )
      ).dimensions[0]
        .actions[0]
        .name
    ).toBe("Acción");

    expect(
      (
        await db.action
          .findUniqueOrThrow({
            where: {
              id:
                f.a
                  .sourceActionId,
            },
          })
      ).name
    ).toBe(
      "Nombre actualizado"
    );
  }
);