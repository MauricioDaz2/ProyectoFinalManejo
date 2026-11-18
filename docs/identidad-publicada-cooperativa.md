# Identidad publicada de cooperativas

El Dashboard R002 consulta primero `/api/auth/me` y usa exclusivamente la cooperativa asignada por el servidor para leer `/api/public/cooperativas/:id`. Aplica el nombre comercial, logotipo, portada y colores de la versión publicada. No lee el borrador ni guarda colores en la sesión del navegador.

Las variables de color se aplican al área de contenido del Dashboard. La barra lateral «Transporte Cooperativas», el nombre del representante, las operaciones y los indicadores conservan su funcionamiento. Los colores claros utilizan texto oscuro para mantener la legibilidad. Sin publicación se mantiene la apariencia anterior; si falla la consulta se informa del problema y se retira la personalización cargada anteriormente.

La cabecera de la página pública y su vista previa privada cargan el logotipo antes de insertarlo, sin carga diferida. La carga diferida sobre una imagen todavía fuera del documento impedía que se mostrara. Los logotipos conservan `object-fit: contain`; las portadas usan `cover` y posición centrada. No se modifica el archivo original.

Las respuestas del perfil y de sus imágenes usan `Cache-Control: no-store`. Cada archivo conserva su identificador propio. El Dashboard relee la identidad al actualizar, regresar del historial o volver a una pestaña visible. Las imágenes pendientes de una versión anterior no pueden reemplazar las de la versión actual.

## Comprobación manual

1. Abre `frontend/src/views/auth/login.html` con Live Server e inicia sesión como R002.
2. En Personalización selecciona un logotipo de la biblioteca, una portada y colores. Guarda el borrador y abre la vista previa privada: el logotipo debe aparecer junto al nombre comercial.
3. Antes de publicar, comprueba que el Dashboard y la página pública conservan la identidad previamente publicada.
4. Publica y vuelve al Dashboard. El encabezado, banner y tarjeta de identidad deben mostrar la publicación. El representante y la barra lateral global deben conservar sus propios nombres.
5. Abre «Ver mi página pública» en una ventana privada, sin iniciar sesión. Repite tras actualizar, cerrar sesión e ingresar nuevamente. Si reinicias el backend, vuelve a iniciar sesión: las sesiones actuales están en memoria, pero la publicación permanece en SQL Server.
6. Prueba con otra cooperativa y comprueba que conserva su propia identidad. Revisa escritorio y móvil; los logotipos deben verse completos y las portadas adaptarse al espacio.

## Verificación realizada

- 83 pruebas automatizadas: carga del logotipo público y privado, aplicación de dos identidades distintas al Dashboard, separación entre publicación y borrador, rechazo de identidades ajenas, imágenes tardías, errores de consulta, subida/guardado/publicación, sesiones y redirecciones de los cinco roles.
- Consultas HTTP contra SQL Server real para CP001 y CP002, sin modificar sus registros. CP001 tiene publicación y un logotipo seleccionado únicamente en su borrador; CP002 no tiene publicación ni representante R002 activo. La segunda sesión R002 se verificó con datos aislados de prueba.
- Dos procesos nuevos del backend de prueba devolvieron los mismos perfiles públicos. Se comprobó la portada pública, el logotipo privado, la protección de imágenes, el cierre de una sesión temporal y la lectura con una nueva sesión.
- No se reinició el backend del usuario, no se publicaron sus borradores y no se ejecutaron migraciones. No fue posible inspeccionar visualmente el navegador mediante la herramienta disponible; la comprobación visual manual queda pendiente.

Archivos funcionales ajustados: `public_cooperativa.js`, `coop_dashboard.js`, `coop_dashboard.css`, `dashboard_coop.html` y `publicController.js`. Pruebas ajustadas: `public-cooperativa.test.cjs` y `cooperativa-dashboard.test.cjs`.
