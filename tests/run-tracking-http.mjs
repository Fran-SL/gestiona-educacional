import { isolatedDatabase } from './helpers/isolated-database.mjs';
import { spawn } from 'node:child_process';
const requested = process.argv.slice(2);
const allowed = ['dashboard-api.spec.ts', 'tracking-api.spec.ts', 'actions-api.spec.ts', 'plan-structure-api.spec.ts', 'auth-plans-api.spec.ts', 'tracking-ui.spec.ts'];
if (requested.some(file => !allowed.includes(file))) throw new Error('Suite desconocida');
const isolated = await isolatedDatabase();
const env = { ...process.env, DATABASE_URL: isolated.url };
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', args, { env, stdio: ['inherit', 'pipe', 'pipe'] });
    let output = '';
    for (const [stream, destination] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
      stream.on('data', chunk => { output += chunk.toString(); destination.write(chunk); });
    }
    child.on('error', reject);
    child.on('exit', code => {
      if (output.includes('Calling client.query() when the client is already executing a query')) {
        reject(new Error('Regresión: consultas concurrentes sobre un único pg Client.'));
      } else if (code === 0) resolve();
      else reject(new Error(`Pruebas: código ${code}`));
    });
  });
}
try {
  await run(['run', 'build', '--', '--webpack']);
  await run(['run', 'test:e2e', '--', ...(requested.length ? requested : allowed.filter(file => file !== 'tracking-ui.spec.ts'))]);
} finally { await isolated.cleanup(); }
