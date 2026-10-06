import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const database = vi.hoisted(() => ({ $transaction: vi.fn() }));
vi.mock("./db", () => ({ getDatabase: () => database }));
import { actionModel } from "./action";
import { actionInputSchema } from "./action-rules";

beforeEach(() => vi.clearAllMocks());
it("no sobrescribe un avance que cambió después de leer la estructura", async () => {
  let persistedProgress = 7000;
  const tx = {
    dimension: { findFirst: vi.fn().mockResolvedValue({ id: "dimension" }) },
    action: {
      findFirst: vi.fn().mockResolvedValue({ id: "action", version: 2, milestones: [{ id: "milestone", progressBps: 7000 }] }),
      updateMany: vi.fn().mockImplementation(async () => {
        // Simulates a progress writer after the structural read.
        persistedProgress = 9000;
        return { count: 1 };
      }),
    },
    milestone: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockImplementation(async ({ data }: { data: { progressBps?: number } }) => {
        if (data.progressBps !== undefined) persistedProgress = data.progressBps;
        return { id: "milestone" };
      }),
    },
  };
  database.$transaction.mockImplementation(async callback => callback(tx));
  await actionModel.save(actionInputSchema.parse({ planId: "plan", dimensionId: "dimension", id: "action", version: 2, name: "Nueva descripción", description: "Descripción", responsibleName: "Responsable", startDate: "2026-01-01", endDate: "2026-12-31", actualExpense: null, milestones: [{ id: "milestone", name: "Hito", weightBps: 10000 }] }), { id: "user", role: "SUPERUSUARIO" });
  expect(persistedProgress).toBe(9000);
  expect(tx.milestone.update).toHaveBeenCalledWith({ where: { id: "milestone" }, data: { name: "Hito", weightBps: 10000, position: 0 } });
});
