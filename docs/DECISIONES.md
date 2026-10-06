# Decisiones funcionales y técnicas vigentes

Estas decisiones reemplazan las del prototipo anterior. Aprobadas en conversación con el usuario.

## Arquitectura y tecnologías

MVC con Next.js, React y TypeScript. Vistas en `views/`, controladores en `controllers/` y datos/reglas en `models/`. `app/` contiene rutas y adaptadores de Next.js. PostgreSQL y Prisma para persistencia. Tailwind y shadcn/ui para interfaz, Better Auth para autenticación, Zod para validaciones, ExcelJS para archivos XLSX, Vitest y Playwright para pruebas.

## Estructura configurable

Plan → Dimensión → Acción → Hito. Cada acción pertenece directamente a una dimensión; no existe el nivel intermedio «Gestión». Ningún nivel tiene una cantidad fija. Una acción requiere al menos un hito. Las antiguas cuatro dimensiones fijas ya no aplican. Tampoco se impone un período de cuatro años: es contexto institucional, no una restricción.

## Datos y acceso

Un superusuario y un administrador inicial. Ambos administran planes, estructura, avances y gastos. Solo el superusuario administra usuarios y corrige excepcionalmente avances hacia abajo. El responsable de la acción es texto, no una cuenta de acceso. Las cuentas inactivas no tienen acceso.

Cada acción tiene descripción, responsable, inicio, fecha límite y gasto real opcional. Los hitos tienen nombre, peso, avance y comentarios. Los gastos se expresan inicialmente en CLP. No se incluye subvención ni presupuesto proyectado, que pertenecían a ideas anteriores.

## Pesos y logro

Solo los hitos tienen pesos. Deben sumar 100% al confirmar una edición. El logro de una acción es la suma de peso × avance / 100. Cambiar pesos, agregar o quitar hitos recalcula el resultado, incluso si disminuye. La actualización normal del avance de un hito no puede disminuirlo. La corrección excepcional es exclusiva del superusuario.

Los porcentajes se representan internamente en centésimas de porcentaje (10000 = 100%), con validación entera para evitar errores de suma. La interfaz mostrará porcentajes normales. El logro es derivado, no editable; el redondeo se realiza para mostrarlo.

No hay fórmula aprobada para avance de dimensión o plan: no implementar promedios ni pesos adicionales.

## Edición, cierre y reutilización

Todo plan sigue editable al marcarlo CERRADO. El cierre permite exportar los datos del momento; el archivo conserva ese resultado aunque el plan cambie después. La Etapa 2 incorpora la base de datos para revisiones y eventos de seguimiento. No existe aún su flujo operativo ni gráficos temporales. Las fechas de actualización y el contador de concurrencia no sustituyen ese historial.

Duplicar conserva contenido, estado, fechas, responsables, gastos, pesos, avances y comentarios; genera nuevos identificadores y nuevas fechas técnicas de creación/actualización. La copia es independiente. La autoría original de comentarios se conserva.

## Eliminación

Antes de borrar se debe mostrar un resumen de los elementos dependientes y solicitar confirmación explícita. Las claves foráneas en cascada eliminan la jerarquía dependiente. El controlador debe comprobar permisos y confirmación antes de ejecutar el borrado. Las dimensiones ya permiten eliminación mediante una acción de servidor autenticada. Se comprueba nuevamente el contenido en una transacción serializable: si cambió después del resumen, se requiere revisar un nuevo resumen.

## Excel y reuniones

Importación y exportación XLSX con plantilla propia y datos ficticios para pruebas. Validar antes de importar. La vista de reuniones prioriza el logro por acción y los avances de hitos.

## Separación de estructura y seguimiento — Etapa 1

La edición estructural rechaza campos ajenos a su contrato, incluidos `progressBps` y la antigua bandera `correctProgress`. Los UPDATE de hitos existentes omiten por completo `progressBps`; los hitos nuevos se crean con cero. La vista estructural no recibe ni permite editar avances. Las reglas de pesos, pertenencia, transacciones y concurrencia se mantienen.

El usuario aprobó un futuro módulo de seguimiento con snapshots independientes de la estructura y sin bloquear su edición durante revisiones abiertas. Esa aprobación sustituye la exclusión de historial indicada anteriormente; en esta etapa no se implementan revisiones, eventos ni migraciones de seguimiento.

## Seguimiento aprobado — Etapa 2 de datos

Se implementaron PlanReview, ReviewDimension, ReviewAction, ReviewMilestone y ProgressEvent. Snapshots históricos inmutables en sus datos estructurales; origen sin FK; sin copia de comentarios. Una revisión abierta por plan, múltiples finalizadas y períodos libres. Una revisión finalizada no se reabre ni modifica. Planes con historial no se borran físicamente.

Estructura sigue editable durante revisiones abiertas. Nuevas revisiones capturan la estructura vigente. Si un hito original fue eliminado, no se permite registrar un nuevo avance del hito histórico: se rechaza todo el guardado atómico. Conflictos entre avance vigente y revisión se rechazan, sin sobrescribir. Se conserva solo la última confirmación sin cambios de cada acción. Correcciones exclusivas de superusuario, con confirmación y motivo.

Esta entrega implementa solamente las tablas y restricciones. El flujo autenticado, inicio/finalización, advertencia de pendientes y UI quedan para una etapa posterior. El contrato SQL y el ajuste técnico de identidad de transacción se describen en `docs/SEGUIMIENTO-DATOS.md`.

## Seguimiento operativo — Etapa 3

Implementadas las operaciones de servidor para iniciar, consultar, guardar, corregir, confirmar y finalizar revisiones y consultar su historial. Mantienen el contrato SQL de Etapa 2. Ver `docs/SEGUIMIENTO-SERVIDOR.md` para contratos, concurrencia y comandos de pruebas aisladas. La UI de reunión y el Dashboard siguen pendientes.


## Etapa 4: interfaz de Seguimiento

Implementada la vista de reunión por dimensión y acción, guardado explícito, correcciones por rol, protección de borradores, historial y finalización. Ver `docs/SEGUIMIENTO-UI.md` para rutas, comportamiento y pruebas. Dashboard continúa pendiente; no se calculan avances agregados de dimensión ni plan.


## Dashboard institucional — autorización vigente

Esta etapa sustituye la restricción previa de pesos solo en hitos y la ausencia de fórmulas agregadas. Se reutilizan los pesos jerárquicos y snapshots existentes: acción = suma(peso hito × avance); dimensión = suma(peso acción × logro acción); plan = suma(peso dimensión × logro dimensión), normalizando BPS en cada nivel y redondeando solo para presentar.

Dashboard por plan en `/planes/[id]/dashboard`; por defecto estructura/avances vigentes. `?reviewId=...` selecciona exclusivamente los datos de esa revisión, incluso sus gastos, sin mezclar pesos actuales. Ambos roles activos tienen acceso. No se escriben datos desde Dashboard.

Estructura vacía o pesos incompletos se muestran como no calculables, sin asignar cero ni redistribuir pesos. Estado de acciones/hitos se basa en avance registrado, sin inventar umbrales de riesgo o retrasos. Gastos sumados exactamente, separados por moneda y distinguiendo ausentes de cero; no hay presupuesto planificado.

### Cierre de Dashboard

Evolución de todas las revisiones ordenada por creación (separación uniforme); las abiertas se identifican como provisionales. Cada punto usa su snapshot, los no calculables interrumpen la línea y la variación compara únicamente las dos últimas revisiones adyacentes. La selección histórica no filtra la serie. Comparación de dimensiones con escala 0–100 y acceso al detalle; valores y alternativas textuales siempre visibles. Referencias conceptuales de comparación y consulta: [OECD Education GPS](https://gpseducation.oecd.org/) y [World Bank EdStats](https://databankfiles.worldbank.org/public/ddpext_download/topic-dashboards/education.html).
