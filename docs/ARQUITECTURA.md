# Arquitectura MVC

## Organización

- `app/`: rutas y futuros adaptadores Server Actions/Route Handlers.
- `views/`: presentación React. No importa Prisma ni accede directamente a PostgreSQL.
- `controllers/`: autorización, validación de entradas y coordinación del modelo.
- `models/`: reglas funcionales y persistencia Prisma.
- `prisma/`: esquema y migraciones de PostgreSQL.
- `generated/prisma/`: cliente generado; no se edita ni se versiona.

## Estado actual

Inicio de sesión y cierre de sesión con Better Auth y Prisma. Registro público deshabilitado. Roles y activación no aceptan valores enviados por el cliente. Cada lectura y creación de planes exige una sesión válida y relee permisos desde PostgreSQL.

`app/` adapta solicitudes; `controllers/` autoriza y coordina; `models/` valida y persiste; `views/` presenta. La pantalla de planes lista y crea registros persistentes, admite descripción y fechas opcionales y conserva el creador de la sesión. Las credenciales, secretos y conexión están fuera de Git.

`npm run setup:users` configura las dos cuentas en una instalación vacía: pide nombres, correos y contraseñas ocultas en una terminal interactiva. Almacena hashes de Better Auth y crea ambas cuentas en una transacción con bloqueo para evitar inicializaciones simultáneas. No sobrescribe cuentas existentes.

Cada plan se abre en `/planes/[id]`. `structure-controller` autoriza lecturas, guardado, resumen y eliminación; `plan-structure` persiste dimensiones y consulta sus acciones e hitos directamente. `Action.dimensionId` referencia `Dimension`; se eliminó el modelo `Management`. El borrado exige confirmación y una huella del contenido dependiente, comprobada dentro de una transacción serializable. No se bloquean los planes cerrados.

Pendientes: administración posterior de usuarios, recuperación de contraseña, edición de datos generales del plan, acciones/hitos, duplicación, cierre/exportación e importación.

## Integridad

La base protege relaciones, rangos y fechas mediante claves y restricciones. La suma de pesos y la existencia de al menos un hito deben validarse en el modelo dentro de la misma transacción que guarda el conjunto. Las futuras escrituras de hitos usarán `Action.version` para detectar ediciones concurrentes; no basta con validar solo en la interfaz. Ningún controlador de hitos está publicado todavía.

El logro se calcula desde los hitos, sin columna persistida. No se calculan avances agregados de niveles superiores. Los gastos usan Decimal(18,2); CLP se valida sin fracciones al implementar su formulario.

## Referencias técnicas

- https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators
- https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference
- https://better-auth.com/docs/concepts/database

## Verificación de esta etapa

- Prisma validate y generación del cliente: correctos.
- 19 pruebas de reglas de hitos, validaciones y permisos: correctas.
- TypeScript, ESLint y compilación de producción de Next.js: correctos.
- Migración inicial aplicada a PostgreSQL 18 local en `127.0.0.1:5432`, base `gestion_educacional`, con un usuario dedicado sin permisos de superusuario. Prisma confirmó el esquema actualizado. Se verificaron conexión, escritura de la jerarquía completa, cálculo del 52%, rechazo de avance fuera de rango y borrado en cascada dentro de una transacción revertida. No quedaron datos de prueba.
- Next.js actualizado de 16.3.1 a 16.3.6 por los avisos de seguridad de npm audit. La auditoría sigue mostrando cuatro avisos altos asociados a prisma/@prisma/config/deepmerge-ts/mysql2; requieren revisión antes de desplegar. No se aplicó automáticamente la degradación mayor propuesta por npm audit fix --force.
- Dos pruebas HTTP con sesiones reales: superusuario y administrador. Verificaron contraseñas incorrectas, guardado, identidad del creador, fechas inválidas, lectura posterior, denegación sin sesión, cierre de sesión y bloqueo de usuarios inactivos. Registro público rechazado en prueba adicional.
- Prueba manual en navegador integrado: acceso, creación de plan, recarga conservando el plan y cierre de sesión. La ejecución automatizada de Chromium fue bloqueada por el entorno (MachPortRendezvous); no se declara aprobada esa suite de navegador.
- Asistente de configuración ejecutado con cuentas temporales y contraseñas ocultas. Todos los usuarios, sesiones y planes de prueba fueron retirados. Las cuentas reales quedan a cargo del usuario.

## Verificación de apertura y estructura

24 pruebas unitarias aprobadas, TypeScript, ESLint y compilación de producción correctos. Dos pruebas HTTP adicionales con sesiones reales de ambos roles verifican apertura, planes cerrados editables, persistencia, rechazo de relaciones con otro plan, confirmación obligatoria, detección de cambios concurrentes y cascada de dependencias. Los registros temporales se retiran al terminar.

## Corrección de jerarquía

La migración `202609300001_actions_under_dimensions` copia a cada acción la dimensión de su antigua gestión antes de retirar la relación y tabla intermedias. Conserva los identificadores y campos de acciones, hitos y comentarios. La migración inicial se mantiene intacta.

`node tests/migrations/actions-under-dimensions.mjs` verifica la transferencia de acciones de varias gestiones, conservación de gastos/avances/comentarios y borrado en cascada en un esquema temporal, revertido por completo al terminar. La base local se migró conservando el plan y sus cuatro dimensiones; no había gestiones ni acciones reales.

## Blindaje estructural — Etapa 1

`action-rules` valida estrictamente el contrato estructural en la acción y en cada hito. `actionModel.save` actualiza solamente nombre, peso y posición de hitos existentes; no reescribe su avance desde una lectura previa. En CREATE inicializa el avance en cero. `ActionView` y la serialización de la página excluyen avances.

Las pruebas estructurales verifican rechazo de avances enviados por ambos roles, preservación de avances no nulos al editar, nuevos hitos en cero y una regresión de lectura obsoleta que comprueba la ausencia del campo en UPDATE. No se ha creado el módulo de seguimiento.

Verificación de esta etapa: 41 pruebas unitarias, TypeScript, ESLint y dos pruebas HTTP de estructura (ambos roles) aprobadas. `npm run build` quedó bloqueado por el puerto interno de Turbopack en el entorno; `npm run build -- --webpack` compiló correctamente sin modificar la configuración. Las pruebas HTTP retiraron únicamente sus registros temporales.

## Etapa 2: revisiones e historial — solo datos

La migración aditiva `202609300002_plan_reviews` agrega cinco modelos Prisma y dos enums, FK restrictivas, índices y guards SQL de integridad. No se cambia la arquitectura MVC ni se exponen operaciones de seguimiento. Ver `docs/SEGUIMIENTO-DATOS.md` para campos, restricciones, locks, identidad de transacción del snapshot y orden exigido para las futuras transacciones.

`npm run test:integrity` ejecuta la nueva suite SQL en un esquema aislado. La generación del cliente Prisma no modifica la BD.

## Etapa 3: operaciones autenticadas de Seguimiento

Implementadas las operaciones de servidor para iniciar, consultar, guardar, corregir, confirmar y finalizar revisiones y consultar su historial. Mantienen el contrato SQL de Etapa 2. Ver `docs/SEGUIMIENTO-SERVIDOR.md` para contratos, concurrencia y comandos de pruebas aisladas. La UI de reunión y el Dashboard siguen pendientes.


## Etapa 4: interfaz de Seguimiento

Implementada la vista de reunión por dimensión y acción, guardado explícito, correcciones por rol, protección de borradores, historial y finalización. Ver `docs/SEGUIMIENTO-UI.md` para rutas, comportamiento y pruebas. Dashboard continúa pendiente; no se calculan avances agregados de dimensión ni plan.


## Dashboard institucional

`app/planes/[id]/dashboard/page.tsx` → `controllers/dashboard-controller.ts` → `models/dashboard.ts` → `models/dashboard-rules.ts` → `views/dashboard/DashboardView.tsx`. Lectura coherente RepeatableRead, selección mínima de campos y pertenencia de revisión al plan. La lógica ponderada es pura y reutilizable; reutiliza calculateAchievement para acciones. Vista SSR, controles HTML y barras nativas, sin dependencias nuevas.
