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

Pendientes: administración posterior de usuarios, recuperación de contraseña, edición de planes y jerarquía, duplicación, cierre/exportación e importación.

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
