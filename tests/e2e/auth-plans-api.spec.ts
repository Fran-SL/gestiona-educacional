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
const actionId = Object.entries(manifest.node).find(([, entry]) => (entry as { exportedName: string }).exportedName === "createPlanAction")?.[0];
if (!actionId) throw new Error("Compila la aplicación antes de estas pruebas.");
const origin = "http://localhost:3100";
const fixtures: string[] = [];
// Respect Better Auth's three sign-in attempts per 10 seconds in real-server tests.
test.beforeEach(async () => { await pause(11_000); });
test.afterAll(async () => {
  await db.plan.deleteMany({ where: { createdById: { in: fixtures } } });
  await db.user.deleteMany({ where: { id: { in: fixtures } } });
  await db.$disconnect();
});
for (const role of ["SUPERUSUARIO", "ADMINISTRADOR"] as const) {
 test(`${role}: HTTP con sesión real y persistencia`, async ({ request, playwright }) => {
  const id = randomUUID(), password = randomUUID();
  const email = `http-${id}@example.invalid`;
  await db.user.create({ data: { id, name: "Prueba HTTP", email, role, accounts: { create: { accountId: id, providerId: "credential", password: await hashPassword(password) } } } });
  fixtures.push(id);
  const anonymous = await request.get("/", { maxRedirects: 0 });
  expect(anonymous.status()).toBe(307); expect(anonymous.headers().location).toBe("/login");
  const bad = await request.post("/api/auth/sign-in/email", { headers: { origin }, data: { email, password: "incorrect-password" } });
  expect(bad.ok()).toBe(false);
  const login = await request.post("/api/auth/sign-in/email", { headers: { origin }, data: { email, password } });
  expect(login.ok()).toBe(true);
  const planName = `Plan HTTP ${id}`;
  const actionHeaders = { origin, "content-type": "text/plain;charset=UTF-8", "next-action": actionId! };
  const invalid = await request.post("/", { headers: actionHeaders, data: JSON.stringify([{ name: planName, startDate: "2026-12-31", endDate: "2026-01-01" }]) });
  expect(await invalid.text()).toContain("anterior al inicio");
  expect(await db.plan.count({ where: { name: planName } })).toBe(0);
  const data = JSON.stringify([{ name: planName, description: "Persistencia", createdById: "forged" }]);
  const created = await request.post("/", { headers: actionHeaders, data });
  expect(await created.text()).toContain('"ok":true');
  expect((await db.plan.findFirstOrThrow({ where: { name: planName } })).createdById).toBe(id);
  expect(await (await request.get("/")).text()).toContain(planName);
  expect(await (await request.get("/")).text()).toContain(planName);
  const noSession = await playwright.request.newContext({ baseURL: origin });
  try {
    const rejected = await noSession.post("/", { headers: actionHeaders, data });
    expect(await rejected.text()).toContain("Tu sesión no permite");
    expect(await db.plan.count({ where: { name: planName } })).toBe(1);
  } finally { await noSession.dispose(); }
  expect((await request.post("/api/auth/sign-out", { headers: { origin }, data: {} })).ok()).toBe(true);
  expect((await request.get("/", { maxRedirects: 0 })).status()).toBe(307);
  expect((await request.post("/api/auth/sign-in/email", { headers: { origin }, data: { email, password } })).ok()).toBe(true);
  expect(await (await request.get("/")).text()).toContain(planName);
  await db.user.update({ where: { id }, data: { active: false } });
  expect((await request.get("/", { maxRedirects: 0 })).status()).toBe(307);
  expect(await (await request.post("/", { headers: actionHeaders, data })).text()).toContain("Tu sesión no permite");
  await request.post("/api/auth/sign-out", { headers: { origin }, data: {} });
  await pause(11_000);
  expect((await request.post("/api/auth/sign-in/email", { headers: { origin }, data: { email, password } })).ok()).toBe(false);
 });
}
