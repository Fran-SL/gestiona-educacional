// Run with: node --conditions=react-server --import tsx tests/diagnostics/tracking-hydration.mjs
import { isolatedDatabase } from '../helpers/isolated-database.mjs';
import { PrismaClient } from '../../generated/prisma/client.ts';
import { databaseAdapter } from '../../models/database-adapter.ts';
import { createReviewModel } from '../../models/review.ts';
import { hashPassword } from 'better-auth/crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
const isolated = await isolatedDatabase();
const db = new PrismaClient({ adapter: databaseAdapter(isolated.url) });
let child;
try {
 const id=crypto.randomUUID(), password=crypto.randomUUID(), email='hidratacion@example.invalid';
 await db.user.create({data:{id,email,name:'Prueba de hidratación',role:'SUPERUSUARIO',accounts:{create:{providerId:'credential',accountId:id,password:await hashPassword(password)}}}});
 const plan=await db.plan.create({data:{name:'Plan ficticio de hidratación',createdById:id,dimensions:{create:{name:'Dimensión de prueba',actions:{create:{name:'Acción de prueba',description:'Validación de fechas',responsibleName:'Responsable ficticio',startDate:new Date('2026-01-01'),endDate:new Date('2026-12-31'),milestones:{create:{name:'Hito de prueba',weightBps:10000,progressBps:0}}}}}}}});
 const model=createReviewModel(()=>db);
 async function create(title, progress) {
  const r=await model.start({planId:plan.id,title,referenceStartDate:'2026-01-01',referenceEndDate:'2026-12-31'},{id});
  const detail=await model.read({planId:plan.id,reviewId:r.id},{id});const a=detail.dimensions[0].actions[0];
  const saved=await model.save({planId:plan.id,reviewId:r.id,reviewActionId:a.id,version:a.version,milestones:[{reviewMilestoneId:a.milestones[0].id,progressBps:progress}]},{id});
  return saved;
 }
 const closed=await create('Revisión finalizada de prueba',4000);
 await model.finalize({planId:plan.id,reviewId:closed.id,version:closed.version,confirmPending:false},{id});
 const open=await create('Revisión abierta de prueba',6000);
 const origin='http://127.0.0.1:3104';
 await writeFile('/private/tmp/tracking-hydration-fixture.json',JSON.stringify({origin,email,password,closed:`/planes/${plan.id}/seguimiento/${closed.id}`,open:`/planes/${plan.id}/seguimiento/${open.id}`}),{mode:0o600});
 child=spawn('npm',['run','dev','--','--webpack','--hostname','127.0.0.1','--port','3104'],{env:{...process.env,WATCHPACK_POLLING:'1000',DATABASE_URL:isolated.url,BETTER_AUTH_URL:origin},stdio:'inherit',detached:true});
 await Promise.race([once(child,'exit'),new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);})]);
} finally {
 if(child && child.exitCode===null){process.kill(-child.pid,'SIGTERM');await once(child,'exit');}
 await db.$disconnect();await isolated.cleanup();
 console.log('Entorno ficticio de hidratación retirado.');
}
