import 'dotenv/config';
import pg from 'pg';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// All committed fixtures, concurrent sessions and destructive probes live only in
// this randomly named schema. The application's public schema is never changed.
const schema = `reviews_test_${randomUUID().replaceAll('-', '')}`;
const connection = { connectionString: process.env.DATABASE_URL };
const client = new pg.Client(connection);
const id = () => randomUUID();
const query = (c, sql, values = []) => c.query(sql, values);
const migrations = ['202609280001_initial', '202609300001_actions_under_dimensions', '202609300002_plan_reviews'];

async function live(c, weights = [2000, 3000, 5000]) {
  const p = id(), d = id(), a = id(), hs = weights.map(() => id());
  await query(c, 'INSERT INTO plans(id,name,"createdById","updatedAt") VALUES($1,\'Plan 2027\',\'super\',now())', [p]);
  await query(c, 'INSERT INTO dimensions(id,"planId",name,description,"updatedAt") VALUES($1,$2,\'Dimension\',\'Descripción\',now())', [d,p]);
  await query(c, `INSERT INTO actions(id,"dimensionId",name,description,"responsibleName","startDate","endDate","actualExpense","updatedAt")
    VALUES($1,$2,'Acción A','Descripción','Responsable','2027-01-01','2027-12-31',123,now())`, [a,d]);
  for (let i = 0; i < hs.length; i++) await query(c, `INSERT INTO milestones(id,"actionId",name,"weightBps","progressBps",position,"updatedAt")
    VALUES($1,$2,$3,$4,$5,$6,now())`, [hs[i],a,`Hito ${i+1}`,weights[i],[4000,5000,7000][i] ?? 0,i]);
  return {p,d,a,hs};
}
async function header(c, l, related = null) {
  const r = id();
  await query(c, `INSERT INTO plan_reviews(id,"planId",title,"referenceStartDate","referenceEndDate","planName","planDescription","planStartDate","planEndDate","planStatus","createdById","relatedReviewId")
    SELECT $1,id,'Septiembre','2027-09-01','2027-09-30',name,description,"startDate","endDate",status,'super',$3 FROM plans WHERE id=$2`, [r,l.p,related]);
  return r;
}
async function snapshot(c,l) {
  const r=await header(c,l), d=id(), a=id(), hs=l.hs.map(()=>id());
  await query(c, `INSERT INTO review_dimensions(id,"reviewId","sourceDimensionId",name,description,position)
    SELECT $1,$2,id,name,description,position FROM dimensions WHERE id=$3`, [d,r,l.d]);
  await query(c, `INSERT INTO review_actions(id,"reviewDimensionId","sourceActionId",name,description,"responsibleName","startDate","endDate","actualExpense",currency,position)
    SELECT $1,$2,id,name,description,"responsibleName","startDate","endDate","actualExpense",currency,position FROM actions WHERE id=$3`, [a,d,l.a]);
  for(let i=0;i<hs.length;i++) await query(c, `INSERT INTO review_milestones(id,"reviewActionId","sourceMilestoneId",name,position,"weightBps","initialProgressBps","progressBps")
    SELECT $1,$2,id,name,position,"weightBps","progressBps","progressBps" FROM milestones WHERE id=$3`, [hs[i],a,l.hs[i]]);
  return {r,d,a,hs};
}
async function confirm(c,s,actor='super') {
  return (await query(c, `UPDATE review_actions SET version=version+1,"lastReviewedAt"=now(),"lastReviewedById"=$2 WHERE id=$1 RETURNING version`, [s.a,actor])).rows[0].version;
}
async function event(c,s,i,previous,next,version,actor='super',extra={}) {
  const correction=next<previous;
  return query(c, `INSERT INTO progress_events(id,"reviewMilestoneId","actionVersion","previousBps","newBps",type,reason,"confirmedAt","actorId","actorRole")
    VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $8 THEN now() ELSE NULL END,$9,$10)`,
    [id(),s.hs[i],version,previous,next,extra.type ?? (correction?'CORRECCION':'ACTUALIZACION'),extra.reason === undefined ? (correction?'Se corrigió el porcentaje informado previamente.':null):extra.reason,extra.confirmed ?? correction,actor,extra.role ?? (actor==='super'?'SUPERUSUARIO':'ADMINISTRADOR')]);
}
async function persist(c,l,s,i,next) {
  await query(c,'UPDATE review_milestones SET "progressBps"=$2 WHERE id=$1',[s.hs[i],next]);
  await query(c,'UPDATE milestones SET "progressBps"=$2 WHERE id=$1',[l.hs[i],next]);
}
async function finish(c,s) {
  await query(c, `UPDATE plan_reviews SET status='FINALIZADA',"finalizedById"='super',"finalizedAt"=now(),version=version+1 WHERE id=$1`, [s.r]);
}
async function rejects(c, fn, code='23514') {
  await query(c,'SAVEPOINT invalid_probe');
  let caught;
  try { await fn(); await query(c,'SET CONSTRAINTS ALL IMMEDIATE'); } catch(error) { caught=error; }
  await query(c,'ROLLBACK TO SAVEPOINT invalid_probe');
  await query(c,'RELEASE SAVEPOINT invalid_probe');
  assert.ok(caught,'La operación inválida fue aceptada');
  assert.equal(caught.code,code,caught.message);
}
async function inTransaction(t,name,fn) {
  await t.test(name,async()=>{
    await query(client,'BEGIN');
    try { await fn(); await query(client,'SET CONSTRAINTS ALL IMMEDIATE'); }
    finally { await query(client,'ROLLBACK'); }
  });
}

await test('Integridad SQL de revisiones (esquema aislado)', async t=>{
  await client.connect();
  try {
    await query(client,`CREATE SCHEMA "${schema}"`);
    await query(client,`SET search_path TO "${schema}"`);
    for (const migration of migrations) {
      const sql=(await readFile(`prisma/migrations/${migration}/migration.sql`,'utf8')).replace('CREATE SCHEMA IF NOT EXISTS "public";','');
      await query(client,sql);
    }
    await query(client, `INSERT INTO users(id,name,email,role,"updatedAt") VALUES('super','Super','super@example.invalid','SUPERUSUARIO',now()),('admin','Admin','admin@example.invalid','ADMINISTRADOR',now())`);

    await inTransaction(t,'snapshot N hitos y ejemplo: 58% inicial, 57% final, dos eventos',async()=>{
      const l=await live(client),s=await snapshot(client,l),v=await confirm(client,s);
      await event(client,s,0,4000,6000,v); await persist(client,l,s,0,6000);
      await event(client,s,2,7000,6000,v); await persist(client,l,s,2,6000);
      const row=(await query(client,`SELECT sum("weightBps"::bigint*"initialProgressBps")::numeric/1000000 initial,sum("weightBps"::bigint*"progressBps")::numeric/1000000 final FROM review_milestones WHERE "reviewActionId"=$1`,[s.a])).rows[0];
      assert.equal(Number(row.initial),58);assert.equal(Number(row.final),57);
      assert.equal((await query(client,'SELECT count(*)::int n FROM progress_events')).rows[0].n,2);
      await finish(client,s);
    });
    await inTransaction(t,'confirmación sin cambios no crea eventos y actualiza versiones',async()=>{
      const l=await live(client),s=await snapshot(client,l);
      await confirm(client,s,'admin');
      assert.equal((await query(client,'SELECT count(*)::int n FROM progress_events')).rows[0].n,0);
      assert.equal((await query(client,'SELECT version FROM plan_reviews WHERE id=$1',[s.r])).rows[0].version,1);
    });
    await inTransaction(t,'finalizar con pendientes y crear varias revisiones finalizadas',async()=>{
      const l=await live(client),s=await snapshot(client,l);await finish(client,s);
      const second=await snapshot(client,l);await finish(client,second);
      assert.equal((await query(client,'SELECT count(*)::int n FROM plan_reviews WHERE "planId"=$1',[l.p])).rows[0].n,2);
    });
    await inTransaction(t,'una sola revisión abierta incluso en la misma transacción',async()=>{
      const l=await live(client);await snapshot(client,l);
      await rejects(client,()=>header(client,l),'23505');
    });
    await inTransaction(t,'acción histórica sin hitos rechazada al terminar transacción',async()=>{
      const l=await live(client),r=await header(client,l),d=id();
      await query(client,`INSERT INTO review_dimensions VALUES($1,$2,$3,'D','',0)`,[d,r,l.d]);
      await rejects(client,()=>query(client,`INSERT INTO review_actions(id,"reviewDimensionId","sourceActionId",name,description,"responsibleName","startDate","endDate",currency,position) VALUES($1,$2,$3,'A','','R','2027-01-01','2027-12-31','CLP',0)`,[id(),d,l.a]));
    });
    for(const weights of [[9999],[10001],[5000,4999],[0,0]]) await inTransaction(t,`pesos ${weights} rechazados`,async()=>{
      const l=await live(client,weights.map(w=>Math.min(w,10000)));
      if(weights[0]===10001) await rejects(client,()=>query(client,`INSERT INTO review_milestones(id,"reviewActionId","sourceMilestoneId",name,position,"weightBps","initialProgressBps","progressBps") VALUES('invalid','missing','missing','H',0,10001,0,0)`));
      else await rejects(client,()=>snapshot(client,l));
    });
    await inTransaction(t,'un único hito 100% permitido',async()=>{await snapshot(client,await live(client,[10000]));});
    await inTransaction(t,'snapshot conserva nombres, responsables, fechas, gasto y pesos al editar estructura',async()=>{
      const l=await live(client),s=await snapshot(client,l);
      const before=(await query(client,'SELECT to_jsonb(a) data FROM review_actions a WHERE id=$1',[s.a])).rows[0].data;
      await query(client,`UPDATE plans SET name='Nuevo plan' WHERE id=$1`,[l.p]);
      await query(client,`UPDATE dimensions SET name='Nueva dimensión' WHERE id=$1`,[l.d]);
      await query(client,`UPDATE actions SET name='Otra acción',"responsibleName"='Otro',"endDate"='2028-01-01',"actualExpense"=999 WHERE id=$1`,[l.a]);
      await query(client,`UPDATE milestones SET name='Otro hito',"weightBps"=CASE WHEN id=$2 THEN 3000 WHEN id=$3 THEN 2000 ELSE 5000 END WHERE "actionId"=$1`,[l.a,l.hs[0],l.hs[1]]);
      assert.deepEqual((await query(client,'SELECT to_jsonb(a) data FROM review_actions a WHERE id=$1',[s.a])).rows[0].data,before);
      assert.equal((await query(client,'SELECT "weightBps" FROM review_milestones WHERE id=$1',[s.hs[0]])).rows[0].weightBps,2000);
      await finish(client,s); const october=await snapshot(client,l);
      assert.equal((await query(client,'SELECT "weightBps" FROM review_milestones WHERE id=$1',[october.hs[0]])).rows[0].weightBps,3000);
      assert.equal((await query(client,'SELECT "sourceMilestoneId" FROM review_milestones WHERE id=$1',[october.hs[0]])).rows[0].sourceMilestoneId,l.hs[0]);
    });
    await inTransaction(t,'hitos nuevos de estructura no se incorporan a una revisión ya iniciada',async()=>{
      const l=await live(client),s=await snapshot(client,l),newId=id();
      await query(client,'UPDATE milestones SET "weightBps"=1000 WHERE id=$1',[l.hs[0]]);
      await query(client,`INSERT INTO milestones(id,"actionId",name,"weightBps","progressBps",position,"updatedAt") VALUES($1,$2,'Nuevo',1000,0,3,now())`,[newId,l.a]);
      assert.equal((await query(client,'SELECT count(*)::int n FROM review_milestones WHERE "reviewActionId"=$1',[s.a])).rows[0].n,3);
      await finish(client,s);l.hs.push(newId);const next=await snapshot(client,l);
      assert.equal((await query(client,'SELECT count(*)::int n FROM review_milestones WHERE "reviewActionId"=$1',[next.a])).rows[0].n,4);
    });
    await inTransaction(t,'borrado de dimensión actual no borra historial; plan con historial no se elimina',async()=>{
      const l=await live(client),s=await snapshot(client,l);
      await query(client,'DELETE FROM dimensions WHERE id=$1',[l.d]);
      assert.equal((await query(client,'SELECT count(*)::int n FROM review_milestones WHERE "reviewActionId"=$1',[s.a])).rows[0].n,3);
      await rejects(client,()=>query(client,'DELETE FROM plans WHERE id=$1',[l.p]),'23001');
    });
    await inTransaction(t,'hito eliminado rechaza evento sin recrearlo',async()=>{
      const l=await live(client),s=await snapshot(client,l);await query(client,'DELETE FROM milestones WHERE id=$1',[l.hs[1]]);
      const v=await confirm(client,s);await rejects(client,()=>event(client,s,1,5000,6000,v));
      assert.equal((await query(client,'SELECT "progressBps" FROM review_milestones WHERE id=$1',[s.hs[1]])).rows[0].progressBps,5000);
    });
    await inTransaction(t,'guardado de varios hitos se revierte por completo si uno fue eliminado',async()=>{
      const l=await live(client),s=await snapshot(client,l);await query(client,'DELETE FROM milestones WHERE id=$1',[l.hs[1]]);
      await rejects(client,async()=>{const v=await confirm(client,s);await event(client,s,0,4000,6000,v);await persist(client,l,s,0,6000);await event(client,s,1,5000,6000,v);});
      assert.equal((await query(client,'SELECT "progressBps" FROM milestones WHERE id=$1',[l.hs[0]])).rows[0].progressBps,4000);
      assert.equal((await query(client,'SELECT version FROM review_actions WHERE id=$1',[s.a])).rows[0].version,0);
      assert.equal((await query(client,'SELECT count(*)::int n FROM progress_events')).rows[0].n,0);
    });
    await inTransaction(t,'conflicto con avance vigente no se sobrescribe',async()=>{
      const l=await live(client),s=await snapshot(client,l);await query(client,'UPDATE milestones SET "progressBps"=4500 WHERE id=$1',[l.hs[0]]);
      const v=await confirm(client,s);await rejects(client,()=>event(client,s,0,4000,6000,v));
    });
    await inTransaction(t,'administrador aumenta pero no corrige ni falsifica su rol',async()=>{
      const l=await live(client),s=await snapshot(client,l),v=await confirm(client,s,'admin');
      await rejects(client,()=>event(client,s,0,4000,3000,v,'admin'));
      await rejects(client,()=>event(client,s,0,4000,3000,v,'admin',{role:'SUPERUSUARIO'}));
      await event(client,s,0,4000,6000,v,'admin');await persist(client,l,s,0,6000);
    });
    for(const extra of [{reason:null},{reason:'  '},{confirmed:false},{type:'ACTUALIZACION'}]) await inTransaction(t,`corrección inválida ${JSON.stringify(extra)}`,async()=>{
      const l=await live(client),s=await snapshot(client,l),v=await confirm(client,s);
      await rejects(client,()=>event(client,s,0,4000,3000,v,'super',extra));
    });
    for(const next of [-1,10001,4000]) await inTransaction(t,`evento inválido nuevo=${next}`,async()=>{
      const l=await live(client),s=await snapshot(client,l),v=await confirm(client,s);
      await rejects(client,()=>event(client,s,0,4000,next,v));
    });
    await inTransaction(t,'evento aislado sin actualizar estado no puede confirmar',async()=>{
      const l=await live(client),s=await snapshot(client,l),v=await confirm(client,s);
      await rejects(client,()=>event(client,s,0,4000,6000,v));
    });
    await inTransaction(t,'actualizar solamente snapshot también se rechaza',async()=>{
      const l=await live(client),s=await snapshot(client,l),v=await confirm(client,s);
      await rejects(client,async()=>{await event(client,s,0,4000,6000,v);await query(client,'UPDATE review_milestones SET "progressBps"=6000 WHERE id=$1',[s.hs[0]]);});
    });
    await inTransaction(t,'snapshot rechaza avance sin evento y cambios de estructura',async()=>{
      const l=await live(client),s=await snapshot(client,l);
      for(const column of ['progressBps','weightBps','initialProgressBps']) await rejects(client,()=>query(client,`UPDATE review_milestones SET "${column}"=3000 WHERE id=$1`,[s.hs[0]]));
      await rejects(client,()=>query(client,"UPDATE review_actions SET name='Alterado' WHERE id=$1",[s.a]));
      await rejects(client,()=>query(client,"UPDATE review_dimensions SET name='Alterado' WHERE id=$1",[s.d]));
    });
    await inTransaction(t,'eventos inmutables y valores encadenados',async()=>{
      const l=await live(client),s=await snapshot(client,l);let v=await confirm(client,s);
      await event(client,s,0,4000,6000,v);await persist(client,l,s,0,6000);
      v=await confirm(client,s);await event(client,s,0,6000,5000,v);await persist(client,l,s,0,5000);
      await rejects(client,()=>query(client,'UPDATE progress_events SET "newBps"=9000'));
      await rejects(client,()=>query(client,'DELETE FROM progress_events'));
      await rejects(client,()=>event(client,s,0,4000,7000,v));
    });
    await inTransaction(t,'revisión finalizada y descendientes inmutables',async()=>{
      const l=await live(client),s=await snapshot(client,l);await finish(client,s);
      await rejects(client,()=>query(client,"UPDATE plan_reviews SET status='ABIERTA',\"finalizedAt\"=NULL,\"finalizedById\"=NULL,version=version+1 WHERE id=$1",[s.r]));
      await rejects(client,()=>confirm(client,s));
      await rejects(client,()=>query(client,'UPDATE review_milestones SET "progressBps"="progressBps" WHERE id=$1',[s.hs[0]]));
      await rejects(client,()=>query(client,'DELETE FROM plan_reviews WHERE id=$1',[s.r]));
      await rejects(client,()=>query(client,'DELETE FROM review_milestones WHERE id=$1',[s.hs[0]]));
    });
    await inTransaction(t,'revisión relacionada del mismo plan y finalizada',async()=>{
      const l=await live(client),s=await snapshot(client,l),other=await live(client);
      await rejects(client,()=>header(client,other,s.r));await finish(client,s);
      await rejects(client,()=>header(client,other,s.r));
      await header(client,l,s.r);
    });

    await inTransaction(t,'snapshot rechaza identidad duplicada y padres ajenos',async()=>{
      const l=await live(client),s=await snapshot(client,l),other=await live(client);
      await rejects(client,()=>query(client,`INSERT INTO review_dimensions(id,"reviewId","sourceDimensionId",name,description,position) VALUES($1,$2,$3,'D','',0)`,[id(),s.r,l.d]),'23505');
      await rejects(client,()=>query(client,`INSERT INTO review_dimensions(id,"reviewId","sourceDimensionId",name,description,position) VALUES($1,$2,$3,'D','',0)`,[id(),s.r,other.d]));
    });
    await inTransaction(t,'BPS inicial y final fuera de rango rechazados',async()=>{
      const l=await live(client),s=await snapshot(client,l);
      for(const [initial,progress] of [[-1,-1],[10001,10001],[4000,-1],[4000,10001]]) await rejects(client,()=>query(client,`INSERT INTO review_milestones(id,"reviewActionId","sourceMilestoneId",name,position,"weightBps","initialProgressBps","progressBps") VALUES($1,$2,$3,'H',0,0,$4,$5)`,[id(),s.a,l.hs[0],initial,progress]));
    });
    await inTransaction(t,'no reutilizar una versión ni falsificar el avance anterior',async()=>{
      const l=await live(client),s=await snapshot(client,l),v=await confirm(client,s);
      await rejects(client,()=>event(client,s,0,3000,6000,v));
      await rejects(client,()=>event(client,s,0,4000,6000,v+1));
      await event(client,s,0,4000,6000,v);await persist(client,l,s,0,6000);
      await rejects(client,()=>event(client,s,0,6000,7000,v),'23505');
    });
    await inTransaction(t,'confirmaciones y versiones inválidas rechazadas',async()=>{
      const l=await live(client),s=await snapshot(client,l);
      await rejects(client,()=>query(client,`UPDATE review_actions SET version=version+2,"lastReviewedAt"=now(),"lastReviewedById"='super' WHERE id=$1`,[s.a]));
      await rejects(client,()=>query(client,'UPDATE review_actions SET version=version+1 WHERE id=$1',[s.a]));
      await rejects(client,()=>query(client,'UPDATE plan_reviews SET version=version+2 WHERE id=$1',[s.r]));
      await rejects(client,()=>query(client,"UPDATE plan_reviews SET status='FINALIZADA',version=version+1 WHERE id=$1",[s.r]));
    });
    await inTransaction(t,'CHECK de fechas y gasto en un snapshot nuevo',async()=>{
      const l=await live(client),r=await header(client,l),d=id();
      await query(client,`INSERT INTO review_dimensions VALUES($1,$2,$3,'D','',0)`,[d,r,l.d]);
      for(const [start,end,expense] of [['2027-12-31','2027-01-01','1'],['2027-01-01','2027-12-31','-1'],['2027-01-01','2027-12-31','0.50'],['2027-01-01','2027-12-31','NaN']]) {
        await rejects(client,()=>query(client,`INSERT INTO review_actions(id,"reviewDimensionId","sourceActionId",name,description,"responsibleName","startDate","endDate","actualExpense",currency,position) VALUES($1,$2,$3,'A','','R',$4,$5,$6,'CLP',0)`,[id(),d,l.a,start,end,expense]));
      }
    });
    await inTransaction(t,'un actor desactivado no registra cambios',async()=>{
      const l=await live(client),s=await snapshot(client,l),v=await confirm(client,s,'admin');
      await query(client,"UPDATE users SET active=false WHERE id='admin'");
      await rejects(client,()=>event(client,s,0,4000,6000,v,'admin'));
    });
    await t.test('orígenes sin FK y solo FK históricas restrictivas',async()=>{
      const fks=(await query(client,`SELECT conname,confdeltype,pg_get_constraintdef(oid) def FROM pg_constraint WHERE connamespace=$1::regnamespace AND contype='f' AND conrelid IN ('review_dimensions'::regclass,'review_actions'::regclass,'review_milestones'::regclass,'progress_events'::regclass)`,[schema])).rows;
      assert.ok(fks.length>=5);assert.ok(fks.every(f=>f.confdeltype==='r'));assert.ok(fks.every(f=>!f.def.includes('source')));
    });
    // Committed fixtures are needed for independent concurrent connections.
    let committedLive,committedSnapshot;
    await query(client,'BEGIN');committedLive=await live(client);committedSnapshot=await snapshot(client,committedLive);await query(client,'COMMIT');
    await t.test('no se añaden elementos al snapshot después de su transacción de creación',async()=>{
      await query(client,'BEGIN');
      try{await rejects(client,()=>query(client,`INSERT INTO review_dimensions(id,"reviewId","sourceDimensionId",name,description,position) VALUES($1,$2,$3,'D','',0)`,[id(),committedSnapshot.r,committedLive.d]));}finally{await query(client,'ROLLBACK');}
    });
    await t.test('finalización no se intercala con un guardado; después del cierre se rechaza',async()=>{
      const second=new pg.Client(connection);await second.connect();await query(second,`SET search_path TO "${schema}"`);
      try{
        await query(client,'BEGIN');await query(second,'BEGIN');
        await confirm(client,committedSnapshot);
        await query(second,"SET LOCAL lock_timeout='150ms'");
        await assert.rejects(()=>finish(second,committedSnapshot),e=>e.code==='55P03');
        await query(second,'ROLLBACK');await query(client,'COMMIT');
        await query(second,'BEGIN');await finish(second,committedSnapshot);await query(second,'COMMIT');
        await query(client,'BEGIN');await rejects(client,()=>confirm(client,committedSnapshot));await query(client,'ROLLBACK');
      }finally{await query(client,'ROLLBACK');await query(second,'ROLLBACK');await second.end();}
    });
    await t.test('dos guardados con la misma versión: solo uno confirma',async()=>{
      let l,s;await query(client,'BEGIN');l=await live(client);s=await snapshot(client,l);await query(client,'COMMIT');
      const second=new pg.Client(connection);await second.connect();await query(second,`SET search_path TO "${schema}"`);
      try {
        const sql=`UPDATE review_actions SET version=version+1,"lastReviewedAt"=now(),"lastReviewedById"='super' WHERE id=$1 AND version=0`;
        const result=await Promise.all([query(client,sql,[s.a]),query(second,sql,[s.a])]);
        assert.deepEqual(result.map(r=>r.rowCount).sort(),[0,1]);
      }finally{await second.end();}
    });
    await t.test('dos aperturas concurrentes: índice parcial decide un único ganador',async()=>{
      const l=await live(client),second=new pg.Client(connection);await second.connect();await query(second,`SET search_path TO "${schema}"`);
      try{
        await query(client,'BEGIN');await header(client,l);
        await query(second,'BEGIN');await query(second,"SET LOCAL lock_timeout='150ms'");
        await assert.rejects(()=>header(second,l),e=>e.code==='55P03');await query(second,'ROLLBACK');
        await query(client,'COMMIT');await query(second,'BEGIN');
        await assert.rejects(()=>header(second,l),e=>e.code==='23505');await query(second,'ROLLBACK');
      }finally{await query(client,'ROLLBACK');await query(second,'ROLLBACK');await second.end();}
    });
  }finally{
    await query(client,'ROLLBACK');
    await query(client,'SET search_path TO public');
    await query(client,`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});
