# Etapa 3: operaciones de servidor

Implementación del 30/09/2026. Mantiene íntegros el schema, la migración y el contrato de `SEGUIMIENTO-DATOS.md`. No agrega páginas de reunión, Dashboard, gráficos ni fórmulas de Plan/Dimensión.

## Flujo MVC

`app/seguimiento/actions.ts` → `controllers/tracking-controller.ts` → esquemas Zod de `models/tracking-rules.ts` → `models/review.ts` → Prisma/PostgreSQL.

Todas las operaciones resuelven la sesión mediante `session-controller`. El controller exige usuario activo con rol ADMINISTRADOR o SUPERUSUARIO antes de validar la entrada. El modelo relee y bloquea brevemente el usuario con `FOR SHARE`, por lo que ni la identidad ni el rol usado para eventos proceden del cliente. Los errores de validación, acceso y dominio se convierten en respuestas `{ ok: false, code, error }`; los detalles SQL y stacks no se envían. El éxito devuelve `{ ok: true, data }`.

## Contratos de entrada

Todos los objetos Zod, incluidos los hitos, son estrictos. IDs: texto no vacío hasta 200 caracteres; versiones: enteros de 0 a 2147483646; BPS: enteros de 0 a 10000. Fechas: fechas ISO reales `YYYY-MM-DD` y fin no anterior al inicio.

| Server Action | Entrada |
|---|---|
| `startReview` | `planId`, `title` (1–200, recortado), `referenceStartDate`, `referenceEndDate` |
| `readReview` | `planId`, `reviewId`, `includeEvents?: boolean` (false por defecto) |
| `listReviews` | `planId`, `status?: ABIERTA / FINALIZADA` |
| `saveTrackingAction` | `planId`, `reviewId`, `reviewActionId`, `version`, `milestones[]` |
| `finalizeReview` | `planId`, `reviewId`, `version`, `confirmPending?: boolean` (false) |
| `readProgressEvents` | `planId`, `reviewId`, `reviewActionId`, `reviewMilestoneId?: string` |

Cada elemento de `milestones` lleva `reviewMilestoneId`, `progressBps`, `confirmDecrease?: boolean` (false), `reason?: string` (recortado, máximo 5000). Deben enviarse todos los hitos históricos de la acción, una sola vez. El servidor exige motivo no vacío y confirmación para cada disminución; ignora el motivo para aumentos o confirmaciones iguales. Campos como actor, rol, tipo, avance anterior, pesos o snapshot son rechazados.

## Inicio y lectura

Una transacción RepeatableRead copia toda la estructura desde BD, incluidas dimensiones vacías y acciones con N hitos. No copia comentarios. Si una acción carece de hitos o sus pesos no suman 10000, devuelve INVALID_STRUCTURE y revierte todo. Los planes cerrados siguen habilitados. Una segunda revisión ABIERTA se rechaza como OPEN_REVIEW, con el índice parcial como última barrera. Una carrera que PostgreSQL resuelva por serialización puede devolver CONFLICT.

Las lecturas usan RepeatableRead para que versiones, estados, avances y eventos correspondan a una misma fotografía. El DTO excluye `snapshotTransactionId`, serializa fechas y gastos decimales como texto, y solo calcula el logro inicial/actual por acción mediante la regla existente. Los hitos indican `sourceDeleted` y `sourceAvailable`. No se entrega información de cuentas, contraseñas ni sesiones.

Los estados derivados son PENDIENTE, REVISADA_SIN_CAMBIOS y REVISADA_CON_CAMBIOS. La existencia de cualquier evento en la revisión mantiene el último estado incluso tras una confirmación sin cambios. La identidad del actor y su rol histórico están en cada evento; su nombre mostrado se consulta desde User y no es una copia histórica del nombre.

## Guardado y concurrencia

1. Resolver y validar actor en BD.
2. `SELECT ... FOR UPDATE` de PlanReview; comprobar pertenencia y ABIERTA.
3. Leer ReviewAction y comparar su versión esperada; comprobar lote completo.
4. Bloquear brevemente dimensión actual (`FOR SHARE`), acción actual (`FOR UPDATE`) y sus hitos (`FOR UPDATE`, orden por ID). Comprobar plan, acción, existencia y avances vigentes de todos los hitos, incluidos los que no cambiaron.
5. Determinar aumentos/correcciones en servidor y validar todas las disminuciones antes de escribir.
6. Registrar confirmador/instante e incrementar ReviewAction.version una vez. El trigger incrementa PlanReview.version una vez.
7. Para cada cambio: insertar evento, actualizar ReviewMilestone y Milestone en la misma transacción.
8. Si cambió algún avance, incrementar Action.version una vez. Esto invalida una edición estructural que hubiera leído la versión anterior; sus escrituras ya comparan ese contador. Una confirmación sin cambios no incrementa Action.version.
9. Commit ejecuta los guards diferidos. Cualquier fallo revierte la acción completa.

No se mantiene ningún lock durante una reunión. Un hito eliminado o un conflicto rechaza el lote, aunque los restantes sean válidos. No hay reintentos automáticos de escrituras con versiones obsoletas.

La hora se obtiene de PostgreSQL como epoch en texto y se convierte a Date. Se usa el mismo instante explícito en confirmación, eventos y confirmedAt para evitar desfases del decodificador de timestamps de consultas raw y diferencias con el inicio de transacción. No se cambió el contrato SQL.

## Cierre e historial

Finalizar bloquea la revisión, exige ABIERTA y versión del resumen vigente, cuenta revisadas/pendientes y requiere confirmPending=true cuando hay pendientes. Incrementa PlanReview.version una vez y registra finalizador/fecha. No existe operación de reapertura. Las revisiones finalizadas y sus eventos siguen consultables aunque se borre estructura vigente.

## Pruebas aisladas

- `npm test`: reglas Zod, controller, respuestas seguras y regresiones existentes.
- `npm run test:tracking`: controller/model reales contra un esquema PostgreSQL aleatorio; aplica migraciones existentes y retira únicamente su esquema.
- `npm run test:integrity`: guards SQL de Etapa 2, también aislados.
- `npm run test:tracking:http`: crea otro esquema aislado, genera un adaptador de página exclusivamente para pruebas que referencia las seis Server Actions, compila y ejecuta HTTP con sesiones reales ficticias y las regresiones estructurales/autenticación. Retira la página temporal, elimina su esquema y recompila sin ella. No requiere Chromium.

Next elimina las Server Actions no referenciadas del build. Por ello las seis funciones quedan preparadas para la futura UI; el adaptador temporal de pruebas permite verificarlas por HTTP sin publicar una interfaz de Seguimiento ahora.

`models/database-adapter.ts` respeta el parámetro opcional `schema` de DATABASE_URL tanto en consultas Prisma como en SQL directo. Sin ese parámetro usa public, manteniendo la instalación actual. No se modificó `.env`. Los helpers de pruebas HTTP existentes usan el mismo adaptador para aislar todas sus escrituras.

Los procesos de prueba pueden emitir el aviso de deprecación de pg sobre consultas internas concurrentes del adaptador y advertencias de color. No se agregaron dependencias ni se modificaron versiones.

## Verificación de entrega

- Prisma validate y generate: correctos (cliente 7.10.0).
- TypeScript y ESLint: correctos, sin errores ni advertencias de lint.
- Unitarias: 59 aprobadas en 9 archivos (18 nuevas).
- Integración de Seguimiento: 17 aprobadas en esquema aislado.
- Integridad SQL: 41 casos aprobados y su contenedor, 42 resultados.
- HTTP: seis regresiones existentes aprobadas y dos pruebas de Seguimiento aprobadas en un segundo lote (25,7 segundos). El primer intento del adaptador temporal fue excluido por Next por su prefijo privado; se corrigió. Los accesos siguientes toparon con el límite de autenticación compartido; se añadió la pausa de 11 segundos que ya usan las pruebas existentes, sin desactivar protecciones.
- Build final con Webpack: correcto; la ruta temporal de pruebas ya no aparece en la compilación normal.
- `git diff --check`: correcto.
- Migración de Etapa 2 comparada con la entrega aprobada: sin modificaciones. No se aplicaron migraciones nuevas ni se probaron escrituras en datos reales.

Cambios sin commit. La Etapa 4 requiere aprobación del usuario.

## Corrección de concurrencia del adaptador — revisión de Etapa 4

El warning de pg anteriormente tolerado fue reproducido en `next dev` al cargar Seguimiento. Los includes de `planReview.findMany` dentro de `list` se resuelven mediante consultas paralelas de Prisma sobre el cliente exclusivo de la transacción. `loadTracking` ya esperaba cada operación y la configuración de schema solo fija `search_path`; no ejecuta consultas concurrentes de inicialización.

`databaseAdapter` ahora ordena `queryRaw` y `executeRaw` mediante una cola por transacción. No ordena las consultas del pool entre sí ni transacciones distintas. Mantiene errores originales, rollback y configuración de schema/public. No cambia contratos ni migraciones.

Las pruebas previas comprobaban respuestas/atomicidad, pero no convertían warnings del proceso en fallos. Se agregaron cinco pruebas unitarias del adaptador y una integración PostgreSQL de concurrencia/schema/public. El runner HTTP ahora muestra los logs y falla si detecta este warning. `node --import tsx tests/diagnostics/tracking-dev.mjs` inicia un proceso nuevo de desarrollo con trazado de deprecaciones, autentica una cuenta ficticia en un schema temporal y comprueba ambas rutas por HTTP. Falla si encuentra el warning y limpia servidor/esquema. Usa polling del watcher solo en ese proceso para evitar EMFILE del entorno; no modifica el overlay ni el tratamiento de warnings.
