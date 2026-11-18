# Cooperativas, navegación, perfil y sesiones

Actualización del 15 de noviembre de 2026, en `feature/redisenio-pagina`. Se conservaron los cambios locales anteriores. No se ejecutaron migraciones, conversiones de credenciales, commits, merges ni push, ni se modificó `.env`.

## Qué está implementado

La pantalla R001 de Cooperativas utiliza el mismo componente de barra lateral y encabezado que el Dashboard. Conserva búsqueda, filtro de estado, edición, cambio de estado y acceso a la gestión del responsable. La tabla muestra ciudad y responsable principal cuando existen. Las estadísticas distinguen una consulta fallida de un listado vacío.

El registro tiene tres pasos: empresa, contacto y responsable. El código se genera en el servidor con el formato CP001–CP999, dentro de una transacción serializable y una lectura con `UPDLOCK,HOLDLOCK`. Respeta los códigos existentes y rechaza el registro si se agota ese rango. El navegador no puede imponer un código.

El último paso permite crear un R002 con una contraseña inicial propia, vincular un R002 activo sin cooperativa ni designación principal, o asignarlo después. Se reutiliza el servicio de cuentas y su hash bcrypt. Empresa, cuenta y designación se guardan en la misma transacción; un fallo revierte toda la operación. La cuenta vinculada conserva su contraseña y se revocan sus sesiones anteriores. No se muestran claves existentes ni se envían credenciales por correo.

La razón social queda en `NOM_COP`. El nombre comercial administrativo queda en `NOM_COM_COP` y sirve como valor inicial al abrir Personalización por primera vez. El contenido público sigue siendo una publicación explícita: no se sobrescriben borradores ni publicaciones existentes al editar los datos administrativos. El nombre público admite ahora hasta 120 caracteres, igual que los nombres administrativos ampliados. El correo institucional también sirve como valor inicial del primer borrador.

El guardado ampliado permanece bloqueado con un mensaje claro mientras no esté aplicada la migración 007. Los listados y cambios de estado siguen disponibles con el esquema actual.

## Validación

Frontend y backend utilizan el mismo validador. El RUC se trata como texto de 13 dígitos y se comprueba su unicidad dentro de la transacción, respaldada por un índice único. No se aplica el antiguo módulo 11 a sociedades: el [SRI explica que esos RUC no tienen un algoritmo específico de validación](https://www.sri.gob.ec/facturacion-electronica). El formulario ofrece una [consulta manual en SRI](https://srienlinea.sri.gob.ec/sri-en-linea/SriRucWeb/ConsultaRuc/Consultas/consultaRuc). No se implementó una consulta automática sin un servicio oficial autorizado.

La cédula ecuatoriana del nuevo responsable se valida por longitud, prefijo y módulo 10. Los documentos extranjeros tienen una validación alfanumérica diferente, de 5 a 10 caracteres, compatible con `ID_USU`. Estas comprobaciones no verifican oficialmente la identidad de una persona. Los nombres y apellidos personales conservan el límite actual de 15 caracteres y el correo de acceso, 40. No se ampliaron esas columnas.

Se aceptan teléfonos fijos ecuatorianos de 9 dígitos, móviles de 10 que comienzan con 09 y equivalentes con +593; se normalizan a formato nacional. Se validan correos, direcciones web http/https y longitudes SQL. Los errores del registro se muestran junto al campo y el formulario abre el paso correspondiente.

## Perfil, menú y sesión

El avatar duplicado se originaba al insertar la fotografía dentro del nombre y también en el contenedor del avatar. Ahora se reutiliza el contenedor existente; solo los encabezados sin ese contenedor usan una fotografía junto al nombre. La fotografía personal sigue separada del logotipo y la portada de la empresa. Avatar y nombre abren Mi perfil.

Dashboard, Personalización, Personal y accesos, Buses y Resoluciones ANT cargan `coop_navigation.js`. Comparten enlaces, iconos SVG, selección activa y acceso inferior a la portada. Las opciones con permisos empiezan ocultas hasta consultar la sesión. `coop_access.js` conserva el control visual y el backend sigue comprobando permisos y cooperativa en cada operación. El menú también conserva su versión móvil.

La portada consulta `/api/auth/me` y muestra la navegación correspondiente al rol verificado. R001–R004 tienen «Ir a mi panel»; R005 tiene «Mis boletos», perfil y reserva. Los visitantes mantienen el Login y la búsqueda pública. Un error de conexión se informa y no se interpreta como prueba de una sesión válida. Cerrar sesión restaura la navegación pública.

Se mantiene el mecanismo existente de cookies HttpOnly y peticiones con credenciales. En desarrollo, la API usa el mismo hostname que la página: si Live Server está en `127.0.0.1`, la API usa `127.0.0.1:3000`; si está en `localhost`, usa `localhost:3000`. Los enlaces son relativos. Los puertos pueden diferir; `localhost` y `127.0.0.1` siguen siendo hosts distintos. Utiliza uno de ellos de forma consistente al iniciar sesión y navegar. No se copian cookies ni credenciales entre hosts. Reiniciar el backend invalida sus sesiones en memoria y exige iniciar sesión otra vez; no borra perfiles ni publicaciones.

## SQL pendiente de autorización

`database/scripts/007_registro_cooperativas.sql`:

- Amplía `NOM_COP` a 120, `DIR_COP` a 240 y `TEL_COP` a 20 caracteres.
- Permite `NULL` en `LOG_URL_COP`, sin inventar URLs.
- Añade nombre comercial, tipo de organización, provincia, ciudad, correo institucional y sitio web como campos opcionales para los registros históricos.
- Añade un índice único sobre RUC. Si ya hay duplicados, detiene la operación y revierte los cambios.
- Comprueba que exista la estructura de responsables de la migración 005. No elimina registros ni rellena datos administrativos inventados.

La inspección de solo lectura encontró dos cooperativas con RUC distintos, la estructura de personal instalada y `CON_USU` con longitud 255. La migración 007 todavía no está aplicada. Las siete cuentas existentes todavía no usan hash bcrypt: `006_convertir_credenciales.cjs` es una operación pendiente independiente, que tampoco se ejecutó. Las cuentas nuevas creadas por el servicio actual sí se almacenan con hash. No es necesario ejecutar otra vez las ampliaciones SQL 005/006 que ya están instaladas.

## Pruebas

`node --test tests/*.test.cjs`: 106 pruebas aprobadas. Cubren registro válido, RUC incorrecto y duplicado, ceros iniciales, cédula y documento extranjero, teléfono, límites de campos, generación de códigos, rollback al fallar el responsable, vinculación elegible, migración pendiente, inicio de sesión y rutas de roles, sesión pública, avatar único, perfiles, permisos y publicación de imágenes.

Las pruebas HTTP usan persistencia aislada para crear cuentas y empresas. Comprueban dos cooperativas con trabajadores independientes, rechazo de detalle/edición/desactivación ajenos, bloqueo de pasajeros R005 y límites de gestores delegados. La lectura serializada y el índice único están implementados; no se hicieron escrituras concurrentes en la base real.

También se comprobaron 83 archivos JavaScript con `node --check` y los identificadores utilizados por el formulario. Las consultas HTTP de solo lectura contra SQL Server real respondieron 200 para sesión R001, listado de dos cooperativas, candidatos de responsable, sesión R002, Mi perfil y personal propio. Se usó una instancia temporal del backend, sin modificar registros ni las sesiones de la instancia que utiliza el usuario. Solo había un R002 activo disponible para esta comprobación real; el aislamiento entre dos representantes se verificó con las pruebas aisladas.

No se completó una prueba visual: Edge fue detectado minimizado y el controlador nativo devolvió un error de conexión al intentar abrirlo. Los estilos incluyen adaptaciones de ancho y menú móvil, pero queda pendiente confirmar su aspecto en el navegador.

## Cómo probar manualmente

1. Reinicia el backend con `node backend/src/server.js`. Abre `frontend/src/views/public/index.html` con Live Server y mantén el mismo hostname durante toda la prueba. Usa Ctrl+F5 para cargar los scripts nuevos.
2. Entra como R001 y abre Cooperativas. Compara su barra lateral con el Dashboard; prueba búsqueda, estado y la acción Responsable. Abre Nueva cooperativa: antes de aplicar 007 debe informar que el guardado está pendiente.
3. Después de autorizar y aplicar 007, recarga y registra una empresa con datos de prueba propios. Recorre los tres pasos, comprueba código automático y ausencia de logotipo obligatorio. Prueba un RUC incorrecto y uno ya registrado.
4. Crea el primer responsable con su identificación, correo y clave inicial propia. Comprueba que pueda iniciar sesión como R002. Repite con «Asignar después» o con una cuenta elegible existente. Un correo de acceso repetido debe impedir guardar toda la operación.
5. En R002, navega entre Inicio, Personalización, Personal y accesos, Buses y Resoluciones. Comprueba el menú completo, la opción activa y el enlace a la portada. Prueba también con un delegado con permisos limitados: no debe ver ni poder abrir las operaciones no autorizadas.
6. Abre Mi perfil y sube una foto. Debe aparecer un solo avatar. Recarga y vuelve a iniciar sesión; la fotografía debe conservarse sin reemplazar el logotipo ni la portada de la cooperativa.
7. Usa dos sesiones de prueba de cooperativas diferentes y comprueba su personal, búsquedas, filtros y permisos. Cambiar un ID de trabajador por uno ajeno en una petición debe producir 404/403, sin modificarlo.
8. Vuelve a la portada con cada rol. R001–R004 deben ir a su panel correcto; R005 debe acceder a sus boletos y conservar el flujo de reserva. Cierra sesión y comprueba que reaparece Iniciar sesión. Una ventana privada sin autenticar debe mostrar la portada pública.
9. Guarda un borrador de personalización, abre su vista previa privada y publica. Comprueba que la identidad pública y el Dashboard siguen usando la publicación de esa misma empresa.
10. Revisa a 1440, 768 y 390 píxeles: menú lateral y cierre con Escape, tabla con desplazamiento horizontal, formulario de tres pasos y encabezado de sesión sin superposiciones.

## Archivos de esta actualización

Backend:

- `backend/src/controllers/adminCooperativaController.js`
- `backend/src/routes/adminCooperativaRoutes.js`
- `backend/src/services/accounts.js`
- `backend/src/services/companyRegistration.js` — nuevo.
- `backend/src/repositories/cooperativaProfileRepository.js`
- `backend/src/services/profileContent.js`

Frontend, scripts:

- `frontend/src/js/admin_cooperativas.js`, `admin_dashboard.js`, `mi_perfil.js`, `transport_session.js`, `coop_access.js`.
- Nuevos: `frontend/src/js/admin_shell.js`, `coop_navigation.js`, `public_session.js`, `ecuador_validation.js`.

Frontend, estilos:

- `frontend/src/assets/mi_perfil.css`.
- Nuevos: `frontend/src/assets/admin_company_registration.css`, `coop_navigation.css`, `public_session.css`.
- Se reutilizan `admin_dashboard.css` y `coop_dashboard.css`; no se modifica el archivo global `admin_layout.css`.

Vistas:

- `frontend/src/views/admin/cooperativas.html`, `dashboard.html`.
- `frontend/src/views/cooperativa/dashboard_coop.html`, `personalizar.html`, `personal.html`, `gestion_buses.html`, `resoluciones_ant.html`.
- `frontend/src/views/public/index.html`.

Pruebas y documentación:

- `tests/admin-dashboard-ui.test.cjs`, `personal-access.test.cjs`, `personal-ui.test.cjs`, `profile-publication.test.cjs`.
- Nuevos: `tests/company-registration.test.cjs`, `tests/public-session.test.cjs`.
- Nuevos: `database/scripts/007_registro_cooperativas.sql` y este documento.

Esta lista corresponde a la actualización actual; el estado de Git contiene además los cambios locales de las etapas anteriores.
