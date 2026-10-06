import { it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createTrackingController } from "./tracking-controller";
import { reviewModel } from "@/models/review";
import { AccessDeniedError } from "./errors";
const actor = { id: "session-user", active: true, role: "ADMINISTRADOR" as const };
function mockModel() { return { start: vi.fn<typeof reviewModel.start>(), read: vi.fn<typeof reviewModel.read>(), list: vi.fn<typeof reviewModel.list>(), save: vi.fn<typeof reviewModel.save>(), finalize: vi.fn<typeof reviewModel.finalize>(), events: vi.fn<typeof reviewModel.events>() }; }
it("todas las operaciones exigen sesión activa antes de parsear o consultar", async () => {
  const model=mockModel();
  for(const user of [null,{...actor,active:false}]) {
    const c=createTrackingController(async()=>user,model);
    for(const method of [c.start,c.read,c.list,c.save,c.finalize,c.events]) await expect(method({})).rejects.toBeInstanceOf(AccessDeniedError);
  }
  for(const fn of Object.values(model)) expect(fn).not.toHaveBeenCalled();
});
it("identidad exclusivamente desde sesión; Zod bloquea la suplantación",async()=>{
  const model=mockModel(),c=createTrackingController(async()=>actor,model);
  const input={planId:"p",title:"Título",referenceStartDate:"2026-01-01",referenceEndDate:"2026-12-31"};
  await c.start(input);expect(model.start).toHaveBeenCalledWith(input,{id:actor.id});
  await expect(c.start({...input,actorId:"otro"})).rejects.toThrow(); expect(model.start).toHaveBeenCalledTimes(1);
});
