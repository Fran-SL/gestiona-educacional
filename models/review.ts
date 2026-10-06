import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import { getDatabase } from "./db";
import {
  calculateAchievement,
  validateProgressChange,
} from "./milestone-rules";
import {
  TrackingError,
  trackingConflict,
} from "./tracking-error";
import type {
  StartReviewInput,
  SaveTrackingInput,
  FinalizeReviewInput,
  ReadReviewInput,
  ListReviewsInput,
  ReviewEventsInput,
} from "./tracking-rules";

type Tx = Prisma.TransactionClient;

type Actor = {
  id: string;
};

const actorSelect = {
  id: true,
  name: true,
} as const;

const eventInclude = {
  actor: {
    select: actorSelect,
  },
} as const;

const eventOrder = [
  {
    createdAt: "asc",
  },
  {
    actionVersion: "asc",
  },
  {
    id: "asc",
  },
] satisfies Prisma.ProgressEventOrderByWithRelationInput[];

const snapshotInclude = {
  createdBy: {
    select: actorSelect,
  },
  finalizedBy: {
    select: actorSelect,
  },
  dimensions: {
    orderBy: [
      {
        position: "asc",
      },
      {
        id: "asc",
      },
    ],
    include: {
      actions: {
        orderBy: [
          {
            position: "asc",
          },
          {
            id: "asc",
          },
        ],
        include: {
          lastReviewedBy: {
            select: actorSelect,
          },
          milestones: {
            orderBy: [
              {
                position: "asc",
              },
              {
                id: "asc",
              },
            ],
            include: {
              _count: {
                select: {
                  events: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.PlanReviewInclude;

type Snapshot = Prisma.PlanReviewGetPayload<{
  include: typeof snapshotInclude;
}>;

function header(
  r: Snapshot | Prisma.PlanReviewGetPayload<object>
) {
  return {
    id: r.id,
    planId: r.planId,
    title: r.title,
    status: r.status,
    version: r.version,

    referenceStartDate: r.referenceStartDate
      .toISOString()
      .slice(0, 10),

    referenceEndDate: r.referenceEndDate
      .toISOString()
      .slice(0, 10),

    planName: r.planName,
    planDescription: r.planDescription,
    planStatus: r.planStatus,

    planStartDate:
      r.planStartDate?.toISOString().slice(0, 10) ?? null,

    planEndDate:
      r.planEndDate?.toISOString().slice(0, 10) ?? null,

    createdAt: r.createdAt.toISOString(),
    createdById: r.createdById,

    finalizedAt:
      r.finalizedAt?.toISOString() ?? null,

    finalizedById: r.finalizedById,
    relatedReviewId: r.relatedReviewId,
  };
}

function eventDto(
  e: Prisma.ProgressEventGetPayload<{
    include: typeof eventInclude;
  }>
) {
  return {
    ...e,
    createdAt: e.createdAt.toISOString(),
    confirmedAt:
      e.confirmedAt?.toISOString() ?? null,
  };
}

function actionState(
  a: Snapshot["dimensions"][number]["actions"][number]
) {
  return a.lastReviewedAt === null
    ? "PENDIENTE"
    : a.milestones.some(h => h._count.events > 0)
      ? "REVISADA_CON_CAMBIOS"
      : "REVISADA_SIN_CAMBIOS";
}

async function activeActor(
  tx: Tx,
  actor: Actor
) {
  const rows = await tx.$queryRaw<
    {
      id: string;
      role: "SUPERUSUARIO" | "ADMINISTRADOR";
      active: boolean;
    }[]
  >`
    SELECT id, role, active
    FROM users
    WHERE id = ${actor.id}
    FOR SHARE
  `;

  const user = rows[0];

  if (
    !user?.active ||
    !["SUPERUSUARIO", "ADMINISTRADOR"].includes(
      user.role
    )
  ) {
    throw new TrackingError(
      "ACCESS_DENIED",
      "Tu sesión no permite esta operación. Vuelve a iniciar sesión."
    );
  }

  return user;
}

async function lockedReview(
  tx: Tx,
  input: {
    planId: string;
    reviewId: string;
  }
) {
  const rows = await tx.$queryRaw<
    {
      id: string;
    }[]
  >`
    SELECT id
    FROM plan_reviews
    WHERE id = ${input.reviewId}
      AND "planId" = ${input.planId}
    FOR UPDATE
  `;

  if (!rows.length) {
    throw new TrackingError(
      "NOT_FOUND",
      "La revisión no pertenece a este plan o no existe."
    );
  }

  const review =
    await tx.planReview.findUniqueOrThrow({
      where: {
        id: input.reviewId,
      },
    });

  if (review.status !== "ABIERTA") {
    throw new TrackingError(
      "FINALIZED",
      "La revisión está finalizada y no admite cambios."
    );
  }

  return review;
}

async function operationTime(tx: Tx) {
  // Epoch text avoids timezone-dependent decoding
  // of raw timestamptz by the adapter.
  const [row] = await tx.$queryRaw<
    {
      millis: string;
    }[]
  >`
    SELECT round(
      extract(epoch FROM clock_timestamp()) * 1000
    )::text AS millis
  `;

  return new Date(Number(row.millis));
}

async function safe<T>(
  work: () => Promise<T>,
  starting = false
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof TrackingError) {
      throw error;
    }

    if (
      error instanceof
      Prisma.PrismaClientKnownRequestError
    ) {
      if (
        starting &&
        error.code === "P2002"
      ) {
        throw new TrackingError(
          "OPEN_REVIEW",
          "El plan ya tiene una revisión abierta. Ábrela para continuar."
        );
      }

      if (
        ["P2034", "P2028", "P2025"].includes(
          error.code
        )
      ) {
        trackingConflict();
      }

      if (
        error.code === "P2010" &&
        ["40001", "40P01", "55P03"].includes(
          String(error.meta?.code)
        )
      ) {
        trackingConflict();
      }
    }

    throw new TrackingError(
      "SAVE_FAILED",
      "No se pudo completar la operación. Recarga y revisa los datos antes de intentarlo nuevamente."
    );
  }
}

async function detail(
  tx: Tx,
  input: ReadReviewInput
) {
  const r = await tx.planReview.findFirst({
    where: {
      id: input.reviewId,
      planId: input.planId,
    },
    include: snapshotInclude,
  });

  if (!r) {
    throw new TrackingError(
      "NOT_FOUND",
      "La revisión no pertenece a este plan o no existe."
    );
  }

  const sourceIds = r.dimensions.flatMap(d =>
    d.actions.flatMap(a =>
      a.milestones.map(
        h => h.sourceMilestoneId
      )
    )
  );

  const live = await tx.milestone.findMany({
    where: {
      id: {
        in: sourceIds,
      },
    },
    select: {
      id: true,
      actionId: true,
      action: {
        select: {
          dimension: {
            select: {
              planId: true,
            },
          },
        },
      },
    },
  });

  const sources = new Map(
    live.map(h => [h.id, h])
  );

  const events = input.includeEvents
    ? await tx.progressEvent.findMany({
        where: {
          reviewMilestone: {
            reviewAction: {
              reviewDimension: {
                reviewId: r.id,
              },
            },
          },
        },
        include: eventInclude,
        orderBy: eventOrder,
      })
    : undefined;

  return {
    ...header(r),
    createdBy: r.createdBy,
    finalizedBy: r.finalizedBy,

    dimensions: r.dimensions.map(d => ({
      id: d.id,
      sourceDimensionId: d.sourceDimensionId,
      name: d.name,
      description: d.description,
      position: d.position,

      actions: d.actions.map(a => ({
        id: a.id,
        sourceActionId: a.sourceActionId,
        name: a.name,
        description: a.description,
        responsibleName: a.responsibleName,
        position: a.position,

        startDate: a.startDate
          .toISOString()
          .slice(0, 10),

        endDate: a.endDate
          .toISOString()
          .slice(0, 10),

        actualExpense:
          a.actualExpense?.toString() ?? null,

        currency: a.currency,
        version: a.version,

        lastReviewedAt:
          a.lastReviewedAt?.toISOString() ?? null,

        lastReviewedBy:
          a.lastReviewedBy,

        state: actionState(a),

        achievement:
          calculateAchievement(a.milestones),

        initialAchievement:
          calculateAchievement(
            a.milestones.map(h => ({
              ...h,
              progressBps:
                h.initialProgressBps,
            }))
          ),

        milestones: a.milestones.map(h => {
          const current = sources.get(
            h.sourceMilestoneId
          );

          return {
            id: h.id,
            sourceMilestoneId:
              h.sourceMilestoneId,
            name: h.name,
            position: h.position,
            weightBps: h.weightBps,

            initialProgressBps:
              h.initialProgressBps,

            progressBps:
              h.progressBps,

            sourceDeleted: !current,

            sourceAvailable:
              !!current &&
              current.actionId ===
                a.sourceActionId &&
              current.action.dimension.planId ===
                r.planId,

            ...(events
              ? {
                  events: events
                    .filter(
                      e =>
                        e.reviewMilestoneId ===
                        h.id
                    )
                    .map(eventDto),
                }
              : {}),
          };
        }),
      })),
    })),
  };
}

export function createReviewModel(
  database: () => PrismaClient = getDatabase
) {
  return {
    async start(
      input: StartReviewInput,
      actor: Actor
    ) {
      return safe(
        () =>
          database().$transaction(
            async tx => {
              const user =
                await activeActor(
                  tx,
                  actor
                );

              const plan =
                await tx.plan.findUnique({
                  where: {
                    id: input.planId,
                  },
                  include: {
                    dimensions: {
                      orderBy: [
                        {
                          position: "asc",
                        },
                        {
                          id: "asc",
                        },
                      ],
                      include: {
                        actions: {
                          orderBy: [
                            {
                              position: "asc",
                            },
                            {
                              id: "asc",
                            },
                          ],
                          include: {
                            milestones: {
                              orderBy: [
                                {
                                  position:
                                    "asc",
                                },
                                {
                                  id: "asc",
                                },
                              ],
                            },
                          },
                        },
                      },
                    },
                  },
                });

              if (!plan) {
                throw new TrackingError(
                  "NOT_FOUND",
                  "El plan no existe."
                );
              }

              if (
                await tx.planReview.findFirst({
                  where: {
                    planId: plan.id,
                    status: "ABIERTA",
                  },
                })
              ) {
                throw new TrackingError(
                  "OPEN_REVIEW",
                  "El plan ya tiene una revisión abierta. Ábrela para continuar."
                );
              }

              for (
                const d of plan.dimensions
              ) {
                for (
                  const a of d.actions
                ) {
                  if (
                    !a.milestones.length ||
                    a.milestones.reduce(
                      (sum, h) =>
                        sum + h.weightBps,
                      0
                    ) !== 10000
                  ) {
                    throw new TrackingError(
                      "INVALID_STRUCTURE",
                      "Cada acción necesita al menos un hito y pesos que sumen 100%. Revisa Estructura."
                    );
                  }
                }
              }

              const r =
                await tx.planReview.create({
                  data: {
                    planId: plan.id,
                    title: input.title,

                    referenceStartDate:
                      new Date(
                        input.referenceStartDate
                      ),

                    referenceEndDate:
                      new Date(
                        input.referenceEndDate
                      ),

                    planName: plan.name,

                    planDescription:
                      plan.description,

                    planStartDate:
                      plan.startDate,

                    planEndDate:
                      plan.endDate,

                    planStatus:
                      plan.status,

                    createdById:
                      user.id,
                  },
                });

              for (
                const d of plan.dimensions
              ) {
                const rd =
                  await tx.reviewDimension.create(
                    {
                      data: {
                        reviewId: r.id,

                        sourceDimensionId:
                          d.id,

                        name: d.name,

                        description:
                          d.description,

                        position:
                          d.position,

                        // Snapshot del peso de la dimensión.
                        weightBps:
                          d.weightBps,
                      },
                    }
                  );

                for (
                  const a of d.actions
                ) {
                  const ra =
                    await tx.reviewAction.create(
                      {
                        data: {
                          reviewDimensionId:
                            rd.id,

                          sourceActionId:
                            a.id,

                          name: a.name,

                          description:
                            a.description,

                          responsibleName:
                            a.responsibleName,

                          startDate:
                            a.startDate,

                          endDate:
                            a.endDate,

                          actualExpense:
                            a.actualExpense,

                          currency:
                            a.currency,

                          position:
                            a.position,

                          // Snapshot del peso de la acción.
                          weightBps:
                            a.weightBps,
                        },
                      }
                    );

                  await tx.reviewMilestone.createMany(
                    {
                      data:
                        a.milestones.map(
                          h => ({
                            reviewActionId:
                              ra.id,

                            sourceMilestoneId:
                              h.id,

                            name: h.name,

                            position:
                              h.position,

                            weightBps:
                              h.weightBps,

                            initialProgressBps:
                              h.progressBps,

                            progressBps:
                              h.progressBps,
                          })
                        ),
                    }
                  );
                }
              }

              return header(r);
            },
            {
              isolationLevel:
                "RepeatableRead",
              timeout: 15000,
            }
          ),
        true
      );
    },

    async read(
      input: ReadReviewInput,
      actor: Actor
    ) {
      return safe(() =>
        database().$transaction(
          async tx => {
            await activeActor(
              tx,
              actor
            );

            return detail(
              tx,
              input
            );
          },
          {
            isolationLevel:
              "RepeatableRead",
          }
        )
      );
    },

    async list(
      input: ListReviewsInput,
      actor: Actor
    ) {
      return safe(() =>
        database().$transaction(
          async tx => {
            await activeActor(
              tx,
              actor
            );

            if (
              !await tx.plan.findUnique({
                where: {
                  id: input.planId,
                },
                select: {
                  id: true,
                },
              })
            ) {
              throw new TrackingError(
                "NOT_FOUND",
                "El plan no existe."
              );
            }

            const rows =
              await tx.planReview.findMany({
                where: {
                  planId:
                    input.planId,

                  status:
                    input.status,
                },

                orderBy: [
                  {
                    createdAt: "desc",
                  },
                  {
                    id: "desc",
                  },
                ],

                include: {
                  createdBy: {
                    select:
                      actorSelect,
                  },

                  finalizedBy: {
                    select:
                      actorSelect,
                  },

                  dimensions: {
                    select: {
                      actions: {
                        select: {
                          lastReviewedAt:
                            true,
                        },
                      },
                    },
                  },
                },
              });

            return rows.map(r => {
              const actions =
                r.dimensions.flatMap(
                  d => d.actions
                );

              const pending =
                actions.filter(
                  a =>
                    a.lastReviewedAt ===
                    null
                ).length;

              return {
                ...header(r),
                createdBy:
                  r.createdBy,
                finalizedBy:
                  r.finalizedBy,
                pending,
                reviewed:
                  actions.length -
                  pending,
              };
            });
          },
          {
            isolationLevel:
              "RepeatableRead",
          }
        )
      );
    },

    async events(
      input: ReviewEventsInput,
      actor: Actor
    ) {
      return safe(() =>
        database().$transaction(
          async tx => {
            await activeActor(
              tx,
              actor
            );

            const action =
              await tx.reviewAction.findFirst(
                {
                  where: {
                    id:
                      input.reviewActionId,

                    reviewDimension: {
                      reviewId:
                        input.reviewId,

                      review: {
                        planId:
                          input.planId,
                      },
                    },
                  },

                  select: {
                    id: true,
                  },
                }
              );

            if (!action) {
              throw new TrackingError(
                "NOT_FOUND",
                "La acción no pertenece a esta revisión."
              );
            }

            if (
              input.reviewMilestoneId &&
              !await tx.reviewMilestone.findFirst(
                {
                  where: {
                    id:
                      input.reviewMilestoneId,

                    reviewActionId:
                      action.id,
                  },
                }
              )
            ) {
              throw new TrackingError(
                "NOT_FOUND",
                "El hito no pertenece a esta acción."
              );
            }

            return (
              await tx.progressEvent.findMany(
                {
                  where: {
                    reviewMilestone: {
                      reviewActionId:
                        action.id,

                      id:
                        input.reviewMilestoneId,
                    },
                  },

                  include:
                    eventInclude,

                  orderBy:
                    eventOrder,
                }
              )
            ).map(eventDto);
          },
          {
            isolationLevel:
              "RepeatableRead",
          }
        )
      );
    },

    async save(
      input: SaveTrackingInput,
      actor: Actor
    ) {
      return safe(() =>
        database().$transaction(
          async tx => {
            const user =
              await activeActor(
                tx,
                actor
              );

            await lockedReview(
              tx,
              input
            );

            const action =
              await tx.reviewAction.findFirst(
                {
                  where: {
                    id:
                      input.reviewActionId,

                    reviewDimension: {
                      reviewId:
                        input.reviewId,
                    },
                  },

                  include: {
                    milestones: true,
                  },
                }
              );

            if (!action) {
              throw new TrackingError(
                "NOT_FOUND",
                "La acción no pertenece a esta revisión."
              );
            }

            if (
              action.version !==
              input.version
            ) {
              trackingConflict();
            }

            if (
              action.milestones.length !==
                input.milestones.length ||
              input.milestones.some(
                h =>
                  !action.milestones.some(
                    old =>
                      old.id ===
                      h.reviewMilestoneId
                  )
              )
            ) {
              throw new TrackingError(
                "INVALID_MILESTONES",
                "Envía todos los hitos de esta acción, sin agregar ni omitir ninguno."
              );
            }

            // Same parent-before-child order as
            // structural editing/deletion.
            // Release at commit.
            const dimensions =
              await tx.$queryRaw<
                {
                  id: string;
                }[]
              >`
                SELECT d.id
                FROM dimensions d
                JOIN actions a
                  ON a."dimensionId" = d.id
                WHERE a.id = ${action.sourceActionId}
                  AND d."planId" = ${input.planId}
                FOR SHARE OF d
              `;

            if (
              !dimensions.length
            ) {
              throw new TrackingError(
                "SOURCE_DELETED",
                "La acción original fue eliminada o ya no pertenece al plan. No se guardó ningún avance."
              );
            }

            const originals =
              await tx.$queryRaw<
                {
                  id: string;
                  dimensionId: string;
                }[]
              >`
                SELECT id, "dimensionId"
                FROM actions
                WHERE id = ${action.sourceActionId}
                FOR UPDATE
              `;

            if (
              !originals.length ||
              originals[0]
                .dimensionId !==
                dimensions[0].id
            ) {
              trackingConflict();
            }

            const originalsHitos =
              await tx.$queryRaw<
                {
                  id: string;
                  progressBps: number;
                }[]
              >`
                SELECT id, "progressBps"
                FROM milestones
                WHERE "actionId" = ${action.sourceActionId}
                ORDER BY id
                FOR UPDATE
              `;

            const live = new Map(
              originalsHitos.map(h => [
                h.id,
                h,
              ])
            );

            const changes =
              input.milestones.map(h => {
                const old =
                  action.milestones.find(
                    m =>
                      m.id ===
                      h.reviewMilestoneId
                  )!;

                const current =
                  live.get(
                    old.sourceMilestoneId
                  );

                if (!current) {
                  throw new TrackingError(
                    "SOURCE_DELETED",
                    "Un hito original fue eliminado. No se guardó ningún avance de la acción."
                  );
                }

                if (
                  current.progressBps !==
                  old.progressBps
                ) {
                  trackingConflict();
                }

                if (
                  h.progressBps <
                  old.progressBps
                ) {
                  try {
                    validateProgressChange(
                      old.progressBps,
                      h.progressBps,
                      user.role
                    );
                  } catch {
                    throw new TrackingError(
                      "CORRECTION_FORBIDDEN",
                      "Solo el superusuario puede corregir un avance hacia abajo."
                    );
                  }

                  if (
                    !h.confirmDecrease ||
                    !h.reason?.trim()
                  ) {
                    throw new TrackingError(
                      "CORRECTION_REQUIRED",
                      "Confirma explícitamente cada disminución e ingresa su motivo."
                    );
                  }
                }

                return {
                  h,
                  old,
                };
              });

            const at =
              await operationTime(tx);

            await tx.reviewAction.update({
              where: {
                id: action.id,
              },

              data: {
                version: {
                  increment: 1,
                },

                lastReviewedAt:
                  at,

                lastReviewedById:
                  user.id,
              },
            });

            // The review trigger increments
            // PlanReview.version once;
            // do not increment it here.
            for (
              const {
                h,
                old,
              } of changes
            ) {
              if (
                h.progressBps ===
                old.progressBps
              ) {
                continue;
              }

              const correction =
                h.progressBps <
                old.progressBps;

              await tx.progressEvent.create(
                {
                  data: {
                    reviewMilestoneId:
                      old.id,

                    actionVersion:
                      action.version + 1,

                    previousBps:
                      old.progressBps,

                    newBps:
                      h.progressBps,

                    type: correction
                      ? "CORRECCION"
                      : "ACTUALIZACION",

                    reason: correction
                      ? h.reason
                      : null,

                    confirmedAt:
                      correction
                        ? at
                        : null,

                    createdAt: at,
                    actorId: user.id,
                    actorRole:
                      user.role,
                  },
                }
              );

              await tx.reviewMilestone.update(
                {
                  where: {
                    id: old.id,
                  },

                  data: {
                    progressBps:
                      h.progressBps,
                  },
                }
              );

              await tx.milestone.update({
                where: {
                  id:
                    old.sourceMilestoneId,
                },

                data: {
                  progressBps:
                    h.progressBps,
                },
              });
            }

            if (
              changes.some(
                ({
                  h,
                  old,
                }) =>
                  h.progressBps !==
                  old.progressBps
              )
            ) {
              await tx.action.update({
                where: {
                  id:
                    action.sourceActionId,
                },

                data: {
                  version: {
                    increment: 1,
                  },
                },
              });
            }

            return detail(tx, {
              planId:
                input.planId,

              reviewId:
                input.reviewId,

              includeEvents:
                false,
            });
          },
          {
            timeout: 15000,
          }
        )
      );
    },

    async finalize(
      input: FinalizeReviewInput,
      actor: Actor
    ) {
      return safe(() =>
        database().$transaction(
          async tx => {
            const user =
              await activeActor(
                tx,
                actor
              );

            const review =
              await lockedReview(
                tx,
                input
              );

            if (
              review.version !==
              input.version
            ) {
              trackingConflict();
            }

            const where = {
              reviewDimension: {
                reviewId:
                  review.id,
              },
            };

            const total =
              await tx.reviewAction.count({
                where,
              });

            const pending =
              await tx.reviewAction.count({
                where: {
                  ...where,
                  lastReviewedAt:
                    null,
                },
              });

            if (
              pending &&
              !input.confirmPending
            ) {
              throw new TrackingError(
                "PENDING_CONFIRMATION",
                `${pending} acciones siguen pendientes. Confirma explícitamente si deseas finalizar igualmente.`
              );
            }

            const closed =
              await tx.planReview.update({
                where: {
                  id: review.id,
                },

                data: {
                  status:
                    "FINALIZADA",

                  finalizedAt:
                    await operationTime(
                      tx
                    ),

                  finalizedById:
                    user.id,

                  version: {
                    increment: 1,
                  },
                },
              });

            return {
              ...header(closed),
              pending,
              reviewed:
                total - pending,
            };
          }
        )
      );
    },
  };
}

export const reviewModel =
  createReviewModel();