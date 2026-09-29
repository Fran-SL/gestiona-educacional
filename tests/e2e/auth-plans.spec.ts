import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const fixtures: string[] = [];
// Respect Better Auth's three sign-in attempts per 10 seconds in real-server tests.
test.beforeEach(async () => { await pause(11_000); });
test.afterAll(async () => {
  await db.plan.deleteMany({ where: { createdById: { in: fixtures } } });
  await db.user.deleteMany({ where: { id: { in: fixtures } } });
  await db.$disconnect();
});

for (const role of ["SUPERUSUARIO", "ADMINISTRADOR"] as const) {
 test(`${role}: acceso, persistencia, validación y cierre de sesión`, async ({ page, request }) => {
  const suffix = randomUUID();
  const email = `test-${suffix}@example.invalid`;
  const password = randomUUID()+"-test";
  const user = await db.user.create({ data: { name: "Usuario de prueba", email, role, accounts: { create: { accountId: email, providerId: "credential", password: await hashPassword(password) } } } });
  fixtures.push(user.id);
  await db.account.updateMany({ where: { userId: user.id }, data: { accountId: user.id } });
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("No pudimos iniciar sesión");
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Planes", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Crear nuevo plan" }).click();
  const planName = `Plan persistente ${suffix}`;
  await page.getByLabel("Nombre del plan").fill(planName);
  await page.getByLabel("Descripción").fill("Descripción conservada");
  await page.getByLabel("Fecha de inicio (opcional)", { exact: true }).fill("2026-12-31");
  await page.getByLabel("Fecha de término (opcional)", { exact: true }).fill("2026-01-01");
  await page.getByRole("button", { name: "Guardar plan", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("anterior al inicio");
  await page.getByLabel("Fecha de inicio (opcional)", { exact: true }).fill("2026-01-01");
  await page.getByLabel("Fecha de término (opcional)", { exact: true }).fill("2026-12-31");
  const actionRequest = page.waitForRequest(r => !!r.headers()["next-action"]);
  await page.getByRole("button", { name: "Guardar plan", exact: true }).click();
  const captured = await actionRequest;
  await expect(page.getByRole("heading", { name: planName, exact: true })).toBeVisible();
  const saved = await db.plan.findFirstOrThrow({ where: { name: planName } });
  expect(saved.createdById).toBe(user.id);
  expect(saved.startDate?.toISOString().slice(0,10)).toBe("2026-01-01");
  await page.reload();
  await expect(page.getByRole("heading", { name: planName, exact: true })).toBeVisible();
  // Replay the real Server Action request without a session: must not create a plan.
  const count = await db.plan.count({ where: { name: planName } });
  const denied = await request.post("/", { headers: { "next-action": captured.headers()["next-action"], "content-type": captured.headers()["content-type"], origin: "http://localhost:3100" }, data: captured.postData()! });
  expect(await denied.text()).toContain("Tu sesión no permite");
  expect(await db.plan.count({ where: { name: planName } })).toBe(count);
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/"); await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page.getByRole("heading", { name: planName, exact: true })).toBeVisible();
  await db.user.update({ where: { id: user.id }, data: { active: false } });
  await page.reload(); await expect(page).toHaveURL(/\/login$/);
  await pause(11_000);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
 });
}
test("el registro público está deshabilitado", async ({ request }) => {
  const email = `signup-${randomUUID()}@example.invalid`;
  const response = await request.post("/api/auth/sign-up/email", { headers: { origin: "http://localhost:3100" }, data: { name: "No autorizado", email, password: randomUUID() } });
  expect(response.ok()).toBe(false);
  expect(await db.user.findUnique({ where: { email } })).toBeNull();
});
