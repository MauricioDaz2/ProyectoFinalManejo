# RFC-000083 · Planificador rotativo «Hoja de ruta y frecuencias» por grupos de 4 buses

## Resumen del cambio

Se agrega al panel de **Cooperativa (`R002`)**, en `frontend/src/views/cooperativa/resoluciones_ant.html`, la pestaña **«Hoja de ruta y frecuencias»**. Permite planificar y visualizar la rotación diaria de un grupo de cuatro buses entre dos salidas (Ambato - Quito y Quito - Ambato, 7:00 am) y dos paradas.

- Módulo: `frontend/src/js/coop_rotacion.js`. La lógica es pura y se expone como `window.CoopRotacion`, y también como `module.exports` para las pruebas.
- Estilos: bloque «RFC-000083» al final de `frontend/src/assets/panel_pages.css`. Incluye bordes visibles, encabezados en negrita y desplazamiento horizontal.
- Sin cambios en la base de datos ni en el backend. No requiere migraciones SQL.

## Funcionamiento

| Acción | Comportamiento |
|---|---|
| Agregar nueva fecha | Sugiere el día siguiente a la última fecha del grupo y agrega una columna vacía. Ordena las fechas cronológicamente y bloquea duplicados en el mismo grupo. Guarda la fecha completa (`YYYY-MM-DD`) y la muestra como `DD/MM`. |
| Grupo | Permite crear, seleccionar y editar grupos de 4 buses distintos, conservando textos como `01`. Cada grupo tiene su propia hoja de ruta. Se precarga el «Grupo 1» con la tabla del 25/11 al 28/11. |
| Generar Bus | Llena solo las columnas vacías. Toma la columna completa anterior más cercana y rota un paso por cada día calendario transcurrido: Parada 2 → Ambato - Quito → Quito - Ambato → Parada 1 → Parada 2. Un grupo sin asignaciones se inicializa en su orden de registro. |
| Guardar | Persiste grupos, fechas y asignaciones en `localStorage` con la clave `coop_rotacion_v1_<ID_COP_PER>` y muestra una confirmación. |

Las asignaciones se guardan como índices de bus (0 a 3) por fila. Así, si se edita el número de un bus, la hoja se actualiza sin perder la rotación.

## Aislamiento multi-cooperativa

La clave de almacenamiento usa el `cooperativaId` (`ID_COP_PER`) de la sesión autenticada. Una cooperativa no ve ni sobrescribe la planificación de otra. Si no hay cooperativa en la sesión, el guardado se rechaza.

## Pruebas

```powershell
node --test
```

`test/rfc-000083-rotacion.test.cjs` cubre:

- La tabla inicial.
- La rotación y las fechas omitidas, incluido el cambio de año.
- La verificación 29/11 → 01, 02, 03, 04.
- La validación de grupos y de fechas duplicadas.
- El aislamiento por cooperativa, los datos corruptos en `localStorage` y el flujo de la interfaz: agregar, generar, guardar y recargar.

## Reversión

Revertir los commits de la rama. No hay cambios de BD. Opcionalmente, eliminar las claves `coop_rotacion_v1_*` del `localStorage` de los navegadores de prueba.
