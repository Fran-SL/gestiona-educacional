# Decisiones funcionales y técnicas vigentes

Estas decisiones reemplazan las del prototipo anterior. Aprobadas en conversación con el usuario.

## Arquitectura y tecnologías

MVC con Next.js, React y TypeScript. Vistas en `views/`, controladores en `controllers/` y datos/reglas en `models/`. `app/` contiene rutas y adaptadores de Next.js. PostgreSQL y Prisma para persistencia. Tailwind y shadcn/ui para interfaz, Better Auth para autenticación, Zod para validaciones, ExcelJS para archivos XLSX, Vitest y Playwright para pruebas.

## Estructura configurable

Plan → Dimensión → Gestión → Acción → Hito. Ningún nivel tiene una cantidad fija. Una acción requiere al menos un hito. Las antiguas cuatro dimensiones fijas ya no aplican. Tampoco se impone un período de cuatro años: es contexto institucional, no una restricción.

## Datos y acceso

Un superusuario y un administrador inicial. Ambos administran planes, estructura, avances y gastos. Solo el superusuario administra usuarios y corrige excepcionalmente avances hacia abajo. El responsable de la acción es texto, no una cuenta de acceso. Las cuentas inactivas no tienen acceso.

Cada acción tiene descripción, responsable, inicio, fecha límite y gasto real opcional. Los hitos tienen nombre, peso, avance y comentarios. Los gastos se expresan inicialmente en CLP. No se incluye subvención ni presupuesto proyectado, que pertenecían a ideas anteriores.

## Pesos y logro

Solo los hitos tienen pesos. Deben sumar 100% al confirmar una edición. El logro de una acción es la suma de peso × avance / 100. Cambiar pesos, agregar o quitar hitos recalcula el resultado, incluso si disminuye. La actualización normal del avance de un hito no puede disminuirlo. La corrección excepcional es exclusiva del superusuario.

Los porcentajes se representan internamente en centésimas de porcentaje (10000 = 100%), con validación entera para evitar errores de suma. La interfaz mostrará porcentajes normales. El logro es derivado, no editable; el redondeo se realiza para mostrarlo.

No hay fórmula aprobada para avance de gestión, dimensión o plan: no implementar promedios ni pesos adicionales.

## Edición, cierre y reutilización

Todo plan sigue editable al marcarlo CERRADO. El cierre permite exportar los datos del momento; el archivo conserva ese resultado aunque el plan cambie después. No hay historial automático de modificaciones ni gráficos temporales en esta versión. Las fechas de actualización y el contador de concurrencia no son un historial.

Duplicar conserva contenido, estado, fechas, responsables, gastos, pesos, avances y comentarios; genera nuevos identificadores y nuevas fechas técnicas de creación/actualización. La copia es independiente. La autoría original de comentarios se conserva.

## Eliminación

Antes de borrar se debe mostrar un resumen de los elementos dependientes y solicitar confirmación explícita. Las claves foráneas en cascada eliminan la jerarquía dependiente. El controlador debe comprobar permisos y confirmación antes de ejecutar el borrado. No existe todavía un endpoint de eliminación.

## Excel y reuniones

Importación y exportación XLSX con plantilla propia y datos ficticios para pruebas. Validar antes de importar. La vista de reuniones prioriza el logro por acción y los avances de hitos.
