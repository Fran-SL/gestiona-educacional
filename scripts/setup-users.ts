import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Ejecuta esta configuración desde una terminal interactiva.");
if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL en .env.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
let muted = false;
const output = new Writable({ write(chunk, _encoding, done) { if (!muted) process.stdout.write(chunk); done(); } });
const rl = createInterface({ input: process.stdin, output, terminal: true });
async function askSecret(label: string) {
  const answer = rl.question(label);
  muted = true;
  try { return await answer; }
  finally { muted = false; process.stdout.write("\n"); }
}
const accountSchema = z.object({
  name: z.string().trim().min(1), email: z.email().transform(v => v.toLowerCase()),
  password: z.string().min(12).max(128), role: z.enum(["SUPERUSUARIO", "ADMINISTRADOR"]),
});
try {
  if (await db.user.count()) throw new Error("Ya existen cuentas. Este comando solo configura una instalación vacía y no modifica usuarios existentes.");
  const accounts: z.infer<typeof accountSchema>[] = [];
  for (const role of ["SUPERUSUARIO", "ADMINISTRADOR"] as const) {
    console.log(`\nCuenta ${role}`);
    const name = await rl.question("Nombre: ");
    const email = (await rl.question("Correo electrónico: ")).trim();
    const password = await askSecret("Contraseña (mínimo 12 caracteres, no se muestra): ");
    const confirmation = await askSecret("Repite la contraseña: ");
    if (password !== confirmation) throw new Error("Las contraseñas no coinciden. No se creó ninguna cuenta.");
    const parsed = accountSchema.safeParse({ name, email, password, role });
    if (!parsed.success) throw new Error("Revisa nombre, correo y contraseña (12 a 128 caracteres). No se creó ninguna cuenta.");
    accounts.push({ ...parsed.data, password: await hashPassword(password) });
  }
  if (accounts[0].email === accounts[1].email) throw new Error("Cada cuenta necesita un correo distinto.");
  await db.$transaction(async tx => {
    // Serialize simultaneous initial-setup commands without exposing a web registration route.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(730291)`;
    if (await tx.user.count()) throw new Error("Otra configuración ya creó las cuentas.");
    for (const account of accounts) {
      const user = await tx.user.create({ data: { name: account.name, email: account.email, role: account.role } });
      await tx.account.create({ data: { userId: user.id, accountId: user.id, providerId: "credential", password: account.password } });
    }
  });
  console.log("\nLas dos cuentas están listas. Puedes iniciar sesión. Las contraseñas no se guardaron en texto plano.");
} catch (error) {
  console.error(error instanceof Error && !error.message.includes("prisma") ? error.message : "No se pudieron crear las cuentas. Revisa la conexión y los datos.");
  process.exitCode = 1;
} finally { rl.close(); await db.$disconnect(); }
