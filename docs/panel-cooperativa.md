# Panel privado de cooperativa · etapa 1

El panel R002 muestra la cooperativa asociada a la cuenta en SQL Server, su representante, logotipo, flota, programación y resumen operativo. La plantilla usa azul oscuro, rojo, tarjetas y un menú adaptable. Cuando faltan fotografías se muestran espacios neutros; no se generan fotografías de empresas o buses.

La página pública individual, la subida de imágenes y la edición/publicación de contenidos corresponden a las siguientes etapas. El panel identifica claramente esas funciones como pendientes. No se han ejecutado migraciones ni modificado credenciales.

## Archivos de esta etapa

- `frontend/src/views/cooperativa/dashboard_coop.html`: estructura del panel.
- `frontend/src/assets/coop_dashboard.css`: estilos exclusivos de `.coop-dashboard`.
- `frontend/src/js/coop_dashboard.js`: identidad, navegación, carga y estados vacíos/errores.
- `frontend/src/js/coop_dashboard_data.js`: rutas únicas, conteos y próximas salidas.
- `backend/src/security/sessionStore.js`: sesiones opacas en memoria.
- `backend/src/middleware/session.js`: cookie, identidad consultada en SQL Server, validación de rol y origen.
- `backend/src/middleware/cooperativaScope.js`: validación de pertenencia de recursos y referencias.
- `backend/src/controllers/authController.js` y `backend/src/routes/authRoutes.js`: emisión de sesión en Login, consulta de sesión y cierre.
- `backend/src/routes/coopBusRoutes.js` y `backend/src/controllers/coopBusController.js`: cooperativa obtenida de la sesión y verificación de propiedad antes de usar los controladores existentes.
- `backend/src/server.js`: integración de los controles de acceso, CORS con credenciales y exportación de Express para pruebas.
- `frontend/src/js/transport_session.js`: envío de cookie y cabecera de solicitudes, cierre de sesión en servidor y compatibilidad localhost/127.0.0.1.
- `frontend/src/js/api.js`: uso de la dirección API común y del cierre de sesión compartido.
- Las vistas HTML existentes incorporan únicamente la carga de `transport_session.js`, salvo el Dashboard R002 rediseñado. Esto permite conservar Login, modal y peticiones de los otros módulos al activar las sesiones del servidor. No cambian sus estilos ni sus formularios.
- `tests/cooperativa-dashboard.test.cjs` y `tests/cooperativa-security.test.cjs`: casos de datos, errores, roles, aislamiento y cierre de sesión.

## Datos conectados

| Información | API existente / nueva |
| --- | --- |
| Nombre, representante, cooperativa activa y logotipo | `GET /api/auth/me` (nuevo) |
| Total de buses, buses activos y flota | `GET /api/coop/buses` |
| Frecuencias activas y pares de origen/destino únicos | `GET /api/coop/frecuencias` |
| Salidas programadas o en curso, hasta cinco desde hoy | `GET /api/coop/hojas-ruta` |
| Resoluciones, boletos de hoy, ingresos y reservas pendientes | `GET /api/coop/resumen` |

Las hojas de ruta existentes almacenan fecha, por lo que no se inventan horas de salida. Una lista vacía representa cero; una consulta fallida presenta «No disponible» y permite actualizar.

## Sesión y aislamiento

El Login conserva su respuesta y los destinos de los cinco roles. Además entrega una cookie HttpOnly, SameSite=Lax, con una sesión de ocho horas. El servidor consulta en cada solicitud privada el usuario, rol y cooperativa vigentes; los identificadores de localStorage no conceden permisos. Los recursos ajenos y las referencias a buses, resoluciones, frecuencias o controladores ajenos se rechazan antes de invocar los controladores de escritura.

R002 tampoco puede acceder a las APIs administrativas, de oficinista o de controlador para evadir esta comprobación. Los catálogos públicos y la consulta de asientos permanecen públicos. Los módulos de otros roles conservan sus reglas de negocio: esta etapa no constituye una revisión de autorización interna de todos ellos.

Las sesiones están en memoria del proceso Node. Reiniciar el backend cierra todas las sesiones. Para ejecutar varias instancias o mantener sesiones entre reinicios hará falta un almacén compartido. La comparación de credenciales existente no se ha cambiado.

En desarrollo se permiten los orígenes locales HTTP de los puertos 3000, 5500 y 5501; en producción se exige el mismo origen. El cliente utiliza el mismo hostname local que la página para evitar cookies entre localhost y 127.0.0.1. Las restricciones locales previas de las rutas administrativas se conservan.

## Comprobación manual

1. Reiniciar el backend desde la raíz con `node backend/src/server.js`. Si ya está ejecutándose en el puerto 3000, detener ese proceso desde su terminal antes de iniciarlo de nuevo.
2. Abrir `http://localhost:3000/` o abrir `frontend/src/views/public/index.html` con Live Server en el puerto 5500/5501.
3. Iniciar sesión con una cuenta R002 activa asignada a una cooperativa activa. Las sesiones de versiones anteriores requieren volver a ingresar.
4. Revisar nombre, representante, logotipo, estadísticas, flota y próximas salidas. Sin registros deben aparecer ceros y estados vacíos. Buses y Resoluciones ANT deben abrir los módulos existentes; Rutas y frecuencias debe abrir la pestaña correspondiente.
5. Pulsar Actualizar. Con el backend detenido debe mostrarse «No disponible», no ceros nuevos; al reanudarlo es necesario volver a iniciar sesión.
6. Cerrar sesión y comprobar que una solicitud a `/api/auth/me` devuelve 401. Volver a abrir el panel no debe dar acceso a los datos.
7. Repetir con otra cooperativa. Su identidad y sus datos deben ser independientes. Alterar localStorage no debe permitir consultar la otra empresa.
8. Revisar a 1440, 1024, 768 y 390 píxeles: distribución de tarjetas, tabla desplazable, menú móvil, cierre mediante Escape y fondo.
9. Comprobar también Login directo, Login modal y las redirecciones de R001, R003, R004 y R005.

## Validación realizada

Las pruebas automatizadas usan fixtures en memoria y no escriben registros en SQL Server. Se verificaron también, en una instancia temporal del backend, las consultas reales de sesión, buses, frecuencias, hojas de ruta, resumen y cooperativas públicas. Todas devolvieron HTTP 200; la cooperativa verificada no tenía operaciones registradas.

La inspección visual en navegador quedó pendiente porque el servicio de acceso al navegador no estaba disponible. Los puntos de adaptación están definidos en CSS, pero requieren esa comprobación visual manual.

Ejecutar la batería desde la raíz: `node --test tests/*.test.cjs`.
