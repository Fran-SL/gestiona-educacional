# Seguimiento — Etapa 4

La navegación del plan separa Estructura y Estado de avance. Dashboard permanece oculto.

## Rutas y arquitectura

- `/planes/[id]/seguimiento`: carga las revisiones; dirige a la abierta cuando existe.
- `/planes/[id]/seguimiento/[reviewId]`: consulta una revisión del plan.
- `load.ts` autentica y carga mediante los controladores existentes. Las vistas llaman a las Server Actions de Etapa 3. No cambia el contrato ni la base de datos.

## Uso

Iniciar una revisión con nombre y período. Elegir dimensión/acción a la izquierda; revisar una acción a la derecha. Anterior/Siguiente conserva el orden. En móvil, el selector se despliega mediante un botón.

Editar porcentajes de los hitos y guardar la acción completa, sin autosave. Se distingue el resultado propuesto del guardado. Sin cambios se ofrece Confirmar revisión sin cambios. La respuesta del servidor actualiza valores, estados y cantidades conservando la selección.

El administrador no puede disminuir avances: recibe advertencia inmediata y puede restaurar el valor. El superusuario confirma cada disminución con motivo individual; editar motivo o porcentaje invalida esa confirmación. El servidor conserva la autoridad y atomicidad del lote.

Las acciones con hitos de origen no disponible muestran Acción no actualizable y los afectados; todo el detalle histórico permanece en lectura, sin cambiar su estado pendiente/revisado.

La navegación interna de acciones, dimensiones, revisiones, secciones y Anterior/Siguiente pide guardar, descartar o seguir editando cuando hay borrador. Abandonar/recargar el documento activa la advertencia nativa. La selección de acción es local; la revisión sí está en la URL.

Historial se consulta bajo demanda, con usuario, fecha, tipo, hito, valores y motivo. La última confirmación aparece aparte.

Finalizar muestra cantidades revisadas/pendientes y exige aceptación explícita si existen pendientes. Un conflicto recarga el resumen y descarta la confirmación previa. También se protegen ediciones realizadas después de abrir el panel de cierre. Una revisión finalizada queda en lectura, sin Reabrir.

## Verificación

`npm run test:tracking:components` cubre los componentes en jsdom. `npm run test:tracking:ui` cubre seis escenarios de navegador con datos ficticios en esquema aislado; requiere Chromium ejecutable. `npm run test:tracking:http` usa las rutas reales y mantiene las regresiones previas.

No se modifica ActionForm ni DimensionActions para incluir seguimiento. No hay avance agregado de dimensión/plan, Dashboard ni cambios de esquema/migraciones.
