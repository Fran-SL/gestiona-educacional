# Seguimiento: capa de datos (Etapa 2)

Implementación aditiva aprobada el 30/09/2026. No incluye UI, rutas, controllers ni operaciones públicas de seguimiento. No incluye Dashboard ni fórmulas de Dimensión/Plan.

## Separación de responsabilidades

- `Milestone.progressBps`: estado vigente. Estructura no lo escribe al editar; nuevos hitos comienzan en cero.
- `PlanReview → ReviewDimension → ReviewAction → ReviewMilestone`: snapshot de referencia y avances de una revisión.
- `ProgressEvent`: eventos inmutables de aumento/corrección. La revisión se obtiene por la jerarquía; no se duplica `planReviewId` en el evento.
- Identificadores `sourceDimensionId`, `sourceActionId`, `sourceMilestoneId` sin FK: las eliminaciones de estructura no destruyen identidad ni historial.
- Sin copia de comentarios estructurales. Sin relación desde snapshots hacia dimensiones/acciones/hitos actuales.

## DDL y restricciones

Migración: `prisma/migrations/202609300002_plan_reviews/migration.sql`.

Crea dos enums y cinco tablas. No altera ni elimina columnas, filas o tablas previas. Las únicas FK hacia tablas existentes son `Plan` y `User`, con `ON DELETE/UPDATE RESTRICT`. Las FK internas históricas también son restrictivas.

Incluye:

- Índice único parcial por `planId` con `status = 'ABIERTA'`.
- BPS enteros entre 0 y 10000 en pesos, avances iniciales/registrados y valores anterior/nuevo.
- Fechas ordenadas, gasto finito no negativo y CLP entero, posiciones/versiones no negativas.
- Consistencia de cierre y autoría/fecha de confirmación.
- Cada acción histórica tiene al menos un hito y peso total 10000. Constraint triggers diferidos verifican el conjunto al confirmar la transacción; también se disparan al insertar la acción para detectar cero hitos.
- Snapshots estructurales inmutables; revisión finalizada inmutable; eventos de solo inserción.
- Corrección con motivo no vacío, confirmación, rol histórico SUPERUSUARIO y valores decrecientes. El guard comprueba además el rol vigente y activación de ese usuario. La futura capa autenticada deberá obtener ese usuario de la sesión, nunca del navegador.
- Validación de pertenencia al crear snapshots y al insertar eventos.
- Eventos coherentes con la versión/confirmador de su acción histórica y con los avances anterior y vigente.
- Validación diferida de cadena de eventos y consistencia entre último evento, avance del snapshot y avance actual. Un evento aislado o una actualización solo histórica no puede confirmar.

## Ajuste técnico respecto de la propuesta

`PlanReview.snapshotTransactionId BigInt @default(dbgenerated("txid_current()"))` identifica la transacción de creación. Es interno, inmutable, asignado/comprobado por SQL y no es un contador funcional. Impide añadir elementos históricos en transacciones posteriores, aunque la revisión siga ABIERTA o su `version` cambie. Debe excluirse de DTO JSON o serializarse explícitamente como string si se requiere diagnóstico.

## Contrato transaccional para la próxima etapa

No se han implementado estas operaciones en models/controllers. Los fixtures de prueba ejecutan SQL mínimo para verificar las restricciones.

### Inicio

Una única transacción `RepeatableRead` debe insertar la cabecera y copiar toda la estructura vigente. La futura operación hará esa copia completa desde la BD, incluidos nombre, descripción, orden, fechas, responsable, gasto, moneda, peso y avance inicial. SQL comprueba pertenencia e integridad pero no sustituye al servicio que recorre/copiará la estructura completa.

`progressBps` histórico inicia igual a `initialProgressBps`. Acciones históricas inician en versión cero, pendientes, con ambas columnas de confirmación nulas. Nuevas revisiones toman la estructura vigente; revisiones no equivalen a meses.

### Guardado futuro de una acción

Orden exigido por las restricciones, dentro de una única transacción:

1. Bloquear `PlanReview` con `SELECT ... FOR UPDATE`, verificar ABIERTA.
2. Comparar versión esperada de `ReviewAction`; resolver identidad de sesión y validar todo el lote antes de escribir. Coordinar `Action.version` y los locks de la estructura actual donde corresponda.
3. Incrementar `ReviewAction.version` exactamente en uno y registrar `lastReviewedAt`/`lastReviewedById`. Su trigger incrementa automáticamente `PlanReview.version`: el servicio NO debe incrementarla nuevamente por el mismo guardado.
4. Insertar un evento por hito cambiado con la versión resultante y un instante de operación consistente. SQL exige que los eventos sean posteriores o iguales a la confirmación; no mezclar `clock_timestamp()` con un `createdAt` anterior tomado del inicio de transacción.
5. Actualizar el `ReviewMilestone.progressBps` correspondiente y el `Milestone.progressBps` vigente.
6. Commit verifica pesos y coherencia de eventos/estados. Si falla cualquier hito, rollback de todo el lote.

`progress_event_guard` comprueba existencia del original y bloquea brevemente esa fila actual. Si fue eliminado o no pertenece al plan/acción, rechaza el guardado. Si el avance vigente no coincide con el anterior esperado, rechaza por conflicto. No recrea hitos ni elige valores silenciosamente.

Estas funciones son guards de integridad; no generan eventos ni actualizan avances automáticamente. La lógica futura deberá detectar el tipo, exigir confirmación explícita y motivo en servidor y calcular el resultado desde la BD.

### Confirmaciones y cierre

Guardar sin cambios actualiza únicamente la última confirmación y las versiones, sin evento artificial. Clasificación derivada:

- Pendiente: `lastReviewedAt IS NULL`.
- Revisada sin cambios: confirmación presente y ningún evento.
- Revisada con cambios: existen eventos, aunque la variación neta final sea cero.

Finalizar exige el mismo lock de revisión y una comparación con la versión del resumen previamente mostrado. El UPDATE de cierre incrementa `PlanReview.version` exactamente en uno y establece `finalizedAt/finalizedById`. SQL permite pendientes; el resumen/advertencia explícitos pertenecen al flujo futuro. Se prohíbe reabrir o sobrescribir el pasado.

`relatedReviewId`, si existe, apunta a una revisión ya FINALIZADA del mismo plan. No debe actualizarse retrospectivamente.

No se mantiene ningún bloqueo durante toda la reunión. Estructura continúa editable. Los guards no se instalan sobre tablas estructurales actuales.

## Precisión y ejemplo

Solo se calcula la acción: `SUM(weightBps::bigint * progressBps) / 1.000.000`, sin persistir un porcentaje editable. El cálculo usa N hitos y redondea únicamente al mostrar.

Con pesos 2000/3000/5000 y avances iniciales 4000/5000/7000, el inicial es 58%. Después de aumentar el primero a 6000 y corregir el tercero a 6000, el final es 57%. Solo hay dos eventos. El segundo hito conserva 5000.

## Pruebas de integridad

`npm run test:integrity` crea un esquema PostgreSQL de nombre aleatorio, aplica allí las tres migraciones y usa únicamente datos ficticios. Las sesiones concurrentes usan ese mismo esquema. Al terminar se elimina solo ese esquema de pruebas. Nunca se modifica el esquema público desde esa suite.

Cubre rangos, suma de pesos, hito único, actores/correcciones, cadena de eventos, snapshots independientes de cambios/agregados/borrados actuales, inmutabilidad, bloqueo de borrado de plan, conflictos, rollback completo por hito eliminado, unicidad concurrente, versiones y guardado/finalización concurrentes.

## Límites de esta entrega

No existe todavía una operación autenticada para iniciar, guardar o finalizar revisiones, ni validaciones Zod específicas del futuro seguimiento. Las restricciones SQL no acreditan por sí mismas quién está autenticado en el navegador. La siguiente etapa deberá implementar esos servicios usando el contrato transaccional anterior, sin exponer escrituras parciales.
