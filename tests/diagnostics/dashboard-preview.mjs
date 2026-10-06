// Local visual QA with disposable data: node --conditions=react-server --import tsx tests/diagnostics/dashboard-preview.mjs
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
 const id=crypto.randomUUID(), password=crypto.randomUUID(), email='dashboard-visual@example.invalid';
 await db.user.create({data:{id,email,name:'Prueba visual',role:'SUPERUSUARIO',accounts:{create:{providerId:'credential',accountId:id,password:await hashPassword(password)}}}});
 const plan=await db.plan.create({data:{name:'Plan institucional · Demostración',createdById:id}});
 const model=createReviewModel(()=>db);
 async function revision(title, close=true) {
  const r=await model.start({planId:plan.id,title,referenceStartDate:'2026-01-01',referenceEndDate:'2026-12-31'},{id});
  if(close)await model.finalize({planId:plan.id,reviewId:r.id,version:r.version,confirmPending:true},{id});
  return r.id;
 }
 await revision('Diagnóstico sin estructura');
 const milestones=[];
 await db.$transaction(async tx => {
 for(const [i,name] of ['Gestión pedagógica y acompañamiento de los procesos de aprendizaje de toda la comunidad educativa','Liderazgo','Convivencia Educativa','Recurso'].entries()) {
  const d=await tx.dimension.create({data:{planId:plan.id,name,position:i,weightBps:[4000,3000,2000,1000][i],actions:{create:{name:'Fortalecimiento institucional y acompañamiento de equipos para la mejora continua del aprendizaje',description:'',responsibleName:'Equipo directivo y coordinación de la comunidad educativa',weightBps:10000,startDate:new Date('2026-01-01'),endDate:new Date('2026-12-31'),actualExpense:i===0?'500000':null,milestones:{create:{name:'Hito de prueba',weightBps:10000,progressBps:0}}}}},include:{actions:{include:{milestones:true}}}});
  milestones.push(d.actions[0].milestones[0].id);
 }
 });
 const zero=await revision('Línea base · avance real cero');
 for(const [i,id] of milestones.entries())await db.milestone.update({where:{id},data:{progressBps:[3486,2500,1250,5000][i]}});
 await revision('Seguimiento intermedio');
 for(const [i,id] of milestones.entries())await db.milestone.update({where:{id},data:{progressBps:[6971,5000,2500,10000][i]}});
 await revision('Reunión institucional · revisión abierta',false);
 await writeFile('/private/tmp/dashboard-preview.json',JSON.stringify({email,password,url:`http://127.0.0.1:3106/planes/${plan.id}/dashboard`,zero}),{mode:0o600});
 child=spawn('npm',['run','dev','--','--webpack','--hostname','127.0.0.1','--port','3106'],{env:{...process.env,WATCHPACK_POLLING:'1000',DATABASE_URL:isolated.url,BETTER_AUTH_URL:'http://127.0.0.1:3106'},stdio:'inherit',detached:true});
 await Promise.race([once(child,'exit'),new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);})]);
} finally {
 if(child && child.exitCode===null){process.kill(-child.pid,'SIGTERM');await once(child,'exit');}
 await db.$disconnect();await isolated.cleanup();console.log('Esquema de demostración retirado.');
}
