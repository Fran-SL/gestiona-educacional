import { isolatedDatabase } from '../helpers/isolated-database.mjs';
import { PrismaClient } from '../../generated/prisma/client.ts';
import { databaseAdapter } from '../../models/database-adapter.ts';
import { hashPassword } from 'better-auth/crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as pause } from 'node:timers/promises';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const isolated = await isolatedDatabase();

const db = new PrismaClient({
  adapter: databaseAdapter(isolated.url),
});

let child;
let log = '';

const origin = 'http://127.0.0.1:3103';

try {
  const password = crypto.randomUUID();
  const id = crypto.randomUUID();
  const email = `${id}@example.invalid`;

  await db.user.create({
    data: {
      id,
      name: 'Prueba concurrencia',
      email,
      role: 'SUPERUSUARIO',
      accounts: {
        create: {
          providerId: 'credential',
          accountId: id,
          password: await hashPassword(password),
        },
      },
    },
  });

  const plan = await db.plan.create({
    data: {
      name: 'Plan concurrencia',
      createdById: id,
    },
  });

  const dimension = await db.dimension.create({
    data: {
      planId: plan.id,
      name: 'Dimensión',
      weightBps: 10000,
    },
  });

  const review = await db.$transaction(async tx => {
    const r = await tx.planReview.create({
      data: {
        planId: plan.id,
        planName: plan.name,
        planStatus: plan.status,
        planDescription: plan.description,
        title: 'Revisión concurrencia',
        referenceStartDate: new Date('2026-01-01'),
        referenceEndDate: new Date('2026-12-31'),
        createdById: id,
      },
    });

    await tx.reviewDimension.create({
      data: {
        reviewId: r.id,
        sourceDimensionId: dimension.id,
        name: 'Dimensión',
        description: '',
        position: 0,
        weightBps: 10000,
      },
    });

    return r;
  });

  child = spawn(
    'npm',
    [
      'run',
      'dev',
      '--',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      '3103',
    ],
    {
      env: {
        ...process.env,
        WATCHPACK_POLLING: '1000',
        DATABASE_URL: isolated.url,
        BETTER_AUTH_URL: origin,
        NODE_OPTIONS:
          `${process.env.NODE_OPTIONS ?? ''} --trace-deprecation`,
      },
      stdio: [
        'ignore',
        'pipe',
        'pipe',
      ],
      detached: true,
    }
  );

  for (const stream of [
    child.stdout,
    child.stderr,
  ]) {
    stream.on('data', data => {
      log += data.toString();
      process.stdout.write(data);
    });
  }

  let ready = false;

  for (let i = 0; i < 25; i++) {
    try {
      if (
        (
          await fetch(
            origin + '/login',
            {
              signal:
                AbortSignal.timeout(3000),
            }
          )
        ).ok
      ) {
        ready = true;
        break;
      }
    } catch {}

    await pause(1000);
  }

  assert.ok(
    ready,
    'El servidor de desarrollo debe estar disponible'
  );

  const login = await fetch(
    origin + '/api/auth/sign-in/email',
    {
      signal: AbortSignal.timeout(30000),
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin,
      },
      body: JSON.stringify({
        email,
        password,
      }),
    }
  );

  assert.equal(
    login.status,
    200,
    'Login ficticio'
  );

  const cookie = login.headers
    .getSetCookie()
    .map(s => s.split(';')[0])
    .join('; ');

  for (const path of [
    `/planes/${plan.id}/seguimiento`,
    `/planes/${plan.id}/seguimiento/${review.id}`,
  ]) {
    const response = await fetch(
      origin + path,
      {
        signal:
          AbortSignal.timeout(30000),
        headers: {
          cookie,
        },
      }
    );

    const html = await response.text();

    assert.equal(
      response.status,
      200
    );

    assert.ok(
      html.includes(
        'Revisión concurrencia'
      )
    );

    assert.ok(
      !response.url.endsWith('/login')
    );

    assert.ok(
      !html.includes(
        'Calling client.query() when the client is already executing a query'
      ),
      'Sin warning en el contenido renderizado'
    );

    console.log(
      'GET autenticado',
      path,
      response.status
    );
  }

  await pause(1000);

  const warning = log.includes(
    'Calling client.query() when the client is already executing a query'
  );

  await writeFile(
    '/private/tmp/tracking-dev-trace.log',
    log,
    {
      mode: 0o600,
    }
  );

  console.log(
    'Warning de concurrencia:',
    warning
  );

  assert.equal(
    warning,
    false,
    'TrackingPage no debe generar consultas concurrentes en el mismo pg Client'
  );
} finally {
  await writeFile(
    '/private/tmp/tracking-dev-trace.log',
    log,
    {
      mode: 0o600,
    }
  );

  if (
    child &&
    child.exitCode === null
  ) {
    process.kill(
      -child.pid,
      'SIGTERM'
    );

    await once(
      child,
      'exit'
    );
  }

  await db.$disconnect();
  await isolated.cleanup();
}