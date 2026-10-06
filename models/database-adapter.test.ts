import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ active: 0, maximum: 0, overlap: false, configurations: [] as unknown[] }));
vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: class {
    constructor(...args: unknown[]) { state.configurations.push(args); }
    async connect() {
      return {
        async startTransaction() {
          let running = false;
          async function run(query: { sql: string }) {
            if (running) state.overlap = true;
            running = true; state.active++; state.maximum = Math.max(state.maximum, state.active);
            try {
              await new Promise(resolve => setTimeout(resolve, 5));
              if (query.sql === "FAIL") throw new Error("SQL failure");
              return { rows: [[query.sql]] };
            } finally { running = false; state.active--; }
          }
          return { queryRaw: run, executeRaw: run };
        },
      };
    }
  },
}));
import { databaseAdapter } from "./database-adapter";
const query = (sql: string) => ({ sql, args: [], argTypes: [] });
beforeEach(() => { state.active = 0; state.maximum = 0; state.overlap = false; state.configurations = []; });
it("serializa lecturas y SQL directo solo dentro del mismo cliente de transacción", async () => {
  const adapter = await databaseAdapter("postgresql://localhost/test").connect();
  const tx = await adapter.startTransaction();
  await Promise.all([tx.queryRaw(query("relation 1")), tx.queryRaw(query("relation 2")), tx.executeRaw(query("write"))]);
  expect(state.overlap).toBe(false); expect(state.maximum).toBe(1);
});
it("mantiene el paralelismo entre transacciones independientes del pool", async () => {
  const adapter = await databaseAdapter("postgresql://localhost/test").connect();
  const a = await adapter.startTransaction(), b = await adapter.startTransaction();
  await Promise.all([a.queryRaw(query("A")), b.queryRaw(query("B"))]);
  expect(state.overlap).toBe(false); expect(state.maximum).toBe(2);
});
it("propaga el error y permite ejecutar rollback después", async () => {
  const adapter = await databaseAdapter("postgresql://localhost/test").connect();
  const tx = await adapter.startTransaction();
  const results = await Promise.allSettled([tx.queryRaw(query("FAIL")), tx.executeRaw(query("ROLLBACK"))]);
  expect(results[0]).toMatchObject({ status: "rejected", reason: new Error("SQL failure") });
  expect(results[1].status).toBe("fulfilled"); expect(state.overlap).toBe(false);
});
it.each([undefined, "tracking_test_example"])("conserva schema y search_path (%s)", schema => {
  databaseAdapter(`postgresql://localhost/test${schema ? `?schema=${schema}` : ""}`);
  expect(state.configurations[0]).toEqual([
    { connectionString: `postgresql://localhost/test${schema ? `?schema=${schema}` : ""}`, options: `-c search_path=${schema ?? "public"}` },
    { schema: schema ?? "public" },
  ]);
});
