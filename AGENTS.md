# Gestión Educacional

Esta es la carpeta principal solicitada por el usuario. Arquitectura MVC con Next.js, TypeScript, PostgreSQL, Prisma y Better Auth. Consultar docs/DECISIONES.md y docs/ARQUITECTURA.md antes de modificar reglas funcionales.

El usuario desea ver los cambios y comentar líneas en el panel de revisión. Dejar los cambios sin commit; no crear commits automáticamente. Abrir el panel de revisión después de cada conjunto de cambios.

La base local ya contiene cuentas reales y planes del usuario: no ejecutar setup:users, reiniciar migraciones ni borrar datos existentes. Las pruebas que escriban datos deben identificar y limpiar únicamente sus propios registros temporales.

No mostrar ni versionar .env, contraseñas o secretos. Usar Node.js 24 y comprobar lo relevante con npm test, npm run typecheck, npm run lint y npm run build.

Planes siempre editables, incluso cerrados. Jerarquía configurable Plan → Dimensión → Gestión → Acción → Hito. Pesos solo para hitos, suma 100%, logro calculado. No inventar fórmulas de avance agregado. Mantener toda regla funcional acordada en docs/DECISIONES.md.
