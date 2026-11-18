# Personal, permisos y perfiles personales

## Estado de esta entrega

Implementación preparada en `feature/redisenio-pagina`. Las migraciones 005 y 006 y la conversión de contraseñas **no se han ejecutado**. El guardado nuevo se bloquea expresamente si falta su esquema; no devuelve éxitos simulados. Se conservan los cambios locales anteriores y no se modificó `.env`.

Se inspeccionó SQL Server: USUARIOS tiene nombres y apellidos de 15 caracteres, correo de 40, teléfono de 20, identificación de 10 y contraseña de 20. Hay siete cuentas existentes y ninguna usa bcrypt; no hay correos duplicados al normalizar mayúsculas y espacios. No se consultaron contraseñas para mostrarlas ni se cambiaron cuentas reales durante esta implementación.

## Cambios de base de datos pendientes

1. `database/scripts/005_personal_perfiles.sql`:
   - `COOPERATIVA_RESPONSABLES`: una designación por cooperativa, con referencias a su responsable y al administrador que lo designó.
   - `USUARIO_PERMISOS`: permisos independientes asociados al usuario R002.
   - `USUARIO_FOTOGRAFIAS`: fotografía personal original, MIME, versión y fecha. Los binarios permanecen privados en SQL Server, hasta 8 MB.
   - `USUARIOS.COR_ACCESO_NORMALIZADO`: columna calculada para un índice único del correo, sin reemplazar COR_USU ni modificar correos existentes.
   - Triggers que comprueban que el principal es un R002 activo de su empresa, designado por R001, e impiden retirar la designación o desactivar/cambiar de rol/empresa al principal antes de reemplazarlo.
2. `database/scripts/006_credenciales_hash.sql`: amplía CON_USU de 20 a 255 caracteres; no cambia las claves existentes por sí solo.
3. `database/scripts/006_convertir_credenciales.cjs`: convierte las contraseñas existentes a bcrypt con coste 12, dentro de una transacción, conservando la misma contraseña de acceso. No muestra claves ni hashes y omite cuentas ya convertidas. Requiere autorización expresa junto con 006. Comando posterior a la aprobación:

   `node database/scripts/006_convertir_credenciales.cjs --aplicar-autorizado`

La migración 005 no elige responsables automáticamente. Después de aplicarla, R001 debe entrar en Usuarios → Usuarios de Cooperativa y pulsar **Designar principal** para la cuenta existente de CP001. Hasta esa designación, ese R002 tendrá los permisos delegados que consten en SQL; inicialmente ninguno. Antes de instalar 005 se conservan sus permisos operativos anteriores y se bloquea el nuevo módulo de personal.

No se crean roles generales adicionales. La interfaz heredada de R001 contiene una pestaña de choferes R006; se conserva su consulta histórica, pero las nuevas altas de esta ampliación admiten únicamente R002, R003, R004 y R005.

## Funcionamiento y matriz de permisos

| Acción | R001 | R002 principal | R002 adicional | R003/R004 | R005 |
|---|---|---|---|---|---|
| Gestionar cooperativas | Sí, módulo existente | No | No | No | No |
| Crear la primera cuenta R002 y designar/reemplazar principal | Sí | No | No | No | No |
| Crear o administrar gestores R002 | Sí | Solo su empresa | No | No | No |
| Asignar permisos a gestores | Sí mediante administración autorizada; principal mediante su formulario | Solo gestores de su empresa | No | No | No |
| Gestionar trabajadores R003/R004 | Sí | Solo su empresa | Solo con `trabajadores`, en su empresa | No | No |
| Buses, rutas, resoluciones, salidas, reportes y personalización | Conserva módulos R001 | Acceso completo en su empresa | Según cada permiso | Sus módulos existentes, acotados a su empresa | No |
| Mi perfil | Propio | Propio | Propio | Propio | Propio, sin cooperativa administrativa |
| Catálogo público | Sí | Sí | Sí | Sí | Sí |
| Reservas del pasajero | Conserva la separación de roles | No | No | No | Propias |

Permisos de R002: `dashboard`, `buses`, `rutas`, `resoluciones`, `salidas`, `reportes`, `personalizacion`, `trabajadores`. `personalizacion` permite editar y publicar. `salidas` permite consultar; la administración de hojas existente exige `rutas`. Los indicadores del Dashboard tienen un endpoint propio que no concede acceso a los listados detallados de los otros módulos. El selector de resoluciones para gestionar frecuencias expone únicamente código, fecha y cupos; no concede permiso para administrar resoluciones.

R001 conserva sus rutas de usuarios y sus listas; las escrituras reutilizan el mismo servicio de cuentas que R002. Al registrar desde R001 el primer R002 activo de una cooperativa sin principal, se designa esa cuenta como principal en la misma transacción. Para reemplazarlo se utiliza el botón Designar principal. El anterior conserva solo los permisos delegados que tuviera registrados.

Personal y accesos permite listar, buscar, filtrar, consultar detalle, crear, editar y activar/desactivar lógicamente. La cooperativa se deriva de la sesión; enviar una empresa desde el formulario de R002 se rechaza. Un gestor delegado puede consultar quién es el principal, pero no editar cuentas R002, sus permisos ni su propia cuenta administrativa. Los datos personales propios se editan en Mi perfil.

Las sesiones vuelven a consultar estado, rol, empresa y permisos en cada solicitud. La desactivación también revoca las sesiones del usuario. Las rutas de Oficinista verifican su empresa y las de Controlador verifican empresa, operador y hoja asignada, incluidas las referencias a asientos y boletos. La búsqueda compartida de pasajeros sigue siendo de clientes R005, no de trabajadores.

## Mi perfil

Hay un solo HTML, CSS y JavaScript compartidos. Se abre desde el nombre o avatar; utiliza un diálogo nativo con navegación de teclado, Escape, X y Cancelar, y advierte antes de descartar cambios. El botón Cerrar sesión conserva su ubicación y retorno a la portada.

Edita nombres, apellidos, correo y teléfono; muestra rol, nivel y cooperativa sin permitir modificarlos. La fotografía no se usa como logotipo. La identidad empresarial publicada se conserva en el Dashboard y la página pública.

Cambiar el correo requiere la contraseña actual, comprueba unicidad y renueva la sesión actual, revocando las demás. Cambiar contraseña exige la clave actual, almacena bcrypt y revoca las otras sesiones; el formulario solo aparece cuando las migraciones lo permiten. El Login acepta hashes y permite la transición de las claves heredadas hasta ejecutar la conversión autorizada.

Las fotos admiten JPG/PNG/WebP verificados con decodificación, 8 MB, hasta 24 millones de píxeles y límites de dimensiones de seguridad. Su lectura requiere la sesión del propietario, con `no-store` y `nosniff`. Los bytes originales se conservan. Guardar los datos y reemplazar la fotografía son operaciones separadas: si falla la segunda, el modal indica que los datos se guardaron y la fotografía sigue pendiente.

Las altas de pasajeros de ventanilla mantienen la entrega existente de una clave aleatoria temporal al oficinista autorizado, pero almacenan únicamente su hash. No se escribe ni se registra la clave en texto plano.

## Archivos de esta ampliación

Nuevos:

- Backend: `controllers/accountController.js`, `controllers/userProfileController.js`, `controllers/coopIndicatorsController.js`, `services/accounts.js`, `security/permissions.js`, `security/passwords.js`, `middleware/workerScope.js`, `routes/personalRoutes.js`, `routes/userProfileRoutes.js`, todos bajo `backend/src/`.
- Los tres scripts 005/006 indicados arriba.
- `frontend/src/components/mi_perfil.html`.
- `frontend/src/assets/mi_perfil.css`, `coop_personal.css`.
- `frontend/src/js/mi_perfil.js`, `coop_personal.js`, `coop_access.js`.
- `frontend/src/views/cooperativa/personal.html`.
- `tests/personal-access.test.cjs`, `tests/personal-ui.test.cjs` y este documento.

Modificados:

- Backend: `server.js`, `security/sessionStore.js`, `middleware/session.js`; controladores `authController`, `adminUsuarioController`, `oficinistaBoletoController`, `controladorBordoController`; rutas `adminUsuarioRoutes`, `coopBusRoutes`, `oficinistaBoletoRoutes`, `controladorRoutes`.
- Frontend JS: `admin_cooperativas.js`, `admin_usuarios.js`, `coop_dashboard.js`, `coop_resoluciones.js`.
- Encabezados HTML para cargar el componente compartido: las seis vistas administrativas; `dashboard_coop.html`, `gestion_buses.html`, `resoluciones_ant.html`, `personalizar.html`; las dos vistas de Oficinista; `controlador/panel.html`; las tres vistas de Usuario. En el controlador se retiró la identificación ficticia de respaldo y se usa el identificador de la sesión existente.
- Pruebas previas: `cooperativa-dashboard.test.cjs`, `cooperativa-security.test.cjs`, `profile-publication.test.cjs`.

## Pruebas realizadas y límites

- `node --test tests/*.test.cjs`: 96 pruebas aprobadas. Incluyen regresión de Login, cierre de sesión de cinco roles, reservas, páginas públicas, personalización empresarial y Dashboard.
- Flujo HTTP con repositorio SQL simulado y transacciones aisladas: alta de cooperativa y principal, creación de gestores y trabajadores, Login con hashes, permisos revocados durante una sesión, intentos de elevar privilegios y acceder a otra empresa, protección y transferencia del principal, correos duplicados, fotografías de los cinco roles, cambio de correo y contraseña y bloqueo previo a migraciones.
- Pruebas del JavaScript del modal: apertura sin navegar, advertencia al cerrar con Escape, guardado por API, actualización del encabezado y validación de contraseñas. Comprobación de enlaces y carga de un único componente en todas las vistas.
- SQL Server real: solo lecturas para inspeccionar esquema y comprobar `/auth/me` y `/mi-perfil` para los cinco roles mediante sesiones temporales del servidor de prueba. Todos respondieron 200 e identificaron las migraciones pendientes. Se revocaron esas sesiones al terminar.
- El navegador y las aplicaciones nativas no estaban disponibles para automatización. No se afirma validación visual en escritorio o móvil.
- Pendiente tras aprobación: ejecutar scripts, comprobar sus restricciones reales, probar altas/edición/fotografías/publicación de permisos contra SQL Server con datos controlados, verificar persistencia después de reiniciar Node y revisar visualmente desde el navegador. No se publicaron borradores empresariales ni se modificaron cuentas reales en estas pruebas.

## Cómo probar después de aprobar las migraciones

1. Reinicia el backend y abre `frontend/src/views/public/index.html` con Live Server. Utiliza el Login modal existente.
2. R001: Cooperativas → Responsable abre Usuarios con la empresa preseleccionada al registrar un R002. Para la cuenta R002 ya existente usa Designar principal. Comprueba que no permite desactivarla hasta reemplazarla.
3. Principal R002: entra en Personal y accesos. Registra un gestor con Dashboard y Buses, y un oficinista y un controlador. Comprueba detalle, búsqueda y desactivación.
4. Gestor: inicia sesión y comprueba que puede usar los permisos concedidos. Una llamada directa a una ruta privada no autorizada debe devolver 403. Revoca Buses desde el principal y repite sin cerrar la sesión del gestor.
5. R003/R004: utiliza sus paneles existentes; no deben operar hojas ni boletos ajenos. El controlador debe tener una hoja asignada para ver programación.
6. Con cada rol, pulsa el nombre o avatar, modifica datos y fotografía, guarda y vuelve a iniciar sesión. Prueba correo repetido, contraseña actual incorrecta, Escape con cambios pendientes y una fotografía inválida.
7. R005: verifica que Mi perfil no presenta cooperativa administrativa y que conserva catálogo y reservas propias.
8. Repite con una segunda empresa y tras reiniciar el backend. El principal de cada empresa debe ser designado por R001, sin reutilizar usuarios de la otra.
