import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { readFileSync } from "node:fs";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../../generated/prisma/client";
import { databaseAdapter } from "../../models/database-adapter";


const db = new PrismaClient({ adapter: databaseAdapter(process.env.DATABASE_URL!) });
const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
const actionId = Object.entries(manifest.node).find(([, entry]) => (entry as { exportedName: string }).exportedName === "structureAction")?.[0];
if (!actionId) throw new Error("Compila antes de ejecutar esta prueba.");

const saveWeightsActionId =
  Object.entries(manifest.node).find(
    ([, entry]) =>
      (entry as { exportedName: string })
        .exportedName ===
      "saveStructureWeights"
  )?.[0];

if (!saveWeightsActionId) {
  throw new Error(
    "Compila antes de ejecutar esta prueba: saveStructureWeights."
  );
}

const origin = "http://localhost:3100";
const ids: string[] = [];
// Previous suites share the real server: respect the sign-in rate limit.
test.beforeEach(async () => { await pause(11_000); });
test.afterAll(async () => { await db.plan.deleteMany({ where: { createdById: { in: ids } } }); await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect(); });
for (const role of ["SUPERUSUARIO", "ADMINISTRADOR"] as const) {
 test(`${role}: abre planes y administra su estructura`, async ({ request, playwright }) => {
  const id = randomUUID(), password = randomUUID(), email = `${id}@example.invalid`;
  await db.user.create({ data: { id, name: "Prueba estructura", email, role, accounts: { create: { accountId: id, providerId: "credential", password: await hashPassword(password) } } } }); ids.push(id);
  const plan = await db.plan.create({ data: { name: `Prueba ${id}`, createdById: id, status: "CERRADO" } });
  const other = await db.plan.create({ data: { name: `Otro ${id}`, createdById: id } });
  const path = `/planes/${plan.id}`;
  expect((await request.get(path, { maxRedirects: 0 })).status()).toBe(307);
  expect((await request.post("/api/auth/sign-in/email", { headers: { origin }, data: { email, password } })).ok()).toBe(true);
  expect(await (await request.get("/")).text()).toContain(path);
  expect(await (await request.get(path)).text()).toContain("Plan cerrado");
  expect((await request.get("/planes/no-existe")).status()).toBe(404);
  const headers = { origin, "content-type": "text/plain;charset=UTF-8", "next-action": actionId! };
  async function call(op: string, input: object) { return (await request.post(path, { headers, data: JSON.stringify([op, { planId: plan.id, ...input }]) })).text(); }

  async function saveWeights(input: object) {
    return (
        await request.post(path, {
        headers: {
            ...headers,
            "next-action": saveWeightsActionId!,
        },
        data: JSON.stringify([
            {
            planId: plan.id,
            ...input,
            },
        ]),
        })
    ).text();
  }

  expect(await call("save", { kind: "dimension", name: "   " })).toContain('"ok":false');
  expect(await call("save", { kind: "dimension", name: "Dimensión temporal" })).toContain('"ok":true');
  const dimension = await db.dimension.findFirstOrThrow({ where: { planId: plan.id } });
  expect(dimension.weightBps).toBe(10000);

    expect(
    await call("save", {
        kind: "dimension",
        name: "Segunda dimensión",
    })
    ).toContain('"ok":true');

    const secondDimension = await db.dimension.findFirstOrThrow({
    where: {
        planId: plan.id,
        name: "Segunda dimensión",
    },
    });

    expect(secondDimension.weightBps).toBe(0);

    const firstDimensionAfterCreate =
    await db.dimension.findUniqueOrThrow({
        where: {
        id: dimension.id,
        },
    });

    expect(firstDimensionAfterCreate.weightBps).toBe(10000);

    expect(
        await saveWeights({
            kind: "dimension",
            parentId: plan.id,
            weights: [
            {
                id: dimension.id,
                weightBps: 7000,
            },
            {
                id: secondDimension.id,
                weightBps: 3000,
            },
            ],
        })
    ).toContain('"ok":true');

    const dimensionsAfterWeightSave =
    await db.dimension.findMany({
        where: {
        id: {
            in: [
            dimension.id,
            secondDimension.id,
            ],
        },
        },
    });

    expect(
    dimensionsAfterWeightSave.find(
        item => item.id === dimension.id
    )?.weightBps
    ).toBe(7000);

    expect(
    dimensionsAfterWeightSave.find(
        item =>
        item.id === secondDimension.id
    )?.weightBps
    ).toBe(3000);

    expect(
        await saveWeights({
            kind: "dimension",
            parentId: plan.id,
            weights: [
            {
                id: dimension.id,
                weightBps: 7000,
            },
            {
                id: secondDimension.id,
                weightBps: 2000,
            },
            ],
        })
        ).toContain(
        "Los pesos deben sumar exactamente 100 %."
        );

    const dimensionsAfterInvalidWeightSave =
        await db.dimension.findMany({
            where: {
            id: {
                in: [
                dimension.id,
                secondDimension.id,
                ],
            },
            },
        });

        expect(
        dimensionsAfterInvalidWeightSave.find(
            item => item.id === dimension.id
        )?.weightBps
        ).toBe(7000);

        expect(
        dimensionsAfterInvalidWeightSave.find(
            item =>
            item.id === secondDimension.id
        )?.weightBps
        ).toBe(3000);

    expect(
        await saveWeights({
            kind: "dimension",
            parentId: plan.id,
            weights: [
            {
                id: dimension.id,
                weightBps: 10000,
            },
            ],
        })
        ).toContain(
        "La estructura cambió. Recarga la página antes de guardar los pesos."
        );

    const dimensionsAfterIncompleteWeightSave =
        await db.dimension.findMany({
            where: {
            id: {
                in: [
                dimension.id,
                secondDimension.id,
                ],
            },
            },
        });

        expect(
        dimensionsAfterIncompleteWeightSave.find(
            item => item.id === dimension.id
        )?.weightBps
        ).toBe(7000);

        expect(
        dimensionsAfterIncompleteWeightSave.find(
            item =>
            item.id === secondDimension.id
        )?.weightBps
        ).toBe(3000);

  expect(await call("save", { kind: "management", name: "Nivel eliminado" })).toContain('"ok":false');
  expect(await call("save", { kind: "dimension", id: dimension.id, planId: other.id, name: "No permitido" })).toContain('"ok":false');
  expect(await call("save", { kind: "dimension", id: dimension.id, name: "Dimensión editada" })).toContain('"ok":true');
  expect(await (await request.get(path)).text()).toContain("Dimensión editada");
  const action = await db.action.create({
    data: {
        dimensionId: dimension.id,
        name: "Acción temporal",
        description: "Prueba",
        responsibleName: "Prueba",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),

        // Es la única acción de la dimensión: 100%.
        weightBps: 10000,

        milestones: {
        create: {
            name: "Hito temporal",
            weightBps: 10000,
            comments: {
            create: {
                authorId: id,
                body: "Comentario temporal",
            },
            },
        },
        },
    },
    });
  const page = await (await request.get(path)).text();
  expect(page).toContain("Acción temporal"); expect(page).toContain("Hito temporal");
  expect(page).not.toContain("Agregar gestión");


  const weightedTarget = {
    kind: "dimension",
    id: dimension.id,
    };

    const weightedPreview = await call(
    "preview",
    weightedTarget
    );

    const weightedToken = weightedPreview.match(
    /"token":"([a-f0-9]{64})"/
    )?.[1];

    expect(weightedToken).toBeTruthy();

    expect(
    await call("remove", {
        ...weightedTarget,
        token: weightedToken,
        confirmed: true,
    })
    ).toContain(
    "Antes de eliminar esta dimensión"
    );

    expect(
    await db.dimension.count({
        where: {
        id: dimension.id,
        },
    })
    ).toBe(1);

    expect(
        await saveWeights({
            kind: "dimension",
            parentId: plan.id,
            weights: [
            {
                id: dimension.id,
                weightBps: 10000,
            },
            {
                id: secondDimension.id,
                weightBps: 0,
            },
            ],
        })
    ).toContain('"ok":true');

    expect(
    (
        await db.dimension.findUniqueOrThrow({
        where: {
            id: dimension.id,
        },
        })
    ).weightBps
    ).toBe(10000);

    expect(
    (
        await db.dimension.findUniqueOrThrow({
        where: {
            id: secondDimension.id,
        },
        })
    ).weightBps
    ).toBe(0);


    const zeroWeightTarget = {
    kind: "dimension",
    id: secondDimension.id,
    };

    const zeroWeightPreview = await call(
    "preview",
    zeroWeightTarget
    );

    const zeroWeightToken = zeroWeightPreview.match(
    /"token":"([a-f0-9]{64})"/
    )?.[1];

    expect(zeroWeightToken).toBeTruthy();

    expect(
    await call("remove", {
        ...zeroWeightTarget,
        token: zeroWeightToken,
        confirmed: true,
    })
    ).toContain('"ok":true');

    expect(
    await db.dimension.count({
        where: {
        id: secondDimension.id,
        },
    })
    ).toBe(0);

    expect(
    (
        await db.dimension.findUniqueOrThrow({
        where: {
            id: dimension.id,
        },
        })
    ).weightBps
    ).toBe(10000);

  const target = { kind: "dimension", id: dimension.id };

  const preview = await call("preview", target);
  expect(preview).toContain('"actions":1'); expect(preview).toContain('"milestones":1'); expect(preview).toContain('"comments":1');

  const token = preview.match(/"token":"([a-f0-9]{64})"/)?.[1]; expect(token).toBeTruthy();
  expect(await call("remove", { ...target, token })).toContain('"ok":false');
  await db.action.update({ where: { id: action.id }, data: { name: "Cambio concurrente" } });
  expect(await call("remove", { ...target, token, confirmed: true })).toContain("El contenido cambió");
  expect(await db.dimension.count({ where: { id: dimension.id } })).toBe(1);
  const fresh = await call("preview", target);
  const freshToken = fresh.match(/"token":"([a-f0-9]{64})"/)?.[1];
  const anonymous = await playwright.request.newContext({ baseURL: origin });
  try { expect(await (await anonymous.post(path, { headers, data: JSON.stringify(["remove", { ...target, planId: plan.id, confirmed: true, token: freshToken }]) })).text()).toContain("Tu sesión no permite"); } finally { await anonymous.dispose(); }
  expect(await call("remove", { ...target, token: freshToken, confirmed: true })).toContain('"ok":true');
  expect(await db.dimension.count({ where: { id: dimension.id } })).toBe(0);
  expect(await db.action.count({ where: { id: action.id } })).toBe(0);
  expect(await db.plan.count({ where: { id: { in: [plan.id, other.id] } } })).toBe(2);
 });
}
