# Página pública de cooperativa · etapa 2

La plantilla `frontend/src/views/public/cooperativa.html?id=CP001` muestra una cooperativa activa sin requerir sesión. Las tarjetas de la portada enlazan al perfil correspondiente. El Dashboard R002 ofrece «Ver mi página pública», construido con la cooperativa verificada por `/api/auth/me`, y conserva un enlace independiente a la página principal general.

## Datos existentes

Se consultan nombre, logotipo, teléfono y dirección de COOPERATIVAS. La galería utiliza únicamente imágenes registradas de buses activos de esa cooperativa. Las rutas, viajes y salidas se obtienen mediante las consultas existentes, con el filtro de cooperativa aplicado en SQL Server. Las salidas muestran fechas registradas, sin horas o precios supuestos.

La estructura actual no guarda portada, presentación, misión ni catálogo de servicios. El diseño deja estados neutros para ese contenido; no genera fotografías ni atribuye servicios a las empresas. La misión no se muestra sin contenido. Los colores están organizados en variables CSS para la etapa posterior; todavía no existe edición, publicación ni persistencia de personalización.

## Endpoints

- `GET /api/public/cooperativas/:id`: nuevo perfil de solo lectura. Expone ID, nombre, logotipo, dirección, teléfono y hasta seis imágenes de buses activos. No incluye RUC, usuarios ni credenciales. Devuelve 404 para una cooperativa inexistente o inactiva, 400 para identificadores no válidos y 503 si falla la consulta.
- `GET /api/public/salidas?cooperativa=CP001`: próximas salidas de esa cooperativa.
- `GET /api/usuario/viajes/rutas?cooperativa=CP001`: rutas del catálogo para esa cooperativa.
- `GET /api/usuario/viajes?cooperativa=CP001&origen=...&destino=...&fecha=...`: viajes del catálogo filtrados.
- `GET /api/usuario/reservas/:idHoja/asientos?cooperativa=CP001`: consulta de asientos que verifica que la hoja corresponda a esa empresa. La escritura de reservas conserva su lógica anterior.

El filtro es opcional en los endpoints existentes para mantener las búsquedas generales. Si se proporciona un identificador vacío o inválido se rechaza, sin convertirlo en una búsqueda general. Las consultas filtradas exigen cooperativa activa y concordancia entre la cooperativa de la resolución y la del bus.

El catálogo conserva cooperativa, origen, destino, fecha y pasajeros en el enlace a asientos y al pasar por Login. Los enlaces de regreso desde asientos mantienen esos filtros. Una nueva visita explícita a otra cooperativa no recupera una búsqueda anterior de una empresa distinta.

## Archivos de esta etapa

Nuevos:

- `frontend/src/views/public/cooperativa.html`
- `frontend/src/assets/public_cooperativa.css`
- `frontend/src/js/public_cooperativa.js`
- `tests/public-cooperativa.test.cjs`
- Este documento.

Modificados:

- `backend/src/controllers/publicController.js` y `backend/src/routes/publicRoutes.js`: perfil y salidas públicas.
- `backend/src/controllers/userViajesController.js`: filtro parametrizado de cooperativa.
- `backend/src/controllers/userReservaController.js`: filtro opcional en la lectura de asientos.
- `frontend/src/js/public_home.js`: tarjetas con enlaces individuales.
- `frontend/src/views/cooperativa/dashboard_coop.html` y `frontend/src/js/coop_dashboard.js`: acceso al perfil propio.
- `frontend/src/views/usuario/catalogo_viajes.html`, `frontend/src/assets/public_catalog.css` y `frontend/src/js/user_viajes.js`: enlace de regreso al perfil y conservación de filtros.
- `frontend/src/js/usuario_asientos.js`: lectura y navegación de regreso con el filtro.
- `tests/public-catalog.test.cjs` y `tests/cooperativa-dashboard.test.cjs`: pruebas de integración de los enlaces y filtros.

No se cambian las credenciales, las tablas, el Login ni las redirecciones de roles. No se ejecutaron migraciones ni operaciones de escritura en SQL Server para la validación.

## Cómo comprobarlo

1. Reiniciar el backend con `node backend/src/server.js` desde la raíz. Si ya está en ejecución, detenerlo primero desde su terminal.
2. Abrir `http://localhost:3000/` y seleccionar cada tarjeta de Cooperativas disponibles. Debe abrir el perfil del ID seleccionado.
3. Probar directamente `http://localhost:3000/src/views/public/cooperativa.html?id=CP001` y `http://localhost:3000/src/views/public/cooperativa.html?id=CP002`. No requieren Login.
4. Con Live Server, abrir `frontend/src/views/public/index.html` en el puerto 5500/5501 y usar las mismas tarjetas. El backend debe seguir activo en 3000.
5. Ingresar como R002: «Ver mi página pública» debe mostrar la empresa asignada a la cuenta; «Página principal del sistema» debe abrir la portada general.
6. Cuando haya viajes registrados, buscar una ruta, continuar como visitante e iniciar sesión R005. Verificar que la URL y las peticiones de rutas/viajes/asientos conserven `cooperativa=...`. Al volver desde asientos, deben conservarse también los filtros de búsqueda.
7. Probar un ID inexistente, como `ZZ999`: se muestra un aviso y enlace a la portada. Un fallo de API debe indicar que la consulta no está disponible, sin atribuirle cero registros.
8. Revisar a 1440, 1024, 768 y 390 píxeles: buscador, tarjetas, menú móvil y pie de página.

## Verificación

Se comprobaron CP001 (Coop Prueba) y CP002 (Cooperativa Loja) mediante el backend y SQL Server, sin cookies ni escrituras. Ambos perfiles devolvieron su propia identidad. Sus consultas actuales de rutas, viajes, salidas y fotografías devolvieron listas vacías. Por ello, la prueba real no puede demostrar reservas completas con viajes existentes; el aislamiento con registros diferentes se cubre además mediante fixtures exclusivos de pruebas.

Las pruebas comprueban los parámetros y restricciones SQL, perfil inexistente/inactivo, errores de consulta, enlaces de ambas tarjetas, enlace privado, paso por Login y rechazo de asientos de otra cooperativa. Ejecutar `node --test tests/*.test.cjs` desde la raíz.

La inspección visual automatizada quedó pendiente porque el servicio de acceso al navegador no estaba disponible.
