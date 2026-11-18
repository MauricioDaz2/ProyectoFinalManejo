# Gestión de cooperativas R001: ficha y responsables

Entrega del 16 de noviembre de 2026 en `feature/redisenio-pagina`. Continúa el módulo existente; no sustituye los módulos de R002, R003, R004 o R005. Se conservaron los cambios locales, las publicaciones y los datos registrados. No se ejecutaron migraciones ni se modificó `.env`. No se hicieron commits, merges o push.

## Uso del módulo

La tabla conserva búsqueda por nombre legal/comercial, código, RUC y ciudad, además del filtro de estado. Cada fila abre su ficha; también funciona con Enter o Espacio, y el nombre es un enlace. Se retiraron los botones repetidos de cada fila. La dirección interna permite volver directamente a una empresa:

`frontend/src/views/admin/cooperativas.html#cooperativa=CP003`

La ficha mantiene la barra lateral R001. Su cabecera muestra identidad, código, ubicación, estado y el enlace a `../public/cooperativa.html?id=CP003`, sustituyendo el identificador por el registro seleccionado. El logotipo publicado se consulta con autorización R001, incluso cuando la empresa está inactiva; no se expone la biblioteca privada al público.

Solo hay tres pestañas:

- **Empresa:** datos administrativos, edición, estado y eliminación excepcional. El sitio web externo se presenta separado del enlace a la página pública de la plataforma. Las fechas ausentes se indican como no registradas.
- **Responsables:** únicamente R002, distinguiendo principal y gestores, con permisos, búsqueda y filtro de estado. Permite consultar, editar, crear gestores, desactivar/reactivar y designar explícitamente un principal.
- **Personal:** únicamente R003 y R004 de esa empresa. Incluye búsqueda por nombre, identificación o correo, filtros por rol y estado, consulta, edición y desactivación/reactivación. La gestión cotidiana continúa en R002. No se creó otro directorio ni otra tabla de usuarios.

## Registro nuevo

Se conservan los pasos Empresa, Contacto y Responsables. Una cooperativa nueva comienza activa y debe tener exactamente un principal activo. Ya no aparecen «Asignar después» ni «Vincular cuenta existente».

El último paso contiene el formulario del principal y «+ Añadir gestor adicional». Admite hasta diez gestores por operación, cada uno con permisos explícitos; pueden editarse o retirarse antes de guardar. Un resumen muestra nombres, correos, niveles y permisos, sin mostrar contraseñas.

«Crear cooperativa y responsables» ejecuta una sola transacción serializable: código automático, empresa, principal, gestores y permisos. Si falla cualquiera de las cuentas o un permiso, se revierte todo. Se comprueban duplicados tanto entre las cuentas del formulario como contra SQL Server. Los gestores se crean sin designación automática de principal.

Se reutiliza el servicio de cuentas y bcrypt. Cada cuenta requiere una contraseña inicial propia, de al menos ocho caracteres y hasta 72 bytes; no hay claves compartidas ni envío automático de credenciales. La clave se entrega de forma privada y puede cambiarse en Mi perfil. Se mantienen las validaciones ecuatorianas y los límites SQL anteriores.

## Empresas antiguas sin responsable

CP003 ya existe y no fue borrada ni registrada nuevamente. La lectura real de su ficha confirmó que está activa y no tiene principal. En Responsables aparece **Crear acceso principal**. La operación crea únicamente la cuenta y su designación dentro de una transacción, comprobando que nadie haya asignado otro principal mientras el formulario estaba abierto. Después aparece el principal y el botón pasa a crear gestores adicionales.

Este flujo no necesita la migración 008; utiliza las estructuras 005, 006 y 007 ya instaladas. No se creó una cuenta real para CP003 durante las pruebas.

## Estados, historial y eliminación

Se conservan `1 = activa` y `0 = inactiva`. La migración 008 incorpora `S = suspendida`, motivo y fecha del cambio, sin reinterpretar los registros anteriores. Suspender exige un motivo. Cada cambio se confirma escribiendo el código de la cooperativa.

Activar y desactivar funcionan con el esquema actual. La suspensión y el historial muestran su dependencia de 008. Los indicadores y el filtro de suspendidas se habilitan cuando esa estructura está instalada.

Suspender o desactivar revoca las sesiones R002/R003/R004 de la empresa. Los permisos y el estado se vuelven a comprobar en el servidor. Reactivar no convierte gestores en principales ni amplía permisos; las sesiones revocadas necesitan un nuevo inicio de sesión.

La reserva de asientos ahora verifica la cooperativa activa dentro de su transacción, con bloqueo de la fila de empresa. La consulta pública de asientos también exige empresa activa aunque no se envíe un filtro de cooperativa. El catálogo y la página pública mantienen su filtro existente de empresas activas. El historial de boletos no filtra por estado de empresa; se comprueba que el pasajero autenticado consulte o cancele únicamente sus propios registros. No se eliminan ventas, reservas ni boletos por cambiar el estado.

La sustitución del principal exige confirmación, que el nuevo responsable sea un R002 activo de la misma cooperativa y que la empresa esté activa. El anterior conserva su cuenta e historial y queda sin permisos delegados hasta que R001 los configure. No se permite transferir silenciosamente un gestor a otra empresa. Para conservar el historial, la sustitución queda bloqueada hasta aplicar 008, también desde el endpoint administrativo anterior.

La eliminación física exige escribir `ELIMINAR CPxxx`. El servidor revisa las relaciones del catálogo SQL y las columnas de pertenencia a cooperativa dentro de una transacción. Si encuentra usuarios, buses, resoluciones, perfiles, imágenes, responsables, historiales u otras dependencias, devuelve el detalle y recomienda desactivar. Las relaciones intermedias preservan también frecuencias, hojas, asientos y boletos. No se ejecutan eliminaciones en cascada ni eliminaciones físicas de trabajadores.

Las ediciones, cambios de estado y acciones sobre cuentas incluyen una versión del registro. Si otro administrador lo cambió, se rechaza el guardado y se pide actualizar la ficha.

## Migración pendiente

Archivo: `database/scripts/008_estados_historial_cooperativas.sql`.

- Añade motivo de suspensión y fecha de cambio de estado.
- Añade una fecha de registro para futuras cooperativas. No inventa fechas para las anteriores.
- Añade una restricción de estados `0`, `1`, `S` y rechaza previamente valores desconocidos.
- Crea historiales de cambios de estado y responsables principales, con sus relaciones y sin cascadas.
- Instala un trigger que registra las designaciones y sustituciones posteriores a su instalación. No reconstruye cambios antiguos que no se registraron.

La migración 007 está aplicada, confirmado mediante lectura del esquema real. **008 no se ejecutó**. Hasta aprobarla no se puede verificar en SQL Server real el guardado del motivo de suspensión ni la escritura de sus historiales y del trigger de sustituciones. La creación múltiple de responsables y el acceso principal inicial no necesitan tablas nuevas.

## Pruebas realizadas

`node --test tests/*.test.cjs`: **112 pruebas aprobadas**.

Se comprobó el registro con principal y varios gestores, contraseñas con hash, login, permisos delegados, duplicados, rollback al fallar una cuenta o un permiso, edición con conflicto de versión, creación de acceso inicial sin recrear empresa, sustitución explícita, protección del principal, aislamiento entre cooperativas, suspensión/reactivación, revocación de sesión, bloqueo de nuevas reservas e historial de boletos accesible. También se probó eliminación bloqueada por usuarios y buses, y eliminación de una empresa vacía exclusivamente en la persistencia aislada de pruebas.

Las pruebas de interfaz ejecutan los scripts con un DOM de prueba: filas seleccionables, teclado, enlace público correcto, tres pestañas, botón de acceso inicial, filtros de Personal e identificadores HTML. Se revisó la sintaxis de 88 archivos JavaScript.

Se hicieron peticiones HTTP de **solo lectura** a una instancia temporal del backend conectada a SQL Server real. El listado y las fichas CP001, CP002 y CP003 respondieron 200 y mostraron únicamente personal de su cooperativa. CP001 tiene principal; CP002 y CP003 no. La instancia temporal no alteró las sesiones de la instancia utilizada por el usuario.

No se ejecutaron escrituras de prueba ni migraciones sobre la base real. Las pruebas de suspensión e historial usan persistencia aislada; no sustituyen la verificación del SQL de 008 una vez autorizado. Tampoco se completó una inspección visual: el controlador nativo del navegador devolvió un error de conexión. El CSS incluye adaptaciones móviles, pendientes de revisión visual manual.

## Comprobación manual

1. Reinicia el backend con `node backend/src/server.js`. Abre la portada con Live Server y entra como R001. Mantén el mismo hostname (`localhost` o `127.0.0.1`) al navegar y recarga con Ctrl+F5.
2. Abre Cooperativas. Busca por ciudad, cambia el filtro y abre una fila con clic o con teclado. Comprueba Empresa, Responsables y Personal, y usa Volver a cooperativas.
3. Abre CP003 y entra en Responsables. Usa Crear acceso principal con los datos reales que quieras asignar. No vuelvas a registrar la empresa. Comprueba el acceso de esa cuenta a su panel R002.
4. Registra una nueva empresa con un principal y dos gestores con distintos permisos. Retira o edita uno antes de confirmar. Prueba un correo duplicado: no debe guardarse parcialmente la empresa.
5. Entra con los nuevos gestores y verifica que solo puedan abrir sus módulos autorizados. El personal creado posteriormente por R002 debe aparecer en la ficha R001 al actualizar.
6. Comprueba los filtros de Personal y realiza una edición permitida. En dos pestañas, intenta guardar una ficha antigua después de actualizarla en la otra: debe indicar conflicto y pedir recargar.
7. Antes de 008, verifica el aviso pendiente para suspensión e historial. Después de autorizarla y aplicarla, suspende una cooperativa de prueba con motivo, comprueba el bloqueo comercial y reactívala. Sus usuarios deben iniciar sesión nuevamente y conservar sus permisos anteriores.
8. Después de 008, sustituye al principal por otro gestor activo de la misma empresa y revisa el historial. Confirma que no se pueda desactivar al principal vigente.
9. Intenta eliminar una cooperativa que tenga dependencias: debe bloquearse y recomendar desactivación. No uses datos históricos para probar una eliminación efectiva.
10. Comprueba que un pasajero siga viendo sus boletos anteriores y que no pueda consultar los de otra cuenta. Revisa las pantallas a 1440, 768 y 390 píxeles de ancho.

## Archivos de esta entrega

Backend modificado:

- `backend/src/controllers/adminCooperativaController.js`
- `backend/src/routes/adminCooperativaRoutes.js`
- `backend/src/services/companyRegistration.js`
- `backend/src/services/accounts.js`
- `backend/src/controllers/userReservaController.js`
- `backend/src/repositories/cooperativaProfileRepository.js`
- `backend/src/controllers/cooperativaProfileController.js`

Backend nuevo:

- `backend/src/services/companyAdministration.js`
- `backend/src/services/recordVersion.js`

Frontend modificado:

- `frontend/src/views/admin/cooperativas.html`
- `frontend/src/js/admin_cooperativas.js`
- `frontend/src/js/ecuador_validation.js`

Frontend nuevo:

- `frontend/src/js/admin_company_accounts.js`
- `frontend/src/js/admin_company_detail.js`
- `frontend/src/assets/admin_company_detail.css`

SQL, pruebas y documentación:

- Nuevo: `database/scripts/008_estados_historial_cooperativas.sql`
- Modificados: `tests/personal-access.test.cjs`, `tests/company-registration.test.cjs`
- Nuevo: `tests/company-detail-ui.test.cjs`
- Nuevo: este documento.

Los demás cambios que aparecen en Git corresponden a etapas anteriores y se conservaron.
