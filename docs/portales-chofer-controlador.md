# Portales del Chofer R006 y Controlador R004

Este documento conserva la entrega inicial. El estado actualizado, con 010 instalada, diseño responsive y validación de agendas, está en [Portales responsive y agenda](portales-responsive-agenda.md).

## Estado de la entrega

Implementación en `feature/redisenio-pagina`, conservando los cambios locales anteriores. No se ejecutaron migraciones, no se modificó `.env` y no se hicieron commits ni push.

Los portales, permisos, consultas, transiciones, validaciones y auditoría están implementados. Las escrituras operativas necesitan la migración `010_operacion_viajes.sql`; antes de aplicarla, la interfaz indica esa dependencia y el servidor rechaza las operaciones con 503.

La venta a bordo permanece bloqueada. El esquema consultado no tiene tarifas por tramo ni un servicio de ocupación por segmentos compartido con ventanilla y reservas. El formulario no permite introducir precios libres ni confirmar un cobro. No están implementados la asignación automática para ventas por tramo, la reventa de un asiento en tramos distintos ni el registro conjunto de efectivo y vuelto.

## Qué puede hacer cada rol

| Función | R006 | R004 |
| --- | --- | --- |
| Consultar sus viajes, bus, recorrido y preparación | Sí | Sí |
| Iniciar, registrar llegada, continuar y finalizar | Sí | No |
| Consultar lista de boletos y titulares | No | Sí |
| Validar QR o código manual y registrar abordaje | No | Sí |
| Registrar descenso en parada autorizada | No | Sí |
| Consultar ocupación contractual del bus | Sí | Sí |
| Registrar novedades, consultar viajes anteriores y eventos propios | Sí | Sí |
| Consultar boletos históricos asociados a su cuenta de controlador | No | Sí |
| Mi perfil y cierre de sesión existentes | Sí | Sí |
| Viajar como pasajero con la misma cuenta | Sí | Sí |
| Vender a bordo | No | Bloqueado por dependencias |

El encabezado muestra el usuario separado de la cooperativa. Se consulta la identidad pública publicada para logo, portada y colores. El borrador no cambia el portal. Sin imágenes publicadas se mantiene el diseño neutro, sin imágenes ficticias.

R002 puede crear y administrar R006 desde Personal y accesos, con el permiso `trabajadores`. Se conservan los estados activo/inactivo y las verificaciones de la cooperativa. R001 también ve los choferes en la ficha de la empresa. No se añadió eliminación física de trabajadores.

## Código reutilizado e integración

Se mantienen el login general, las cookies de sesión, los controles de origen y rol, `transport_session.js`, el perfil personal y el catálogo/reservas existentes. No se creó otra cuenta R005 ni se cambia el rol al viajar como pasajero.

R004 conserva su URL y la biblioteca de cámara `Html5Qrcode` que utilizaba la página anterior. Su endpoint antiguo de validación se adapta al servicio transaccional compartido. La antigua venta que aceptaba un precio arbitrario devuelve ahora una dependencia explícita. Las consultas antiguas de hojas y asientos continúan disponibles con sus controles de acceso; el nuevo portal utiliza `/api/operacion` para tener la misma información que el chofer.

El módulo de reservas recibió una integración limitada: autoriza R004/R006 para operaciones personales, verifica que exista el esquema de pasajeros, exige una hoja programada y comprueba ocupación dentro de la transacción existente. La tarifa, descuentos y estados de pago del módulo de pasajeros se conservaron; no equivalen a una nueva integración de cobros a bordo. La prueba del método `DEPOSITO` comprueba el comportamiento existente del módulo, no una verificación bancaria.

## Viaje y paradas

Una asignación nueva necesita bus, frecuencia, chofer R006, controlador R004, salida y llegada previstas. Se comprueba que estén activos, que pertenezcan a la misma cooperativa y que no haya cruces de horario del bus o trabajadores. Un viaje pendiente sin horario completo impide asignaciones nuevas incompatibles con esos recursos hasta que se revise su información. Los registros históricos no se rellenan automáticamente.

R001 puede crear la hoja desde su formulario existente, que ahora pide hora de salida y fecha/hora de llegada en Ecuador continental. También existe `POST /api/operacion/asignaciones`, exclusivamente para R001 o R002 con permiso `rutas`. El servidor vuelve a verificar los permisos dentro de la operación. No se creó una segunda pantalla de asignaciones en R002.

Contrato del cuerpo (sustituir todos los identificadores y fechas por datos reales):

```json
{
  "idBus": "<bus>",
  "idFre": "<frecuencia>",
  "idUsuCho": "<chofer>",
  "idUsuCon": "<controlador>",
  "salida": "<fecha y hora ISO en UTC, terminada en Z>",
  "llegada": "<fecha y hora ISO en UTC, terminada en Z>",
  "obs": "<observación opcional, hasta 50 caracteres>"
}
```

Antes de iniciar se verifican capacidad, ruta, horario, ambos trabajadores y consistencia de los boletos con los asientos y tramos. No se exige vender todos los asientos ni que todos los pasajeros hayan abordado.

El estado pasa de `PROGRAMADO` a `EN CURSO` y finalmente `FINALIZADO`. Antes del inicio se admite preparación de abordaje. Durante el viaje el movimiento alterna entre `TRANSITO` y `DETENIDO`: una llegada avanza exactamente una parada; continuar no adelanta la posición. Finalizar exige haber iniciado y estar detenido en el destino. Un viaje cerrado rechaza nuevas modificaciones operativas.

`FRECUENCIA_PARADAS` contiene el recorrido real de una frecuencia: `ID_FRE`, `ORDEN` consecutivo desde cero, `NOMBRE` y `COMERCIAL`. Deben incluirse origen y destino y los nombres deben coincidir con los tramos de los boletos. La migración no inserta paradas. Si no hay configuración, se utilizan únicamente el origen y destino ya registrados en la frecuencia. Al programar se guarda una copia del recorrido en la hoja para que cambios futuros de la frecuencia no alteren ese viaje.

El mantenimiento de paradas comerciales debe integrarse posteriormente con el módulo de frecuencias. No se creó un editor independiente ni se inventaron paradas. La información de un viaje histórico sin horario sigue mostrando que no hay hora registrada.

## QR, pasajeros y auditoría

El controlador selecciona un viaje y activa la cámara o escribe el código. La cámara necesita HTTPS o localhost y permiso del navegador; la biblioteca externa debe poder descargarse. Se detiene después de leer, al cambiar de sección/viaje, al ocultar la página y al salir. Si falla, se ofrece la entrada manual.

Se conservan el contenido `reserva:...`, los códigos `QR-...`, los códigos almacenados mediante URL de qrserver y el identificador manual del boleto. El backend compara contra el registro de SQL, no acepta un boleto solo porque un JSON del QR tenga un ID válido.

La validación exige viaje asignado al controlador, boleto confirmado, tramo correcto, parada comercial y bus detenido. Un boleto cancelado, reservado, ya utilizado o de otro viaje se rechaza. El abordaje actualiza el boleto a `USADO` y registra actor y hora precisa en `HOJA_EVENTOS`. No sobrescribe `BOLETOS.ID_USU_CON`, que puede contener al vendedor anterior.

Cada envío lleva un UUID. La transacción serializable bloquea la hoja y los boletos afectados; los reintentos del mismo evento se reconocen y el índice único impide duplicar abordajes o descensos. Un descenso necesita un abordaje anterior y una parada válida dentro del tramo contratado. Bajar antes del destino no libera el asiento para reventa.

La tabla de pasajeros distingue pendientes, a bordo, descendidos, inválidos y usados antiguos sin registro operativo. Muestra al titular de compra explícitamente, porque el esquema antiguo no identifica por nombre a todos los acompañantes. La cifra de abordajes registrados no presume que todos los boletos comprados estén físicamente a bordo.

Los historiales muestran fechas reales, bus, estados e inicio/fin cuando existen; al consultar un viaje se ven los eventos propios, sus paradas y novedades. Los boletos asociados al controlador muestran importes y métodos almacenados. No se suman como caja: en el sistema antiguo `ID_USU_CON` podía significar vendedor o validador, por lo que no permite atribuir de forma fiable todos los cobros históricos.

## Asientos, tarifas y dependencia de venta

La vista actual considera comprometido un asiento con boleto no cancelado para toda la hoja. Es una consulta conservadora del contrato existente, no disponibilidad definitiva para reventa por tramo. Descontar un pasajero al registrar su descenso no reduce ese compromiso.

Para habilitar la venta a bordo hace falta un contrato compartido con los módulos de rutas y ventas:

1. Tarifa vigente por frecuencia, origen, destino y tipo de pasajero, resuelta desde SQL; `TIPOS_ASIENTOS.PRE_TIP` por sí solo no representa una tarifa por tramo.
2. Comprobación común de solapamiento de segmentos `[origen, destino)` para reservas, ventanilla y controlador, con bloqueo transaccional de los mismos recursos. Dos segmentos consecutivos podrían compartir asiento; dos superpuestos no.
3. Confirmación que asigne asientos, calcule el total en backend, valide efectivo recibido y vuelto, registre todos los boletos en las tablas existentes y conserve un identificador idempotente de cobro.
4. Registro inequívoco del vendedor y fecha/hora, separado de quien valida el QR, incluyendo política para reservas pendientes y vencimientos.

Hasta disponer de ese contrato, tanto la nueva ruta de venta como el endpoint antiguo del controlador rechazan la confirmación. No se incorporaron tablas paralelas de asientos, boletos ni cobros.

## Conectividad

Las consultas se actualizan al volver a la pestaña, recuperar conexión, pulsar Actualizar y cada 30 segundos mientras el portal está visible. Los cambios se confirman en el servidor.

Sin conexión, los datos ya visibles permanecen solamente en memoria y se señalan como desactualizados. No hay validaciones QR ni ventas definitivas offline. No se guardan pasajeros en localStorage/IndexedDB ni se afirma que exista una cola sincronizada. Las novedades locales persistentes quedan pendientes de un almacenamiento protegido, revocación y sincronización que no expongan información de otra sesión. Recargar sin conexión no recupera el viaje.

## SQL pendiente y orden manual

Consulta realizada el 16 de noviembre de 2026, únicamente de lectura: existen R004 y R006; hay dos cuentas R004 y una R006 activas en cooperativas activas. `HOJAS_RUTAS` y `BOLETOS` tienen cero registros. No existe `HOJAS_RUTAS.ID_USU_CHO` y faltan las columnas de pasajeros del módulo de reservas. Las horas de las frecuencias originales son columnas `date`, no horarios utilizables.

Comprobar el rol antes de aplicar nada:

```sql
USE BD_COOPERATIVAS_BUSES;
SELECT ID_ROL, NOM_ROL FROM dbo.ROLES WHERE ID_ROL = 'R006';
```

Orden:

1. `database/scripts/009_rol_chofer.sql`, solamente si R006 falta en esa instalación. El script existente se conserva, no se duplicó. En la base inspeccionada ya está registrado.
2. **`database/scripts/010_operacion_viajes.sql`**, nuevo y pendiente de aprobación/ejecución manual. Añade columnas opcionales a la hoja para chofer, horarios UTC, inicio/fin, posición, movimiento y recorrido; añade `FRECUENCIA_PARADAS` y `HOJA_EVENTOS`, claves foráneas e índices. Usa transacción y no modifica filas históricas ni elimina datos. Puede volver a ejecutarse para objetos ya creados por este script.
3. Para probar reservas personales, revisar y ejecutar en `BD_COOPERATIVAS_BUSES` el script existente **`database/scripts/migracion_pasajeros_facturacion.sql`** si faltan `CED_PAS_BOL` y `TIP_PAS_BOL`. No se duplicó su contenido en 010. Es independiente de la operación de viajes.

Las migraciones de personal y credenciales de etapas anteriores siguen siendo requisito para crear cuentas seguras; no se volvieron a ejecutar. No se preparó una migración inventando tarifas.

Comprobación posterior a la ejecución manual:

```sql
SELECT COL_LENGTH('dbo.HOJAS_RUTAS', 'ID_USU_CHO') AS Chofer,
       COL_LENGTH('dbo.HOJAS_RUTAS', 'SALIDA_PLAN_UTC') AS Salida,
       COL_LENGTH('dbo.HOJAS_RUTAS', 'LLEGADA_PLAN_UTC') AS Llegada,
       COL_LENGTH('dbo.HOJAS_RUTAS', 'INICIO_UTC') AS Inicio,
       COL_LENGTH('dbo.HOJAS_RUTAS', 'FIN_UTC') AS Fin,
       OBJECT_ID('dbo.HOJA_EVENTOS', 'U') AS Eventos,
       OBJECT_ID('dbo.FRECUENCIA_PARADAS', 'U') AS Paradas,
       COL_LENGTH('dbo.BOLETOS', 'CED_PAS_BOL') AS CedulaPasajero,
       COL_LENGTH('dbo.BOLETOS', 'TIP_PAS_BOL') AS TipoPasajero;
```

La migración fue revisada, pero no aplicada ni ensayada contra una copia SQL. Esa comprobación sigue pendiente de autorización.

## Cómo abrir y probar

Desde la raíz del proyecto:

```powershell
node backend/src/server.js
```

El servidor sirve también el frontend. URLs con el puerto habitual 3000:

- Login general: `http://localhost:3000/src/views/auth/login.html`
- Chofer: `http://localhost:3000/src/views/chofer/bienvenida.html`
- Controlador: `http://localhost:3000/src/views/controlador/panel.html`
- Asignación R001: `http://localhost:3000/src/views/admin/hojas_ruta.html`
- Personal R002: `http://localhost:3000/src/views/cooperativa/personal.html`

También pueden abrirse los HTML con Live Server desde la raíz del repositorio en puerto 5500/5501: `/frontend/src/views/...`. Mantener el mismo hostname para frontend y API; el helper de sesión adapta localhost/127.0.0.1. Usar dos perfiles de navegador para tener R006 y R004 conectados simultáneamente. El acceso por IP de un celular no está habilitado automáticamente por la política de origen actual; requiere despliegue/origen autorizado y HTTPS para cámara.

Prueba manual después de aprobar SQL:

1. Crear o reutilizar R006 y R004 activos de la misma cooperativa desde la gestión existente, con contraseñas válidas. No introducir contraseñas en SQL.
2. Verificar un bus activo con asientos reales y una frecuencia habilitada de esa empresa. Crear una hoja con ambos trabajadores y horario completo desde R001. Intentar otra asignación superpuesta: debe rechazarse.
3. Entrar con cada cuenta. Deben aparecer únicamente las hojas asignadas. Abrir una URL administrativa con esos usuarios no debe dar acceso a sus APIs.
4. Revisar logo y colores publicados, perfil personal, menú y cierre de sesión. Probar anchos de 390, 768 y 1280 píxeles: navegación desplazable, botones, formularios y tablas. Esta revisión visual está pendiente.
5. En R006, iniciar, llegar a la siguiente parada, continuar si corresponde y finalizar en destino. Intentar finalizar antes de iniciar y repetir el inicio: debe rechazarse. Sin paradas configuradas, el recorrido solo tiene origen y destino.
6. Con boletos confirmados del sistema existente, probar código manual y QR en R004: válido, repetido, cancelado, otro viaje y otra parada. Probar dos envíos simultáneos del mismo boleto y comprobar un solo abordaje.
7. Registrar descenso en una parada autorizada. El asiento debe conservar su compromiso contractual. No se debe habilitar una venta por haber descendido el pasajero.
8. Registrar una novedad de cada trabajador, revisar historial al finalizar y recargar. Verificar filas de `HOJA_EVENTOS` y horas de `HOJAS_RUTAS` mediante consultas de lectura.
9. Seleccionar Viajar como pasajero, usar el catálogo existente, reservar un asiento y consultar Mis boletos. Volver a mi trabajo conserva el rol. Probar que otra cuenta no pueda consultar ni cancelar ese boleto.
10. Revocar el acceso o desactivar la cuenta desde la administración y verificar que el servidor rechace peticiones nuevas. Cerrar sesión lleva a la portada pública.
11. Desconectar la red con un viaje visible: debe advertir que los datos están desactualizados y no confirmar operaciones. Recuperar conexión y actualizar. No se promete persistencia al recargar offline.
12. En Venta a bordo debe verse la dependencia real y el formulario deshabilitado. No se pueden verificar cobro, vuelto ni reventa por segmentos hasta integrar tarifas e inventario compartido.

## Pruebas y límites de comprobación

- Suite automatizada completa: **136 pruebas aprobadas, 0 fallidas**, en 19 archivos de pruebas. Incluye login de los seis roles y las regresiones existentes de portada, personalización, cooperativas, permisos y sesiones.
- Revisión de sintaxis: 99 archivos JavaScript aprobados. Recursos locales de ambos portales verificados y `git diff --check` sin errores.
- Nuevas pruebas HTTP con persistencia simulada: aislamiento de viajes y cooperativas, autorización, cuentas inactivas, preparación, asignaciones superpuestas, transiciones, concurrencia, idempotencia, QR, abordajes/descensos y rechazo de ventas sin tarifa.
- Pruebas de reglas: viajes directos y con paradas, orden obligatorio, estados y formatos QR existentes.
- Pruebas del módulo real de reservas con SQL simulado: R004/R006/R005 reservan y siguen el flujo de compra existente, consultan/cancelan únicamente sus registros y no duplican el mismo asiento ante dos solicitudes.
- Pruebas de interfaz con DOM y cámara simulados: identidad publicada, separación de controles por rol, código y cámara hacia el mismo endpoint, permiso de cámara denegado, datos vacíos, SQL pendiente y consulta en memoria sin conexión.
- SQL Server real, solo lectura: estructura, roles, recuentos y GET de `/api/admin/rutas/hojas` para R001 y `/api/operacion/jornada` para R004/R006; respuestas 200, sin inventar viajes y con operación no disponible. Para estas consultas se usaron sesiones temporales en memoria de un proceso de prueba, revocadas al terminar; no se cambiaron credenciales ni usuarios.
- No se comprobó una escritura operativa real ni la ejecución de 010. Los tests transaccionales usan un doble de SQL; no sustituyen probar los bloqueos e índices en SQL Server tras la migración.
- La herramienta de navegador falló al conectar su canal nativo. No hubo revisión visual en navegador ni uso de cámara física. Tampoco se verificaron ventas por tramo, tarifas, efectivo/vuelto o sincronización offline: están bloqueados o pendientes, no simulados como funciones listas.

Ejecutar de nuevo las pruebas:

```powershell
node --test tests/*.test.cjs
```

## Archivos de esta etapa

Nuevos:

- `backend/src/services/tripRules.js`
- `backend/src/services/tripOperations.js`
- `backend/src/routes/tripOperationRoutes.js`
- `database/scripts/010_operacion_viajes.sql`
- `frontend/src/components/portal_operativo.html`
- `frontend/src/js/worker_passenger.js`
- `tests/trip-rules.test.cjs`
- `tests/trip-operations.test.cjs`
- `tests/worker-passenger.test.cjs`
- `tests/worker-portal-ui.test.cjs`
- `docs/portales-chofer-controlador.md`

Actualizados sobre los cambios locales existentes:

- Portales: `frontend/src/views/chofer/bienvenida.html`, `frontend/src/views/controlador/panel.html`, `frontend/src/js/chofer_bienvenida.js`, `frontend/src/assets/chofer_bienvenida.css`.
- API y permisos: `backend/src/server.js`, `backend/src/services/accounts.js`, `backend/src/security/permissions.js`, `backend/src/controllers/controladorBordoController.js`, `backend/src/controllers/adminRutasController.js`, `backend/src/controllers/userReservaController.js`.
- Personal: `frontend/src/js/coop_personal.js`, `frontend/src/views/cooperativa/personal.html`, `frontend/src/js/admin_company_detail.js`, `frontend/src/views/admin/cooperativas.html`.
- Asignación: `frontend/src/js/admin_operaciones.js`, `frontend/src/views/admin/hojas_ruta.html`.
- Modo pasajero: `frontend/src/js/user_viajes.js`, `frontend/src/views/usuario/catalogo_viajes.html`, `frontend/src/views/usuario/seleccion_asientos.html`, `frontend/src/views/usuario/mis_boletos.html`.
- Regresión: `tests/login.test.cjs`, `tests/personal-access.test.cjs`.

El estado de Git contiene además archivos de etapas anteriores; no se deben atribuir todos esos cambios a estos portales ni descartarlos.
