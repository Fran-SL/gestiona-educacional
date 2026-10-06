import "dotenv/config";

import {
  test,
  expect,
  type Page,
} from "@playwright/test";

import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
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
    "Usa test:tracking:ui con esquema aislado."
  );
}

const db = new PrismaClient({
  adapter: databaseAdapter(url),
});

test.setTimeout(90_000);

test.beforeEach(async () => {
  await pause(11_000);
});

test.afterAll(async () => {
  await db.$disconnect();
});

async function setup(
  page: Page,
  role:
    | "ADMINISTRADOR"
    | "SUPERUSUARIO" = "ADMINISTRADOR"
) {
  const id = randomUUID();
  const password = randomUUID();
  const email = `${id}@example.invalid`;

  await db.user.create({
    data: {
      id,
      name: "Usuario de prueba",
      email,
      role,

      accounts: {
        create: {
          accountId: id,
          providerId: "credential",
          password:
            await hashPassword(password),
        },
      },
    },
  });

  const action = (
    name: string,
    position: number,
    weightBps: number
  ) => ({
    name,
    position,
    weightBps,

    description:
      "Descripción histórica para la reunión",

    responsibleName:
      "Responsable de prueba",

    startDate:
      new Date("2026-01-01"),

    endDate:
      new Date("2026-12-31"),

    actualExpense: "850000",

    milestones: {
      create: [
        2000,
        3000,
        5000,
      ].map(
        (weightBps, i) => ({
          name:
            `${name} · Hito ${i + 1}`,

          weightBps,

          progressBps: [
            4000,
            5000,
            7000,
          ][i],

          position: i,
        })
      ),
    },
  });

  const plan =
    await db.plan.create({
      data: {
        name:
          "Plan de reunión ficticio",

        createdById: id,

        dimensions: {
          create: [
            {
              name:
                "Gestión pedagógica",

              position: 0,

              // 33,34% del plan.
              weightBps: 3334,

              actions: {
                create: [
                  action(
                    "Acción A",
                    0,
                    5000
                  ),

                  action(
                    "Acción B",
                    1,
                    5000
                  ),
                ],
              },
            },

            {
              name: "Liderazgo",
              position: 1,

              // 33,33% del plan.
              weightBps: 3333,

              actions: {
                create: action(
                  "Acción C",
                  0,
                  10000
                ),
              },
            },

            {
              name:
                "Dimensión vacía",

              position: 2,

              // 33,33% del plan.
              weightBps: 3333,
            },
          ],
        },
      },
    });

  await page.goto("/login");

  await page
    .getByLabel(
      "Correo electrónico"
    )
    .fill(email);

  await page
    .getByLabel(
      "Contraseña",
      {
        exact: true,
      }
    )
    .fill(password);

  await page
    .getByRole(
      "button",
      {
        name: "Ingresar",
        exact: true,
      }
    )
    .click();

  await expect(
    page
  ).toHaveURL(
    "http://localhost:3100/"
  );

  await page.goto(
    `/planes/${plan.id}`
  );

  await page
    .getByRole(
      "link",
      {
        name:
          "Estado de avance",
        exact: true,
      }
    )
    .click();

  await page
    .getByRole(
      "button",
      {
        name:
          "Iniciar revisión",
        exact: true,
      }
    )
    .click();

  await page
    .getByLabel(
      "Título",
      {
        exact: true,
      }
    )
    .fill(
      "Reunión de prueba"
    );

  await page
    .getByLabel(
      "Inicio del período"
    )
    .fill("2026-03-01");

  await page
    .getByLabel(
      "Fin del período"
    )
    .fill("2026-06-30");

  await page
    .getByRole(
      "button",
      {
        name:
          "Crear revisión",
        exact: true,
      }
    )
    .click();

  await expect(
    page.getByRole(
      "heading",
      {
        name: "Acción A",
        exact: true,
      }
    )
  ).toBeVisible();

  return plan;
}

const input = (
  page: Page,
  n: number
) =>
  page.getByRole(
    "textbox",
    {
      name:
        `Nuevo avance de Acción A · Hito ${n} (%)`,
      exact: true,
    }
  );

const actionHeading = (
  page: Page,
  name: string
) =>
  page.getByRole(
    "heading",
    {
      name,
      exact: true,
    }
  );

async function save(
  page: Page
) {
  await page
    .getByRole(
      "button",
      {
        name:
          "Guardar seguimiento",
        exact: true,
      }
    )
    .click();

  await expect(
    page
      .getByRole("status")
      .filter({
        hasText:
          "Seguimiento guardado.",
      })
  ).toBeVisible();
}

test(
  "admin: inicio, N hitos, aumento, disminución bloqueada, confirmación e historial",
  async ({ page }) => {
    await setup(page);

    await expect(
      page.getByRole(
        "textbox",
        {
          name: /Nuevo avance/,
        }
      )
    ).toHaveCount(3);

    await input(page, 1).fill(
      "60"
    );

    await input(page, 2).fill(
      "60,50"
    );

    await input(page, 3).fill(
      "80"
    );

    await expect(
      page.getByText(
        "Resultado propuesto: 70,15 % · Sin guardar",
        {
          exact: true,
        }
      )
    ).toBeVisible();

    await save(page);

    await expect(
      page.getByText(
        "70,15 %",
        {
          exact: true,
        }
      )
    ).toBeVisible();

    await expect(
      page.getByText(
        "Revisadas: 1",
        {
          exact: true,
        }
      )
    ).toBeVisible();

    await input(page, 1).fill(
      "50"
    );

    await expect(
      page
        .getByRole("alert")
        .filter({
          hasText:
            "Solo el superusuario",
        })
    ).toBeVisible();

    await expect(
      page.getByRole(
        "button",
        {
          name:
            "Guardar seguimiento",
          exact: true,
        }
      )
    ).toBeDisabled();

    await page
      .getByRole(
        "button",
        {
          name:
            "Restaurar valor guardado",
        }
      )
      .click();

    await page
      .getByRole(
        "button",
        {
          name:
            "Confirmar revisión sin cambios",
          exact: true,
        }
      )
      .click();

    await expect(
      page.getByText(
        "Revisión confirmada sin cambios de avance.",
        {
          exact: true,
        }
      )
    ).toBeVisible();

    await page
      .getByText(
        "Ver historial de esta acción",
        {
          exact: true,
        }
      )
      .click();

    await expect(
      page.getByText(
        "Actualización · Acción A · Hito 1",
        {
          exact: true,
        }
      )
    ).toBeVisible();

    await expect(
      page.getByText(
        "40 % → 60 %",
        {
          exact: true,
        }
      )
    ).toBeVisible();

    await expect(
      page.getByText(
        /Última confirmación:/
      )
    ).toBeVisible();

    await page
      .getByRole(
        "button",
        {
          name:
            "Siguiente →",
          exact: true,
        }
      )
      .click();

    await expect(
      actionHeading(
        page,
        "Acción B"
      )
    ).toBeVisible();

    await page
      .getByRole(
        "button",
        {
          name:
            "Confirmar revisión sin cambios",
          exact: true,
        }
      )
      .click();

    await expect(
      page.getByText(
        "Revisadas: 2",
        {
          exact: true,
        }
      )
    ).toBeVisible();

    await page
      .getByRole(
        "button",
        {
          name: /Liderazgo/,
        }
      )
      .click();

    await expect(
      actionHeading(
        page,
        "Acción C"
      )
    ).toBeVisible();

    await page
      .getByRole(
        "button",
        {
          name:
            "Confirmar revisión sin cambios",
          exact: true,
        }
      )
      .click();

    await expect(
      page.getByText(
        "Pendientes: 0",
        {
          exact: true,
        }
      )
    ).toBeVisible();

    await page
      .getByRole(
        "button",
        {
          name:
            "Finalizar revisión",
          exact: true,
        }
      )
      .click();

    await expect(
      page.getByRole(
        "checkbox",
        {
          name:
            /Confirmo finalizar/,
        }
      )
    ).toHaveCount(0);

    await page
      .getByRole(
        "button",
        {
          name:
            "Confirmar finalización",
          exact: true,
        }
      )
      .click();

    await expect(
      page.getByText(
        "🔒 Revisión finalizada · Solo lectura",
        {
          exact: true,
        }
      )
    ).toBeVisible();

    await expect(
      page.getByRole(
        "textbox",
        {
          name: /Nuevo avance/,
        }
      )
    ).toHaveCount(0);

    await expect(
      page.getByRole(
        "button",
        {
          name: /Reabrir/,
        }
      )
    ).toHaveCount(0);
  }
);

test(
  "superusuario: múltiples correcciones con motivos individuales y confirmación invalidada",
  async ({ page }) => {
    await setup(
      page,
      "SUPERUSUARIO"
    );

    await input(page, 1).fill(
      "30"
    );

    await input(page, 3).fill(
      "60"
    );

    await page
      .getByRole(
        "button",
        {
          name:
            "Guardar seguimiento",
          exact: true,
        }
      )
      .click();

    const commit =
      page.getByRole(
        "button",
        {
          name:
            "Confirmar correcciones y guardar acción",
          exact: true,
        }
      );

    await expect(
      commit
    ).toBeDisabled();

    await page
      .getByLabel(
        "Motivo de corrección de Acción A · Hito 1",
        {
          exact: true,
        }
      )
      .fill(
        "Registro rectificado"
      );

    await page
      .getByLabel(
        "Confirmo la disminución de Acción A · Hito 1",
        {
          exact: true,
        }
      )
      .check();

    await page
      .getByLabel(
        "Motivo de corrección de Acción A · Hito 3",
        {
          exact: true,
        }
      )
      .fill(
        "Corrección de evidencia"
      );

    await page
      .getByLabel(
        "Confirmo la disminución de Acción A · Hito 3",
        {
          exact: true,
        }
      )
      .check();

    await expect(
      commit
    ).toBeEnabled();

    await page
      .getByLabel(
        "Motivo de corrección de Acción A · Hito 1"
      )
      .fill(
        "Motivo revisado"
      );

    await expect(
      page.getByLabel(
        "Confirmo la disminución de Acción A · Hito 1",
        {
          exact: true,
        }
      )
    ).not.toBeChecked();

    await expect(
      commit
    ).toBeDisabled();

    await page
      .getByLabel(
        "Confirmo la disminución de Acción A · Hito 1",
        {
          exact: true,
        }
      )
      .check();

    await input(page, 3).fill(
      "55"
    );

    await expect(
      page.getByLabel(
        "Confirmo la disminución de Acción A · Hito 3",
        {
          exact: true,
        }
      )
    ).not.toBeChecked();

    await page
      .getByLabel(
        "Confirmo la disminución de Acción A · Hito 3",
        {
          exact: true,
        }
      )
      .check();

    await commit.click();

    await expect(
      page.getByText(
        "Seguimiento guardado.",
        {
          exact: true,
        }
      )
    ).toBeVisible();

    await expect(
      page.getByText(
        "48,5 %",
        {
          exact: true,
        }
      )
    ).toBeVisible();

    await page
      .getByText(
        "Ver historial de esta acción",
        {
          exact: true,
        }
      )
      .click();

    await expect(
      page.getByText(
        "Motivo: Motivo revisado",
        {
          exact: true,
        }
      )
    ).toBeVisible();

    await expect(
      page.getByText(
        "Motivo: Corrección de evidencia",
        {
          exact: true,
        }
      )
    ).toBeVisible();

    await page
      .getByRole(
        "button",
        {
          name:
            "Finalizar revisión",
          exact: true,
        }
      )
      .click();

    await expect(
      page.getByRole(
        "button",
        {
          name:
            "Confirmar finalización",
          exact: true,
        }
      )
    ).toBeDisabled();

    await page
      .getByLabel(
        "Confirmo finalizar con 2 acciones pendientes.",
        {
          exact: true,
        }
      )
      .check();

    await page
      .getByRole(
        "button",
        {
          name:
            "Confirmar finalización",
          exact: true,
        }
      )
      .click();

    await expect(
      page.getByText(
        "🔒 Revisión finalizada · Solo lectura",
        {
          exact: true,
        }
      )
    ).toBeVisible();
  }
);

test(
  "navegación protege borradores entre acciones, dimensiones, secciones y revisiones",
  async ({ page }) => {
    await setup(page);

    await input(page, 1).fill(
      "60"
    );

    await page
      .getByRole(
        "button",
        {
          name:
            "Siguiente →",
          exact: true,
        }
      )
      .click();

    await expect(
      page.getByRole(
        "heading",
        {
          name:
            "Cambios sin guardar",
          exact: true,
        }
      )
    ).toBeVisible();

    await page
      .getByRole(
        "button",
        {
          name:
            "Seguir editando",
          exact: true,
        }
      )
      .click();

    await expect(
      input(page, 1)
    ).toHaveValue("60");

    await page
      .getByRole(
        "button",
        {
          name: /Liderazgo/,
        }
      )
      .click();

    await page
      .getByRole(
        "button",
        {
          name:
            "Descartar y continuar",
          exact: true,
        }
      )
      .click();

    await expect(
      actionHeading(
        page,
        "Acción C"
      )
    ).toBeVisible();

    await page
      .getByRole(
        "button",
        {
          name:
            "← Anterior",
          exact: true,
        }
      )
      .click();

    await expect(
      actionHeading(
        page,
        "Acción B"
      )
    ).toBeVisible();

    await page
      .getByRole(
        "button",
        {
          name:
            "← Anterior",
          exact: true,
        }
      )
      .click();

    await expect(
      input(page, 1)
    ).toHaveValue("40");

    await input(page, 1).fill(
      "65"
    );

    await page
      .getByRole(
        "button",
        {
          name:
            "Siguiente →",
          exact: true,
        }
      )
      .click();

    await page
      .getByRole(
        "button",
        {
          name:
            "Guardar y continuar",
          exact: true,
        }
      )
      .click();

    await expect(
      actionHeading(
        page,
        "Acción B"
      )
    ).toBeVisible();

    await page
      .getByRole(
        "button",
        {
          name:
            "← Anterior",
          exact: true,
        }
      )
      .click();

    await expect(
      input(page, 1)
    ).toHaveValue("65");

    await input(page, 1).fill(
      "70"
    );

    await page
      .getByRole(
        "link",
        {
          name:
            "Estructura",
          exact: true,
        }
      )
      .click();

    await expect(
      page.getByRole(
        "heading",
        {
          name:
            "Cambios sin guardar",
          exact: true,
        }
      )
    ).toBeVisible();

    await page
      .getByRole(
        "button",
        {
          name:
            "Seguir editando",
          exact: true,
        }
      )
      .click();

    await page
      .getByRole(
        "button",
        {
          name:
            "Descartar cambios",
          exact: true,
        }
      )
      .click();

    await page
      .getByRole(
        "button",
        {
          name:
            "Descartar y continuar",
          exact: true,
        }
      )
      .click();

    await page
      .getByRole(
        "button",
        {
          name:
            "Finalizar revisión",
          exact: true,
        }
      )
      .click();

    await page
      .getByLabel(
        "Confirmo finalizar con 2 acciones pendientes.",
        {
          exact: true,
        }
      )
      .check();

    await page
      .getByRole(
        "button",
        {
          name:
            "Confirmar finalización",
          exact: true,
        }
      )
      .click();

    await expect(
      page.getByText(
        "🔒 Revisión finalizada · Solo lectura",
        {
          exact: true,
        }
      )
    ).toBeVisible();

    const previous =
      page
        .url()
        .split("/")
        .at(-1)!;

    await page
      .getByRole(
        "button",
        {
          name:
            "Iniciar revisión",
          exact: true,
        }
      )
      .click();

    await page
      .getByLabel(
        "Título",
        {
          exact: true,
        }
      )
      .fill(
        "Otra reunión"
      );

    await page
      .getByLabel(
        "Inicio del período"
      )
      .fill("2026-07-01");

    await page
      .getByLabel(
        "Fin del período"
      )
      .fill("2026-08-31");

    await page
      .getByRole(
        "button",
        {
          name:
            "Crear revisión",
          exact: true,
        }
      )
      .click();

    await expect(
      page
    ).not.toHaveURL(
      new RegExp(previous)
    );

    await input(page, 1).fill(
      "80"
    );

    await page
      .getByRole(
        "combobox",
        {
          name: "Revisión",
        }
      )
      .selectOption(previous);

    await expect(
      page.getByRole(
        "heading",
        {
          name:
            "Cambios sin guardar",
          exact: true,
        }
      )
    ).toBeVisible();

    await page
      .getByRole(
        "button",
        {
          name:
            "Descartar y continuar",
          exact: true,
        }
      )
      .click();

    await expect(
      page.getByText(
        "🔒 Revisión finalizada · Solo lectura",
        {
          exact: true,
        }
      )
    ).toBeVisible();

    await expect(
      page.getByRole(
        "button",
        {
          name:
            "Volver a la revisión abierta",
          exact: true,
        }
      )
    ).toBeVisible();
  }
);

test(
  "hito eliminado conserva toda la acción en lectura, pendientes y responsive",
  async ({
    page,
  }, testInfo) => {
    const plan =
      await setup(page);

    const h =
      await db.milestone.findFirstOrThrow(
        {
          where: {
            name:
              "Acción A · Hito 2",

            action: {
              dimension: {
                planId:
                  plan.id,
              },
            },
          },
        }
      );

    await db.milestone.delete({
      where: {
        id: h.id,
      },
    });

    await page.reload();

    await expect(
      page.getByRole(
        "heading",
        {
          name:
            "⚠ Acción no actualizable",
          exact: true,
        }
      )
    ).toBeVisible();

    await expect(
      page
        .getByRole("alert")
        .getByText(
          "Acción A · Hito 2",
          {
            exact: true,
          }
        )
    ).toBeVisible();

    await expect(
      page.getByText(
        "Hitos (3)",
        {
          exact: true,
        }
      )
    ).toBeVisible();

    await expect(
      page.getByRole(
        "textbox",
        {
          name: /Nuevo avance/,
        }
      )
    ).toHaveCount(0);

    await expect(
      page.getByRole(
        "button",
        {
          name:
            /Guardar seguimiento|Confirmar revisión sin cambios/,
        }
      )
    ).toHaveCount(0);

    await expect(
      page.getByText(
        "Pendientes: 3",
        {
          exact: true,
        }
      )
    ).toBeVisible();

    await page.setViewportSize({
      width: 1366,
      height: 900,
    });

    await page.screenshot({
      path:
        testInfo.outputPath(
          "desktop.png"
        ),
      fullPage: true,
    });

    await page.setViewportSize({
      width: 390,
      height: 844,
    });

    expect(
      await page.evaluate(
        () =>
          document
            .documentElement
            .scrollWidth <=
          window.innerWidth
      )
    ).toBe(true);

    await page.screenshot({
      path:
        testInfo.outputPath(
          "mobile.png"
        ),
      fullPage: true,
    });

    await page
      .getByRole(
        "button",
        {
          name:
            "Finalizar revisión",
          exact: true,
        }
      )
      .click();

    await page
      .getByLabel(
        "Confirmo finalizar con 3 acciones pendientes.",
        {
          exact: true,
        }
      )
      .check();

    await page
      .getByRole(
        "button",
        {
          name:
            "Confirmar finalización",
          exact: true,
        }
      )
      .click();

    await expect(
      page.getByText(
        "🔒 Revisión finalizada · Solo lectura",
        {
          exact: true,
        }
      )
    ).toBeVisible();
  }
);

test(
  "conflicto de avance conserva borrador, recarga explícita y cierre concurrente",
  async ({
    page,
    context,
  }) => {
    await setup(page);

    const other =
      await context.newPage();

    await other.goto(
      page.url()
    );

    await input(
      page,
      1
    ).fill("60");

    await input(
      other,
      1
    ).fill("70");

    await save(other);

    await page
      .getByRole(
        "button",
        {
          name:
            "Guardar seguimiento",
          exact: true,
        }
      )
      .click();

    await expect(
      page
        .getByRole("alert")
        .filter({
          hasText:
            "Los datos cambiaron",
        })
    ).toBeVisible();

    await expect(
      input(page, 1)
    ).toHaveValue("60");

    await page
      .getByRole(
        "button",
        {
          name:
            "Recargar datos",
          exact: true,
        }
      )
      .click();

    await page
      .getByRole(
        "button",
        {
          name:
            "Descartar y continuar",
          exact: true,
        }
      )
      .click();

    await expect(
      input(page, 1)
    ).toHaveValue("70");

    await input(
      page,
      1
    ).fill("80");

    await other
      .getByRole(
        "button",
        {
          name:
            "Finalizar revisión",
          exact: true,
        }
      )
      .click();

    await other
      .getByLabel(
        "Confirmo finalizar con 2 acciones pendientes.",
        {
          exact: true,
        }
      )
      .check();

    await other
      .getByRole(
        "button",
        {
          name:
            "Confirmar finalización",
          exact: true,
        }
      )
      .click();

    await expect(
      other.getByText(
        "🔒 Revisión finalizada · Solo lectura",
        {
          exact: true,
        }
      )
    ).toBeVisible();

    await page
      .getByRole(
        "button",
        {
          name:
            "Guardar seguimiento",
          exact: true,
        }
      )
      .click();

    await expect(
      page
        .getByRole("alert")
        .filter({
          hasText:
            "finalizada",
        })
    ).toBeVisible();

    await page
      .getByRole(
        "button",
        {
          name:
            "Recargar datos",
          exact: true,
        }
      )
      .click();

    await page
      .getByRole(
        "button",
        {
          name:
            "Descartar y continuar",
          exact: true,
        }
      )
      .click();

    await expect(
      page.getByText(
        "🔒 Revisión finalizada · Solo lectura",
        {
          exact: true,
        }
      )
    ).toBeVisible();

    await expect(
      page.getByRole(
        "textbox",
        {
          name: /Nuevo avance/,
        }
      )
    ).toHaveCount(0);
  }
);

test(
  "finalización obsoleta recarga resumen y exige nueva confirmación",
  async ({
    page,
    context,
  }) => {
    await setup(page);

    const other =
      await context.newPage();

    await other.goto(
      page.url()
    );

    await page
      .getByRole(
        "button",
        {
          name:
            "Finalizar revisión",
          exact: true,
        }
      )
      .click();

    await page
      .getByLabel(
        "Confirmo finalizar con 3 acciones pendientes.",
        {
          exact: true,
        }
      )
      .check();

    await other
      .getByRole(
        "button",
        {
          name:
            "Confirmar revisión sin cambios",
          exact: true,
        }
      )
      .click();

    await expect(
      other.getByText(
        "Revisadas: 1",
        {
          exact: true,
        }
      )
    ).toBeVisible();

    await page
      .getByRole(
        "button",
        {
          name:
            "Confirmar finalización",
          exact: true,
        }
      )
      .click();

    await expect(
      page.getByText(
        "El resumen se actualizó. Revisa los datos y confirma nuevamente.",
        {
          exact: true,
        }
      )
    ).toBeVisible();

    await expect(
      page.getByLabel(
        "Confirmo finalizar con 2 acciones pendientes.",
        {
          exact: true,
        }
      )
    ).not.toBeChecked();

    await expect(
      page.getByRole(
        "button",
        {
          name:
            "Confirmar finalización",
          exact: true,
        }
      )
    ).toBeDisabled();

    await expect(
      page.getByText(
        "◉ Revisión abierta",
        {
          exact: true,
        }
      )
    ).toBeVisible();
  }
);