# Corrección de autenticación, navegación e identidad de R004 y R006

Fecha: 16 de noviembre de 2026. Rama: `feature/redisenio-pagina`.

## Resultado y causa de los colores

La regla `.work-nav button[aria-current]` usaba `--work-secondary` como color de texto sobre el fondo claro de la navegación. La API real de CP001 (Coop Prueba) devuelve principal `#153fbc` y secundario `#ffffff`: el blanco publicado hacía desaparecer texto e iconos. El contorno amarillo venía de la regla global `:focus-visible`, no de la selección.

Todas las pestañas de ambos portales comparten ahora fondo principal publicado, texto negro o blanco calculado mediante luminancia, selección subrayada y foco de teclado oscuro con separación blanca. El subrayado también distingue la selección si el principal publicado es blanco. Los estados inactivo, hover y deshabilitado tienen colores legibles; los iconos heredan el texto. Se mantienen el menú Más opciones, los tamaños táctiles y los puntos de adaptación existentes.

## Identidad publicada

Se consulta `/api/auth/me` para identificar al trabajador y su cooperativa. Después se utiliza `/api/public/cooperativas/:ID_COP`, el mismo endpoint publicado que emplea R002. Se comprueba que el ID devuelto coincida antes de aplicar nombre comercial, logo, portada y colores. El nombre personal sigue separado del comercial.

Las variables CSS y las imágenes anteriores se limpian antes de cargar la identidad. Sin personalización se mantienen los colores predeterminados y el nombre de la cooperativa; una imagen ausente o que no carga se oculta. El logo conserva `object-fit: contain`, la portada `cover` y posición central. No se modifica ningún archivo de imagen, borrador, preferencia ni registro SQL. Las consultas de identidad no usan caché y las imágenes conservan sus identificadores publicados.

## Autenticación y navegación

La entrada oficial es `http://localhost:3000/src/views/public/index.html`. `?login=1` abre el modal cuando no existe sesión. También puede utilizarse Live Server abriendo `frontend/src/views/public/index.html`, con el backend iniciado en el puerto 3000.

`auth/login.html` permanece como compatibilidad: redirige a la portada con el modal, sin formulario duplicado. Descarta destinos externos; no utiliza parámetros de retorno arbitrarios. Si ya hay sesión, no pide otra contraseña y dirige al panel correspondiente. R005 permanece en la portada sin un bucle.

| Rol | Destino tras ingresar, relativo a `src/views/` |
| --- | --- |
| R001 | `admin/dashboard.html` |
| R002 | `cooperativa/dashboard_coop.html` |
| R003 | `oficinista/ventanilla_boletos.html` |
| R004 | `controlador/panel.html` |
| R005 | `public/index.html` |
| R006 | `chofer/bienvenida.html` |

La tabla de destinos está centralizada en `transport_session.js`. Las vistas privadas esperan `/auth/me` y verifican su familia de roles; los adaptadores antiguos esperan esa comprobación, en lugar de autorizar mediante localStorage. Este almacenamiento solo conserva compatibilidad visual. El backend sigue autorizando cada operación.

El cierre usa el endpoint existente `/api/auth/logout`, espera la revocación, limpia la caché visual y vuelve a la portada. Si el servidor no confirma el cierre, informa el error y permite reintentar. Al volver con Atrás se comprueba de nuevo la sesión; una vista privada recuperada de la caché permanece oculta mientras se verifica y se recarga si la sesión sigue válida. Un cambio de cuenta obliga a recargar los datos privados.

«Viajar como pasajero» abre la portada completa sin cerrar la sesión ni cambiar el rol. Para R004/R006, la cabecera pública muestra «Volver a mi trabajo» y «Mis boletos». Catálogo, asientos e historial usan la misma navegación, logotipo global y retorno laboral, sin añadir una segunda barra. Las reservas personales continúan en los componentes existentes. El catálogo verifica la sesión en el servidor antes de continuar; asientos e historial obtienen el titular desde la sesión verificada. El filtro de cooperativa se conserva.

## Operaciones conservadas

No se modificaron los servicios backend de viajes, reservas ni asignaciones. Se mantienen los controles de cooperativa, propiedad de boletos, roles, cuentas activas, conflictos de fechas/horas y duración completa, y las protecciones de concurrencia. También permanecen QR, código manual, abordajes, descensos, preparación, inicio, paradas, continuación, finalización e historial laboral separado del personal.

Venta a bordo continúa bloqueada hasta disponer de tarifas por tramo verificables y disponibilidad compartida de asientos. No se añadieron cobros ni datos simulados a la aplicación.

## Archivos de esta corrección

Todos los siguientes son relativos a la raíz del proyecto. Se conservaron los cambios locales anteriores.

- Sesión y acceso: `frontend/src/js/transport_session.js`, `api.js`, `login_modal.js`, **nuevo** `login_redirect.js`; `frontend/src/views/auth/login.html` y `login.js`.
- Portales: `frontend/src/js/chofer_bienvenida.js`, `frontend/src/assets/chofer_bienvenida.css`, `frontend/src/components/portal_operativo.html`.
- Experiencia pública: `frontend/src/js/public_session.js`, `worker_passenger.js`, `user_viajes.js`, `usuario_asientos.js`, **nuevo** `user_boletos.js`; `frontend/src/assets/public_session.css`, `public_catalog.css`; `frontend/src/views/public/index.html`; `frontend/src/views/usuario/catalogo_viajes.html`, `seleccion_asientos.html`, `mis_boletos.html`.
- Compatibilidad de sesión: `frontend/src/js/admin_layout.js`, `admin_shell.js`, `admin_dashboard.js`, `admin_operaciones.js`, `panel_layout.js`, `coop_buses.js`, `coop_resoluciones.js`, `oficinista_ventanilla.js`, `oficinista_validacion.js`, `mi_perfil.js`. Los ajustes se limitan a obtener/esperar la sesión comprobada y tolerar almacenamiento local bloqueado; no cambian estadísticas, tablas ni operaciones.
- Pruebas: **nuevo** `tests/auth-navigation.test.cjs`; ajustes en `tests/login.test.cjs`, `public-session.test.cjs`, `public-catalog.test.cjs`, `profile-editor.test.cjs`, `worker-portal-ui.test.cjs`.
- Este reporte: `docs/correccion-autenticacion-portales.md`.

## Pruebas y alcance

`node --test --test-reporter=tap tests/*.test.cjs`: **156 pruebas aprobadas, 0 fallos**. Las pruebas de JS, controladores y servicios usan respuestas/SQL simulados; no equivalen a iniciar sesión con seis cuentas reales ni a confirmar reservas en SQL Server. Se revisó la sintaxis de **106 archivos JavaScript/CJS**, sin errores.

La suite cubre las seis redirecciones y cierres de sesión, cookies y cabecera de protección, acceso privado sin sesión o con rol incorrecto, recuperación con Atrás, cambio de cuenta, login antiguo, modal sin bucles, retorno laboral, consulta personal sin autorización desde caché, filtro de cooperativa, estados de viajes, QR/manual y conflictos de horarios. Se probaron identidades diferentes, colores claros y ausencia de personalización con datos de prueba aislados.

Consultas HTTP de solo lectura contra el backend real en `localhost:3000`:

- Portada, login antiguo, portales R004/R006 y catálogo: HTTP 200.
- `/api/auth/me`, operaciones, cooperativas administrativas y buses privados sin cookie: HTTP 401.
- CP001 y CP002: HTTP 200, identificador correcto y `Cache-Control: no-store`.
- CP001: identidad publicada azul/blanca; logo PNG y portada JPEG responden HTTP 200.
- CP002: sin paleta publicada, por lo que corresponde el estilo predeterminado. Su URL de logo registrada es externa; su disponibilidad visual no fue verificada ni se reemplazó por otra imagen.

No se modificó `.env`, no se ejecutaron migraciones ni se crearon/eliminaron registros, commits, merges o push.

## Comprobación manual pendiente

El control de navegador no pudo conectarse al componente nativo (`native pipe ... os error 2`). Falta comprobar visualmente el resultado y realizar pruebas de sesión con cuentas reales; no se presenta como terminada esa comprobación.

1. Abrir la portada, ingresar con cada rol y comparar el destino con la tabla. Abrir también `auth/login.html` con y sin sesión.
2. Con R004 y R006, recorrer todas las pestañas con clic y teclado. Revisar foco, selección y menú Más en anchos 360, 390, 768, 1024 y 1440 px.
3. Con cuentas de dos cooperativas, revisar logo, portada, nombre comercial y colores; recargar y cambiar pestañas. CP001 permite comprobar el caso de secundario blanco. CP002 permite comprobar los valores predeterminados. Para comprobar otra paleta publicada con cuentas reales, utilizar una cooperativa que ya la tenga configurada.
4. Pulsar «Viajar como pasajero»: comprobar que aparece la portada, conserva el usuario y muestra «Volver a mi trabajo». Buscar viajes, consultar Mis boletos y volver al portal. No debe pedir otra contraseña.
5. Cerrar sesión y usar Atrás: ninguna vista privada debe permitir continuar. Abrir la portada y comprobar que vuelve a mostrarse «Iniciar sesión».
6. Con viajes reales disponibles, verificar los conflictos entre reservas personales y jornada laboral, y ejecutar el flujo operativo permitido por el estado. Para cámara QR se necesita permiso del navegador, cámara y contexto seguro (localhost o HTTPS).

No hace falta aprobar una migración para esta corrección. La prueba operativa completa requiere cuentas activas, viajes/asignaciones y boletos existentes apropiados; no se crearon datos para simularlos.
