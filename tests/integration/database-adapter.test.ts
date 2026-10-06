import { expect, it } from "vitest";
import { PrismaClient } from "../../generated/prisma/client";
import { databaseAdapter } from "../../models/database-adapter";
import { isolatedDatabase } from "../helpers/isolated-database.mjs";

it("consultas concurrentes en una transacción real, aislamiento schema y public", async () => {
  const isolated = await isolatedDatabase();
  const db = new PrismaClient({ adapter: databaseAdapter(isolated.url) });
  const publicUrl = new URL(isolated.url); publicUrl.searchParams.delete("schema");
  const publicDb = new PrismaClient({ adapter: databaseAdapter(publicUrl.toString()) });
  const warnings: string[] = [];
  const onWarning = (warning: Error) => { warnings.push(warning.message); };
  process.on("warning", onWarning);
  try {
    const expected = new URL(isolated.url).searchParams.get("schema");
    const rows = await db.$transaction(tx => Promise.all(Array.from({ length: 5 }, () =>
      tx.$queryRaw<{ schema: string; pid: number }[]>`SELECT current_schema() AS schema, pg_backend_pid() AS pid FROM pg_sleep(0.01)`)));
    expect(rows.flat().map(row => row.schema)).toEqual(Array(5).fill(expected));
    expect(new Set(rows.flat().map(row => row.pid)).size).toBe(1);
    expect(await publicDb.$queryRaw`SELECT current_schema() AS schema`).toEqual([{ schema: "public" }]);
    await new Promise(resolve => setImmediate(resolve));
    expect(warnings.filter(message => message.includes("Calling client.query()"))).toEqual([]);
  } finally {
    process.removeListener("warning", onWarning);
    await db.$disconnect(); await publicDb.$disconnect(); await isolated.cleanup();
  }
});
