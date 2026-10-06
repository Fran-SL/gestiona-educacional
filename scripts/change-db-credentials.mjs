import { readFile, writeFile, rename, unlink, open } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { userInfo } from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { parse } from "dotenv";
import pg from "pg";

const identifier = value => '"' + value.replaceAll('"', '""') + '"';
const literal = value => "'" + value.replaceAll("'", "''") + "'";

export async function changeCredentials({ envPath, username, password, adminUser = userInfo().username }) {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(username)) throw new Error("Nombre de usuario inválido.");
  if (password.length < 12 || password.length > 128 || /[\r\n\0]/.test(password)) throw new Error("Usa una contraseña de 12 a 128 caracteres, sin saltos de línea.");
  const lockPath = envPath + ".credentials.lock";
  const lock = await open(lockPath, "wx", 0o600);
  const temporaryPath = envPath + ".credentials-" + randomUUID();
  let db;
  let original;
  let envChanged = false;
  let committed = false;
  try {
    original = await readFile(envPath, "utf8");
    const url = new URL(parse(original).DATABASE_URL);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error("Este asistente solo admite PostgreSQL local.");
    const previousUsername = decodeURIComponent(url.username);
    db = new pg.Client({ host: url.hostname, port: Number(url.port || 5432), database: "postgres", user: adminUser });
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL standard_conforming_strings = on");
    const current = await db.query('SELECT oid FROM pg_roles WHERE rolname=$1', [previousUsername]);
    if (!current.rowCount) throw new Error("El usuario configurado ya no existe.");
    if (username !== previousUsername) {
      const existing = await db.query('SELECT oid FROM pg_roles WHERE rolname=$1', [username]);
      if (existing.rowCount) throw new Error("El nombre solicitado ya pertenece a otro usuario.");
      await db.query(`ALTER ROLE ${identifier(previousUsername)} RENAME TO ${identifier(username)}`);
    }
    await db.query(`ALTER ROLE ${identifier(username)} PASSWORD ${literal(password)}`);
    url.username = username;
    url.password = password;
    const updated = original.replace(/^\s*DATABASE_URL\s*=.*$/m, () => `DATABASE_URL="${url.toString()}"`);
    if (updated === original) throw new Error("No se pudo actualizar DATABASE_URL.");
    await writeFile(temporaryPath, updated, { mode: 0o600, flag: "wx" });
    await rename(temporaryPath, envPath);
    envChanged = true;
    await db.query("COMMIT");
    committed = true;
    return { username, database: decodeURIComponent(url.pathname.slice(1)) };
  } catch (error) {
    if (db && !committed) await db.query("ROLLBACK").catch(() => {});
    if (envChanged && !committed) {
      await writeFile(temporaryPath, original, { mode: 0o600, flag: "wx" });
      await rename(temporaryPath, envPath);
    }
    throw error;
  } finally {
    await db?.end().catch(() => {});
    await unlink(temporaryPath).catch(() => {});
    await lock.close();
    await unlink(lockPath).catch(() => {});
  }
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Ejecuta el asistente en una terminal interactiva.");
  const username = process.argv[2] || "Tomas10";
  let muted = false;
  const output = new Writable({ write(chunk, _encoding, done) { if (!muted) process.stdout.write(chunk); done(); } });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  async function secret(prompt) {
    const answer = rl.question(prompt);
    muted = true;
    try { return await answer; }
    finally { muted = false; process.stdout.write("\n"); }
  }
  try {
    console.log(`Usuario PostgreSQL nuevo: ${username}\nSe conservarán la base, sus permisos y todos los datos.\n`);
    const password = await secret("Nueva contraseña (mínimo 12 caracteres, no se muestra): ");
    const confirmation = await secret("Repite la contraseña: ");
    if (password !== confirmation) throw new Error("Las contraseñas no coinciden. No se cambió nada.");
    const result = await changeCredentials({ envPath: fileURLToPath(new URL("../.env", import.meta.url)), username, password });
    console.log(`\nCredenciales actualizadas. Usuario: ${result.username}. Base: ${result.database}.\nLa conexión en .env también fue actualizada. Reinicia la aplicación para utilizarla.`);
  } finally { rl.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    // Never print driver errors: a failing SQL command can include the password.
    console.error("No se completó el cambio. Revisa que PostgreSQL esté activo, que el usuario nuevo esté disponible y que ambas contraseñas coincidan y tengan entre 12 y 128 caracteres.");
    process.exitCode = 1;
  });
}
