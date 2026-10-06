import "server-only";

import { getDatabase } from "./db";
import { actionInputSchema, type ActionInput } from "./action-rules";
import { StructureError } from "./plan-structure";

export const actionModel = {
  async save(
    input: ActionInput,
    actor: {
      id: string;
      role: "SUPERUSUARIO" | "ADMINISTRADOR";
    }
  ) {
    const data = actionInputSchema.parse(input);

    return getDatabase().$transaction(async tx => {
      const dimension = await tx.dimension.findFirst({
        where: {
          id: data.dimensionId,
          planId: data.planId,
        },
      });

      if (!dimension) {
        throw new StructureError(
          "La dimensión ya no pertenece a este plan."
        );
      }

      const previous = data.id
        ? await tx.action.findFirst({
            where: {
              id: data.id,
              dimensionId: data.dimensionId,
            },
            include: {
              milestones: true,
            },
          })
        : null;

      if (data.id && !previous) {
        throw new StructureError(
          "La acción ya no existe en esta dimensión."
        );
      }

      if (previous && previous.version !== data.version) {
        throw new StructureError(
          "La acción cambió. Recarga la página antes de guardar para no sobrescribir cambios."
        );
      }

      for (const milestone of data.milestones) {
        if (!milestone.id) continue;

        const old = previous?.milestones.find(
          h => h.id === milestone.id
        );

        if (!old) {
          throw new StructureError(
            "Uno de los hitos no pertenece a esta acción."
          );
        }
      }

      const retained = data.milestones.flatMap(h =>
        h.id ? [h.id] : []
      );

      const removed =
        previous?.milestones
          .filter(h => !retained.includes(h.id))
          .map(h => h.id) ?? [];

      if (
        removed.length !== data.confirmedRemovedIds.length ||
        removed.some(
          id => !data.confirmedRemovedIds.includes(id)
        )
      ) {
        throw new StructureError(
          "Confirma los hitos y comentarios que se eliminarán antes de guardar."
        );
      }

      const fields = {
        name: data.name,
        description: data.description,
        responsibleName: data.responsibleName,
        startDate: new Date(`${data.startDate}T00:00:00Z`),
        endDate: new Date(`${data.endDate}T00:00:00Z`),
        actualExpense: data.actualExpense,
        currency: "CLP",
      };

      let actionId: string;

      if (previous) {
        const updated = await tx.action.updateMany({
          where: {
            id: previous.id,
            version: data.version,
          },
          data: {
            ...fields,
            version: {
              increment: 1,
            },
          },
        });

        if (!updated.count) {
          throw new StructureError(
            "La acción cambió. Recarga la página antes de guardar."
          );
        }

        actionId = previous.id;

        await tx.milestone.deleteMany({
          where: {
            actionId,
            id: {
              in: removed,
            },
          },
        });
      } else {
        const actionCount = await tx.action.count({
          where: {
            dimensionId: data.dimensionId,
          },
        });

        const newAction = await tx.action.create({
          data: {
            ...fields,
            dimensionId: data.dimensionId,
            weightBps: actionCount === 0 ? 10000 : 0,
          },
        });

        actionId = newAction.id;
      }

      for (const [position, h] of data.milestones.entries()) {
        // Structural updates never write progress, including values read earlier.
        const milestoneFields = {
          name: h.name,
          weightBps: h.weightBps,
          position,
        };

        const milestone = h.id
          ? await tx.milestone.update({
              where: {
                id: h.id,
              },
              data: milestoneFields,
            })
          : await tx.milestone.create({
              data: {
                ...milestoneFields,
                progressBps: 0,
                actionId,
              },
            });

        if (h.newComment) {
          await tx.milestoneComment.create({
            data: {
              milestoneId: milestone.id,
              authorId: actor.id,
              body: h.newComment,
            },
          });
        }
      }

      return {
        id: actionId,
      };
    });
  },
};

