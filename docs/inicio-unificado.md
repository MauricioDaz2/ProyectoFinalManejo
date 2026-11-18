# Inicio unificado del proyecto

## Cómo abrirlo desde VS Code

1. Abre la carpeta raíz `ProyectoFinalManejo` en VS Code y mantén SQL Server en Docker iniciado.
2. Si el backend ya estaba ejecutándose antes de esta actualización, detenlo con Ctrl+C en su terminal. Esto permite cargar la nueva ruta de comprobación.
3. Ejecuta `npm run dev`. En el PowerShell de este equipo, que bloquea `npm.ps1`, utiliza **`npm.cmd run dev`**. No hace falta cambiar la política de seguridad.
4. Mantén la terminal abierta y abre el enlace que imprime: **http://localhost:3000/**. También puedes abrir `frontend/src/index.html` con Open with Live Server: te llevará al servidor oficial.

`npm start` (o `npm.cmd start`) inicia Express sin vigilancia de cambios. `npm test` (o `npm.cmd test`) ejecuta las pruebas. No se instalaron dependencias nuevas. Los comandos se ejecutan desde la raíz del repositorio y reutilizan la configuración SQL existente; no arrancan ni modifican Docker.

El puerto de desarrollo utilizado por el lanzador es 3000. La prueba temporal del comando se hizo en 39017 para no interrumpir el proceso que el usuario ya tenía abierto; ese proceso temporal fue detenido después. La configuración `.env` no se cambió.

## Una sola portada y una sola autenticación

La entrada oficial es `http://localhost:3000/`. `frontend/index.html` conduce al lanzador `frontend/src/index.html`, y este comprueba Express antes de abrir la portada existente `/src/views/public/index.html`. El lanzador no es otra página de pasajeros ni otro login.

`GET /api/health` identifica exclusivamente al servidor de este proyecto. No consulta SQL, no entrega datos privados ni crea sesiones. La solicitud del lanzador omite credenciales y no se almacena en caché.

Si Express está disponible, Live Server conduce a `http://localhost:3000/src/views/public/index.html`. Si está apagado, responde otro servicio o sigue ejecutándose la versión anterior del backend, el lanzador muestra instrucciones y Reintentar. No usa recargas automáticas repetidas ni destinos externos recibidos por parámetros.

Las vistas abiertas directamente con Live Server pasan primero al lanzador. `transport_session.js` detiene sus consultas y no inicia autenticación ni carga componentes privados en el origen estático. Todas las operaciones posteriores se ejecutan en Express, con su cookie y los controles existentes. No se intentan copiar cookies ni iniciar Node.js desde el navegador.

## Causa comprobada del error textContent

`frontend/src/index.html` no existía antes de esta corrección. El único índice general era `frontend/index.html`, que dirigía a la portada conservando el origen de Live Server.

La respuesta HTTP real de Live Server para `/frontend/src/components/portal_operativo.html` estaba modificada y truncada. Insertaba `<!-- Code injected by live-server -->` y scripts de recarga dentro de los SVG. Faltaban `workGreeting`, `workDate`, `workStatus`, `workHistory` y otros elementos de la plantilla. Express entregaba el archivo completo, sin esa inyección.

En `frontend/src/js/chofer_bienvenida.js`, `initialize()` escribía `$('workGreeting').textContent = ...` después de montar esa respuesta incompleta. Al no existir el elemento, el resultado era null y aparecía el error técnico. La plantilla y el script se comparten entre R006 y R004.

La corrección evita cargar el fragmento con Live Server. Además, el portal espera la sesión verificada y comprueba que la respuesta no tenga inyección de Live Server y que existan los elementos esenciales antes de utilizarlos. Si la plantilla está incompleta, indica el archivo y el elemento faltante, sin continuar con operaciones ni ocultar el problema.

## Funciones conservadas

Se conservan el modal de la portada, la compatibilidad del login antiguo y las seis redirecciones:

| Rol | Vista, relativa a `/src/views/` |
| --- | --- |
| R001 | `admin/dashboard.html` |
| R002 | `cooperativa/dashboard_coop.html` |
| R003 | `oficinista/ventanilla_boletos.html` |
| R004 | `controlador/panel.html` |
| R005 | `public/index.html` |
| R006 | `chofer/bienvenida.html` |

No se cambiaron reservas, filtros de cooperativa, permisos, perfil, jornada, agenda, historial, QR, operaciones, Viajar como pasajero, Volver a mi trabajo ni cierre de sesión.

## Archivos de esta corrección

- `package.json`: comandos dev, start y test.
- `backend/src/server.js`: comprobación pública del servidor y mensajes de inicio/puerto ocupado; se mantienen las rutas anteriores y la publicación estática existente.
- `frontend/index.html`: enlace al lanzador único.
- `frontend/src/index.html`: nuevo lanzador con instrucciones.
- `frontend/src/js/project_start.js`: nueva comprobación y apertura de Express.
- `frontend/src/assets/project_start.css`: presentación del lanzador.
- `frontend/src/js/transport_session.js`: desvío de las vistas estáticas antes de autenticar o cargar componentes.
- `frontend/src/js/chofer_bienvenida.js`: espera de sesión y validación explícita de plantilla.
- `tests/project-start.test.cjs`: nuevas pruebas del lanzador, acceso estático, servidor y recursos.
- `tests/worker-portal-ui.test.cjs`: casos de plantilla inyectada e incompleta.
- `tests/auth-navigation.test.cjs`, `tests/cooperativa-dashboard.test.cjs`, `tests/profile-editor.test.cjs`: adaptación de pruebas al origen oficial de Express.
- `docs/inicio-unificado.md`: esta guía.

## Pruebas realizadas

**162 pruebas aprobadas, 0 fallos**, ejecutando `npm.cmd test`. También pasó la revisión de sintaxis de los cuatro archivos JavaScript de ejecución modificados o creados.

Comprobaciones con procesos y HTTP reales:

- Arranque mediante `npm.cmd run dev` en un puerto temporal libre y respuesta HTTP 200 de health, lanzador y portada. Se detuvo únicamente el proceso temporal propio.
- Servidor Express aislado iniciado por las pruebas: respuesta correcta de health y CORS para Live Server, sin Set-Cookie; seis vistas, portada, login, componentes y recursos locales HTML/CSS/JS/imágenes/iconos/favicon con HTTP 200. Las rutas de imágenes dentro de CSS también se comprobaron.
- Comparación real de la plantilla servida por Live Server y por Express que permitió identificar la truncación.
- Rechazo HTTP 401 de sesión, operaciones y consultas privadas sin cookie.
- Consulta pública de solo lectura de CP001 y CP002 contra el backend existente: identificadores correctos y HTTP 200. Logo y portada publicados de CP001: HTTP 200.

Pruebas automatizadas con navegador/DOM y respuestas simuladas:

- Express apagado, respuesta ajena o destino no permitido: instrucciones y reintento, sin bucle.
- Vista abierta en Live Server: no consulta auth ni componentes privados; redirige al lanzador.
- Plantilla alterada o incompleta: error descriptivo antes de escribir textContent.
- Regresión de login y logout de seis roles, redirecciones, retorno laboral, reservas, filtros, permisos y operaciones existentes.

No se realizaron inicios de sesión reales con seis cuentas ni una revisión visual del navegador. Los mocks no se presentan como pruebas completas contra SQL Server. Queda comprobar manualmente: abrir el índice con Live Server tras reiniciar el backend, ingresar con cada rol, recorrer los portales, pasar a la experiencia pública, volver al trabajo y cerrar sesión. Para comprobar Express apagado, detenerlo en su terminal y volver a abrir el índice: deben aparecer las instrucciones.

Se conservó `feature/redisenio-pagina` y el trabajo local anterior. No se modificó `.env`, no se ejecutaron migraciones, no se crearon usuarios ni se escribieron datos SQL. No hubo commits, merges ni push.
