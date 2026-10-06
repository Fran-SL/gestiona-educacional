import "dotenv/config";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
export async function isolatedDatabase() {
  const schema = `tracking_test_${randomUUID().replaceAll('-', '')}`;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Falta DATABASE_URL');
  const client = new pg.Client({ connectionString });
  await client.connect();
  async function cleanup() {
    try { await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await client.end(); }
  }
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    for (const name of (await readdir('prisma/migrations')).filter(n => /^\d/.test(n)).sort()) {
      const sql = (await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8')).replace(/CREATE SCHEMA IF NOT EXISTS "public";/g, '');
      await client.query(sql);
    }
    const url = new URL(connectionString); url.searchParams.set('schema', schema);
    return { url: url.toString(), cleanup };
  } catch (error) { await cleanup(); throw error; }
}
