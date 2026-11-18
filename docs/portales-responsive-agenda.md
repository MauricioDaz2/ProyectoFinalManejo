# Portales R006/R004: diseño responsive y agenda

Entrega del 16 de noviembre de 2026, sobre `feature/redisenio-pagina`. Se conservaron las sesiones, las URLs de ambos portales y los cambios locales anteriores. No se ejecutaron migraciones ni se insertaron datos de prueba permanentes. No se modificó `.env` ni se hicieron commits, merges o push.

## Diseño implementado

La plantilla compartida conserva los servicios existentes y aproxima la distribución del mockup: cabecera horizontal, logo y nombre comercial, perfil del trabajador separado de la cooperativa, navegación, banner panorámico, tarjeta del viaje, progreso, preparación, estado operativo y acciones.

Se utilizan exclusivamente el logotipo, portada y colores publicados por cada empresa. Los iconos son un recurso SVG de interfaz, no imágenes de una cooperativa inventada. Sin portada o logo se conserva un espacio neutro. El logo usa `contain` y la portada `cover` centrado. Los colores publicados también determinan el contraste del texto en los botones y encabezados.

El CSS parte de una columna para celular. Los tamaños a comprobar son:

| Ancho | Distribución prevista |
| --- | --- |
| 360 y 390 px | Tarjetas verticales; botones táctiles; selector de ancho completo; tablas convertidas en fichas con etiquetas; navegación visible y botón Más opciones. |
| 768 px | Cabecera horizontal, tarjeta del viaje en dos columnas, agenda en dos columnas y acciones agrupadas. |
| 1024 px | Tarjeta del viaje en tres zonas; preparación y estado operativo lado a lado; navegación completa que puede ocupar más de una fila. |
| 1440 px | Composición amplia cercana al mockup, cuatro indicadores operativos en una fila y agenda en tres columnas. |

No hay una segunda aplicación móvil ni navegación que dependa únicamente de descubrir un desplazamiento horizontal. La comprobación visual de estos anchos sigue pendiente porque la herramienta de navegador no pudo conectar su canal nativo. Los tests de DOM no prueban geometría ni sustituyen esa revisión.

## Funciones de los portales

R006 conserva sus viajes asignados, preparación, inicio, llegada, continuación, finalización, novedades, ocupación, historial y perfil. R004 comparte el lenguaje visual y conserva pasajeros, QR, código manual, abordajes, descensos, ocupación, operaciones e historial; no recibe botones de conducción ni autorización para esas acciones.

Mi jornada muestra salida y llegada previstas, bus, compañero asignado, progreso, parada actual, próxima parada e inicio real. El estado operativo distingue boletos validados, asientos comprometidos y conexión verificada. R004 también consulta boletos previstos, abordajes vigentes y descensos a partir de los registros del servidor.

Mi agenda agrupa los próximos viajes programados por fecha, con horario, ruta, bus, compañero y estado. Las salidas todavía programadas cuya hora ya pasó se avisan para su revisión en Mi jornada. Los viajes cerrados permanecen en Historial y las compras personales siguen en el módulo de pasajeros.

| Estado real | Acción del chofer |
| --- | --- |
| Programado | Preparación e Iniciar viaje, solo si los controles obligatorios están completos. |
| En curso / tránsito | Registrar llegada al detenerse en la siguiente parada. |
| En curso / detenido en parada intermedia | Continuar recorrido. |
| Detenido en el destino | Finalizar viaje. |
| Cerrado | Consulta del recorrido e historial; acciones operativas deshabilitadas. |

El inicio comprueba nuevamente agenda, personal, cooperativa, bus, vigencia de frecuencia, horario y consistencia de los boletos. No exige vender todos los asientos ni abordar a todos los pasajeros. Se mantiene el modelo de estados existente; no se creó otro estado SQL para “Detenido en parada”.

Antes de una operación manual R006 debe confirmar que el vehículo está detenido. El backend exige esa confirmación. Es una declaración del trabajador: el proyecto no dispone de GPS o telemetría para medir si el bus se mueve.

Las transacciones, eventos con UUID y restricciones previas siguen evitando inicios, abordajes o descensos duplicados. Las cuentas y cooperativas inactivas se rechazan mediante las comprobaciones existentes de sesión. Un R004/R006 continúa limitado a sus hojas asignadas.

## Horarios laborales y reservas personales

El servicio nuevo `workerSchedule.js` comparte las reglas entre reservas y asignaciones. No almacena otro calendario ni crea tablas.

- Los intervalos se comparan como `[salida, llegada)`. Si una actividad termina exactamente cuando empieza otra, no hay solapamiento; también se comprueban recorridos que cruzan medianoche.
- Una reserva personal R004/R006 se rechaza cuando se cruza con una asignación laboral pendiente o en curso. La consulta del catálogo y de boletos permanece disponible.
- Al programar una salida se verifican las reservas personales del chofer y del controlador. Se consideran los boletos no cancelados, incluidos los pendientes, para evitar que confirmar después una reserva ya existente produzca un conflicto.
- También se repite la comprobación al iniciar la salida. Un viaje en curso que ya superó su llegada prevista exige revisar su finalización antes de confirmar otro horario futuro.
- Cuando falta salida o llegada de un viaje relevante, se devuelve un conflicto explicando que no es posible comprobar el horario. No se interpreta una hora ausente como tiempo libre.
- Las operaciones comparten bloqueos `sys.sp_getapplock` por trabajador, con propietario de transacción y adquisición en orden estable. El bloqueo se conserva hasta commit o rollback para impedir que una reserva y una asignación incompatibles se confirmen simultáneamente.
- La venta de ventanilla recibió una llamada a la misma regla cuando el pasajero identificado es R004/R006. Sus precios, formularios y demás lógica no se reconstruyeron.

La cuenta mantiene su rol laboral. Viajar como pasajero y Volver a mi trabajo siguen usando las páginas de catálogo, asientos e historial existentes. Los identificadores del titular se verifican contra la sesión; consultar o cancelar un boleto ajeno sigue prohibido. La regla utiliza el titular personal registrado en `ID_USU_FIN`, conforme al contrato actual de reservas.

## Programar una salida desde R002

En la pantalla existente **Rutas y frecuencias** se añadió el desplegable **Programar salida con chofer y controlador**. Solo aparece para R002 con permiso `rutas` o responsable principal.

Las opciones se obtienen desde `/api/operacion/asignaciones/opciones`: buses activos, frecuencias habilitadas y trabajadores activos de la propia cooperativa. Se muestran únicamente los datos necesarios para seleccionar las asignaciones. El guardado usa el endpoint existente `/api/coop/hojas-ruta`, adaptado al servicio de programación que ya utilizaba R001.

Se requieren bus, frecuencia, ambos trabajadores, salida y llegada. El formulario convierte Ecuador continental (UTC−5) a UTC. El backend verifica cooperativa, roles, estado, vigencia y conflictos; no confía en los filtros de la pantalla.

El formulario de Hojas de Ruta de R001 conserva su funcionamiento. Se impide que las rutas antiguas de edición de R002 alteren una hoja operativa o cerrada al margen de sus verificaciones e historial. No se añadió un módulo de reprogramación ni se modifican automáticamente asignaciones antiguas.

## QR, ocupación y ventas

Se conserva `Html5Qrcode`, la entrada manual y el mismo endpoint de eventos. La biblioteca de cámara carga sin bloquear la interfaz. Se mantienen los mensajes de permisos y errores, el botón Apagar cámara y el cierre al cambiar de sección o salir. También se controla que una solicitud de permiso tardía no deje la cámara abierta después de abandonar la sección.

El backend comprueba viaje asignado, boleto registrado, estado, tramo, parada y uso previo. R004 no puede abordar pasajeros mientras el recorrido figura en tránsito. El formato existente del QR se conserva. La cámara física no fue probada; los tests utilizan una cámara simulada.

La consulta por tramos calcula capacidad, compromisos y asientos libres a partir de los boletos y paradas reales. Un mismo asiento en dos tramos consecutivos no cuenta como duplicado. Si los contratos se solapan en el mismo asiento, faltan asientos o el tramo no pertenece al recorrido, no se muestran cupos calculados como confiables. Los descensos no cambian los contratos ni liberan anticipadamente un asiento.

**La venta a bordo sigue bloqueada.** No existe una tabla de tarifas por tramo en la base consultada ni un inventario por segmentos compartido con todas las vías de venta. La consulta de disponibilidad no equivale a autorización para revender. No se confirmaron ni simularon pagos, vuelto o asignaciones automáticas de asientos. El formulario y el backend explican la dependencia.

Los boletos históricos asociados al controlador siguen mostrando sus importes registrados. No se convierten en un supuesto total de caja: la columna antigua del controlador no distingue de forma fiable vendedor y validador.

## Conexión y datos desactualizados

El indicador muestra Actualizado después de consultar el servidor, Sin verificar cuando falla y Sin conexión cuando el navegador pierde red. No se presenta una simple conexión de red como sincronización confirmada.

Los datos descargados pueden mantenerse en memoria con aviso de desactualización. Los indicadores de ocupación/validación y cupos no se anuncian como confirmados durante la desconexión. No hay ventas ni QR definitivos offline, almacenamiento persistente de pasajeros ni cola de novedades simulada.

## SQL comprobado y scripts

La conexión inicial falló. Una comprobación posterior sí accedió a SQL Server y confirmó:

- `ID_USU_CHO`, `SALIDA_PLAN_UTC`, `LLEGADA_PLAN_UTC`, `HOJA_EVENTOS` y `FRECUENCIA_PARADAS` instalados; el servicio detecta completa la estructura operativa.
- `CED_PAS_BOL` y `TIP_PAS_BOL` instalados en BOLETOS.
- Cero filas en HOJAS_RUTAS y BOLETOS en ese momento.
- Sin tablas identificadas de tarifas, precios o pagos. En las opciones de la cooperativa consultada no había buses ni frecuencias disponibles y sí personal.

**No hay una migración nueva que ejecutar para esta entrega.** Se reutiliza 010 y el script de pasajeros ya instalados. Los bloqueos de agenda son una función de SQL Server, no una nueva tabla.

No se insertaron usuarios, viajes ni boletos para llenar las pantallas. Para probar el recorrido completo es necesario configurar un bus con asientos y una frecuencia real de la cooperativa, y programar una salida con ambos trabajadores activos.

## Pruebas realizadas

- Suite completa: **144 pruebas aprobadas, 0 fallidas**, en 21 archivos.
- Sintaxis: 103 archivos JavaScript revisados.
- Regresiones existentes: login y sesiones por rol, cooperativas, personalización, permisos, perfiles y reservas.
- Pruebas nuevas/ampliadas: cruces de horario en ambos sentidos, información incompleta, intervalos consecutivos y nocturnos, carrera entre reserva y asignación, bloqueos ordenados, vigencia de frecuencias, confirmación de vehículo detenido, estados contextuales, agenda, menú Más, reservas propias, QR, ocupación por tramos y conversión UTC del formulario R002.
- SQL real: detección del esquema, jornadas R004/R006 vacías, opciones de asignación de la cooperativa y consultas de conflictos. Se comprobó que dos transacciones sobre el mismo bloqueo de agenda se serializan y que el bloqueo se libera al revertirlas. Estas transacciones no escribieron filas.
- Las operaciones de viaje, las reservas concurrentes y los conflictos con datos se probaron mediante persistencia aislada simulada. No se afirma haber ejecutado viajes o compras reales en SQL Server.
- Navegador no disponible: queda pendiente comprobar geometría en 360/390/768/1024/1440 px y permisos/lectura con cámara física.

Ejecutar los tests desde la raíz:

```powershell
node --test tests/*.test.cjs
```

## URLs y prueba manual

Arrancar el backend desde la raíz con `node backend/src/server.js`. Con puerto 3000:

- Login: `http://localhost:3000/src/views/auth/login.html`
- Chofer: `http://localhost:3000/src/views/chofer/bienvenida.html`
- Controlador: `http://localhost:3000/src/views/controlador/panel.html`
- Programación R002: `http://localhost:3000/src/views/cooperativa/resoluciones_ant.html#frecuencias`
- Hojas de Ruta R001: `http://localhost:3000/src/views/admin/hojas_ruta.html`

También se pueden abrir los HTML con Live Server en 5500/5501 desde la raíz: `/frontend/src/views/...`. Mantener localhost o 127.0.0.1 de forma consistente. La cámara necesita HTTPS o localhost; el acceso por IP desde otro dispositivo requiere un origen autorizado y configuración de despliegue, que esta entrega no cambió.

1. Crear o reutilizar un bus activo con asientos, una frecuencia vigente y R006/R004 activos de la misma empresa. R002 puede seleccionar los trabajadores sin recibir acceso general a otras cooperativas.
2. Programar una salida con horario completo. Entrar en dos perfiles de navegador distintos para consultar el mismo viaje como chofer y controlador. Otra cooperativa no debe verlo.
3. Comprobar la identidad publicada y los cinco anchos indicados. Abrir Más en móvil, Mi agenda, Mi perfil y el selector; revisar que tablas y botones se adapten.
4. Antes de iniciar, Llegada/Continuar/Finalizar deben estar deshabilitados. Iniciar requiere preparación válida y confirmación de vehículo detenido. Durante el recorrido, registrar las paradas en orden y finalizar solo al alcanzar el destino.
5. Probar QR y código manual con boletos confirmados del módulo existente, incluidos cancelados, repetidos y de otro viaje. Registrar descenso en una parada autorizada y verificar que el contrato del asiento no se libera.
6. Probar una reserva personal dentro del horario laboral: debe rechazarse. Probar otra después de la llegada: debe permitirse si los demás requisitos del módulo se cumplen. Intentar asignar un viaje laboral sobre una reserva personal existente: también debe rechazarse.
7. Revisar los historiales separados, novedades, sesiones inactivas y el regreso desde Viajar como pasajero. Un viaje finalizado debe conservar su información sin permitir operaciones normales nuevas.
8. Cortar la conexión con un viaje cargado: deben aparecer avisos y cifras sin confirmar. No se deben registrar validaciones ni ventas definitivas. Al volver, Actualizar consulta el servidor.
9. Confirmar que Venta a bordo siga explicando la dependencia de tarifas e inventario; no realizar cobros por esa pantalla hasta integrar esos módulos.

## Archivos de esta entrega

Nuevos:

- `backend/src/services/workerSchedule.js`
- `frontend/src/js/coop_asignacion.js`
- `frontend/src/assets/worker_icons.svg`
- `tests/worker-schedule.test.cjs`
- `tests/coop-assignment-ui.test.cjs`
- `docs/portales-responsive-agenda.md`

Modificados:

- `frontend/src/components/portal_operativo.html`
- `frontend/src/assets/chofer_bienvenida.css`
- `frontend/src/js/chofer_bienvenida.js`
- `frontend/src/views/controlador/panel.html`
- `frontend/src/views/cooperativa/resoluciones_ant.html`
- `backend/src/services/tripOperations.js`
- `backend/src/services/tripRules.js`
- `backend/src/controllers/userReservaController.js`
- `backend/src/controllers/oficinistaBoletoController.js`
- `backend/src/controllers/coopBusController.js`
- `backend/src/routes/tripOperationRoutes.js`
- `backend/src/routes/coopBusRoutes.js`
- `tests/trip-operations.test.cjs`
- `tests/trip-rules.test.cjs`
- `tests/worker-passenger.test.cjs`
- `tests/worker-portal-ui.test.cjs`
- `docs/portales-chofer-controlador.md` (enlace al estado actualizado).

Los demás cambios que muestra Git pertenecen a etapas anteriores y se conservaron.
