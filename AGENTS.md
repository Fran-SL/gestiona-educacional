# Gestión Educacional

Esta es la carpeta principal solicitada por el usuario. Arquitectura MVC con Next.js, TypeScript, PostgreSQL, Prisma y Better Auth. Consultar docs/DECISIONES.md y docs/ARQUITECTURA.md antes de modificar reglas funcionales.

El usuario desea ver los cambios y comentar líneas en el panel de revisión. Dejar los cambios sin commit; no crear commits automáticamente. Abrir el panel de revisión después de cada conjunto de cambios.

La base local ya contiene cuentas reales y planes del usuario: no ejecutar setup:users, reiniciar migraciones ni borrar datos existentes. Las pruebas que escriban datos deben identificar y limpiar únicamente sus propios registros temporales.

No mostrar ni versionar .env, contraseñas o secretos. Usar Node.js 24 y comprobar lo relevante con npm test, npm run typecheck, npm run lint y npm run build.

Planes siempre editables, incluso cerrados. Jerarquía configurable Plan → Dimensión → Acción → Hito. Pesos en dimensiones, acciones e hitos: cada grupo de hermanos suma 100%. El Dashboard calcula logros ponderados por toda la jerarquía, según autorización del usuario. Los indicadores históricos usan solo los pesos y avances del snapshot. Mantener toda regla funcional acordada en docs/DECISIONES.md.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
