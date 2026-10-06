import 'dotenv/config';
import pg from 'pg';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
// Isolated schema, rolled back in full. Never modifies institutional records.
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  const schema = `migration_test_${randomUUID().replaceAll('-', '')}`;
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}"`);
  const initial = await readFile('prisma/migrations/202609280001_initial/migration.sql', 'utf8');
  await client.query(initial.replace('CREATE SCHEMA IF NOT EXISTS "public";', ''));
  await client.query(`
    INSERT INTO users (id,name,email,"updatedAt") VALUES ('u','Test','migration@example.invalid',now());
    INSERT INTO plans (id,name,"createdById","updatedAt") VALUES ('p','Plan','u',now());
    INSERT INTO dimensions (id,"planId",name,"updatedAt") VALUES ('d','p','Dimension',now());
    INSERT INTO managements (id,"dimensionId",name,"updatedAt") VALUES ('g1','d','First',now()), ('g2','d','Second',now());
    INSERT INTO actions (id,"managementId",name,description,"responsibleName","startDate","endDate","actualExpense","updatedAt")
    VALUES ('a1','g1','Action 1','Description','Responsible','2026-01-01','2026-12-31',1000,now()), ('a2','g2','Action 2','Description','Responsible','2026-01-01','2026-12-31',2000,now());
    INSERT INTO milestones (id,"actionId",name,"weightBps","progressBps","updatedAt") VALUES ('h','a1','Milestone',10000,5000,now());
    INSERT INTO milestone_comments (id,"milestoneId","authorId",body,"updatedAt") VALUES ('c','h','u','Comment',now());
  `);
  const before = (await client.query('SELECT * FROM actions ORDER BY id')).rows.map(row => { const copy = { ...row, dimensionId: 'd' }; delete copy.managementId; return copy; });
  const migration = await readFile('prisma/migrations/202609300001_actions_under_dimensions/migration.sql', 'utf8');
  await client.query(migration.replace(/^BEGIN;\s*/m, '').replace(/^COMMIT;\s*/m, ''));
  assert.deepEqual((await client.query('SELECT * FROM actions ORDER BY id')).rows, before);
  assert.equal((await client.query('SELECT "progressBps" FROM milestones WHERE id=\'h\'')).rows[0].progressBps, 5000);
  assert.equal((await client.query('SELECT body FROM milestone_comments WHERE id=\'c\'')).rows[0].body, 'Comment');
  await client.query("DELETE FROM dimensions WHERE id='d'");
  for (const table of ['actions', 'milestones', 'milestone_comments']) assert.equal((await client.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 0);
  console.log('Migración verificada: acciones, gastos, hitos y comentarios conservados; cascada correcta.');
} finally { await client.query('ROLLBACK'); await client.end(); }
