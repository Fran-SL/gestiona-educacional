# Gestión Educacional

Aplicación MVC para planes configurables: Plan → Dimensión → Gestión → Acción → Hito.

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

Inicio de sesión y creación/listado de planes conectados a PostgreSQL. Incluye separación MVC, reglas de hitos y pruebas. La edición completa de la jerarquía y las funciones de Excel se implementarán después.

Consultar `docs/DECISIONES.md` y `docs/ARQUITECTURA.md`.

## Base local configurada

La instalación de este computador utiliza PostgreSQL 18 en `127.0.0.1:5432`, base `gestion_educacional` y usuario dedicado `gestion_educacional_app`. La conexión está en `.env`, excluido de Git y con permisos privados. No reemplazar ese archivo siguiendo el ejemplo de preparación si ya existe.

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
npm run test:e2e -- auth-plans-api.spec.ts
```

Estas pruebas crean datos ficticios temporales y los retiran; usar una base de desarrollo. La suite completa de navegador requiere Chromium de Playwright y un entorno que permita ejecutarlo. Las pruebas respetan el límite de intentos de Better Auth. No ejecutarlas mientras se inicializan las cuentas reales.

## Revisión de cambios en Codex

El estado actual del proyecto tiene una base guardada en Git local. Los próximos cambios se dejan sin confirmar para poder compararlos y revisarlos antes de incorporarlos al historial.

En el panel de revisión, seleccionar los cambios sin confirmar (Unstaged) o los del último turno (Last turn). Abrir el archivo, situar el cursor sobre una línea del diff y usar el botón + para escribir una corrección. Después enviar al chat una indicación como «Aplica mis comentarios».

Durante el desarrollo se abrirá el panel de revisión al terminar cada conjunto de cambios. No se crearán nuevos commits automáticamente antes de que el usuario pueda revisar esos cambios.

Perfecto probando

Documentación oficial: https://learn.chatgpt.com/docs/code-review?surface=app
