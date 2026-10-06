# Gestión Educacional

Aplicación MVC para planes configurables: Plan → Dimensión → Acción → Hito.

## Requisitos

Node.js 24 LTS, npm y PostgreSQL. Usar `nvm use` si está disponible.

## Preparación

```sh
npm ci
cp .env.example .env
# Editar DATABASE_URL con la conexión a una base propia.
npm run db:generate
npm run db:deploy
npm run dev
```

`db:deploy` aplica migraciones a la base configurada: revisar DATABASE_URL antes de ejecutarlo. No se incluyen usuarios, contraseñas reales ni datos institucionales.

## Verificación

```sh
npm test
npm run db:validate
npm run typecheck
npm run lint
```

La generación y validación del esquema no crean una base ni prueban la conexión. Para los cambios futuros del esquema, usar `npm run db:migrate -- --name descripcion` sobre una base de desarrollo.

## Estado

Inicio de sesión, creación/listado y apertura de planes conectados a PostgreSQL. Cada plan permite crear, editar y eliminar dimensiones, con resumen y confirmación del contenido dependiente antes de borrar. Los planes cerrados siguen admitiendo estos cambios. La estructura incluye acciones e hitos. La capa de datos de revisiones e historial está implementada; su interfaz y operaciones de seguimiento, el Dashboard y las funciones de Excel están pendientes.

Consultar `docs/DECISIONES.md` y `docs/ARQUITECTURA.md`.

## Base local configurada

La instalación de este computador utiliza PostgreSQL 18 en `127.0.0.1:5432`, base `gestion_educacional` y un usuario dedicado configurado en `.env`. La conexión está en `.env`, excluido de Git y con permisos privados. No reemplazar ese archivo siguiendo el ejemplo de preparación si ya existe.

La migración inicial ya fue aplicada. Para comprobar el estado ejecutar `npx prisma migrate status`. El listado y la creación de planes ya utilizan autenticación y persistencia.

## Crear las cuentas iniciales

En una terminal situada en este proyecto:

```sh
nvm use
npm run setup:users
```

El asistente pide nombre, correo y contraseña para superusuario y administrador. Cada correo debe ser distinto. Contraseñas de 12 a 128 caracteres, ocultas al escribir. No enviarlas al chat. Solo funciona si no hay cuentas y no sobrescribe usuarios. Después abrir http://localhost:3000/login con el servidor en ejecución.

`BETTER_AUTH_SECRET` debe ser aleatorio y privado (mínimo 32 caracteres). `BETTER_AUTH_URL` es `http://localhost:3000` en esta instalación. No hay registro público ni recuperación de contraseña por correo todavía.

## Pruebas del servidor

```sh
npm run build
npm run test:e2e -- auth-plans-api.spec.ts plan-structure-api.spec.ts
```

Estas pruebas crean datos ficticios temporales y los retiran; usar una base de desarrollo. La suite completa de navegador requiere Chromium de Playwright y un entorno que permita ejecutarlo. Las pruebas respetan el límite de intentos de Better Auth. No ejecutarlas mientras se inicializan las cuentas reales.

## Revisión de cambios en Codex

El estado actual del proyecto tiene una base guardada en Git local. Los próximos cambios se dejan sin confirmar para poder compararlos y revisarlos antes de incorporarlos al historial.

En el panel de revisión, seleccionar los cambios sin confirmar (Unstaged) o los del último turno (Last turn). Abrir el archivo, situar el cursor sobre una línea del diff y usar el botón + para escribir una corrección. Después enviar al chat una indicación como «Aplica mis comentarios».

Durante el desarrollo se abrirá el panel de revisión al terminar cada conjunto de cambios. No se crearán nuevos commits automáticamente antes de que el usuario pueda revisar esos cambios.

Perfecto probando

Documentación oficial: https://learn.chatgpt.com/docs/code-review?surface=app

## Integridad de revisiones (Etapa 2)

Consultar `docs/SEGUIMIENTO-DATOS.md`. Ejecutar `npm run test:integrity` para verificar restricciones SQL con datos ficticios en un esquema temporal independiente. Requiere PostgreSQL y permiso para crear/eliminar ese esquema de prueba; no escribe datos institucionales. No hay todavía interfaz ni controllers de seguimiento.

## Operaciones de Seguimiento

Implementadas las operaciones de servidor para iniciar, consultar, guardar, corregir, confirmar y finalizar revisiones y consultar su historial. Mantienen el contrato SQL de Etapa 2. Ver `docs/SEGUIMIENTO-SERVIDOR.md` para contratos, concurrencia y comandos de pruebas aisladas. La UI de reunión y el Dashboard siguen pendientes.


## Etapa 4: interfaz de Seguimiento

Implementada la vista de reunión por dimensión y acción, guardado explícito, correcciones por rol, protección de borradores, historial y finalización. Ver `docs/SEGUIMIENTO-UI.md` para rutas, comportamiento y pruebas. Dashboard continúa pendiente; no se calculan avances agregados de dimensión ni plan.
