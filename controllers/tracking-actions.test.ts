import { it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
const mocks=vi.hoisted(()=>({ resolve:vi.fn(), start:vi.fn() }));
vi.mock("@/controllers/session-controller",()=>({resolveActor:mocks.resolve}));
vi.mock("@/models/review",()=>({reviewModel:{start:mocks.start}}));
import { startReview } from "@/app/seguimiento/actions";
import { TrackingError } from "@/models/tracking-error";
const input={planId:"p",title:"Título",referenceStartDate:"2026-01-01",referenceEndDate:"2026-12-31"};
beforeEach(()=>{vi.clearAllMocks();mocks.resolve.mockResolvedValue({id:"u",role:"ADMINISTRADOR",active:true});});
it("errores SQL y stacks no atraviesan Server Action",async()=>{
  mocks.start.mockRejectedValue(new Error('SQL password=secret SELECT * FROM users'));
  const result=await startReview(input);expect(result).toMatchObject({ok:false,code:"UNEXPECTED"});expect(JSON.stringify(result)).not.toMatch(/secret|SELECT|stack/);
});
it("traduce validación, dominio y sesión a respuestas seguras",async()=>{
  expect(await startReview({...input,actorRole:"SUPERUSUARIO"})).toMatchObject({ok:false,code:"INVALID_INPUT"});
  mocks.start.mockRejectedValue(new TrackingError("OPEN_REVIEW","Ya existe una revisión abierta."));
  expect(await startReview(input)).toMatchObject({ok:false,code:"OPEN_REVIEW"});
  mocks.resolve.mockResolvedValue(null);expect(await startReview(input)).toMatchObject({ok:false,code:"ACCESS_DENIED"});
});
