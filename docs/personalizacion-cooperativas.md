# Etapa 3 · personalización y publicación

Actualización posterior: la carga flexible de imágenes y la conservación del archivo original se describen en `docs/imagenes-flexibles.md`. Requieren el ajuste de restricciones `004_cooperativa_imagenes_flexibles.sql` después de 003. Los detalles de conversión y dimensiones que figuran abajo documentan la implementación inicial y quedan sustituidos por esa actualización.

La implementación conserva los cambios de las etapas anteriores y trabaja en `feature/redisenio-pagina`. La migración está preparada, pero **no se ha ejecutado**. No se modificaron `.env`, credenciales ni registros de SQL Server.

## Disponible ahora

El Dashboard R002 abre `frontend/src/views/cooperativa/personalizar.html` desde sus cuatro opciones y su menú. El editor contiene nombre comercial, descripción, misión, contacto público, servicios, colores y selección local de imágenes. Se mantienen separados de los datos legales administrados por R001.

Antes de instalar las tablas, el editor informa que la persistencia está pendiente. Permite ver el formulario y una imagen seleccionada localmente, pero bloquea subir archivos, guardar, publicar y abrir la vista previa del borrador. No confirma guardados ficticios. Las páginas públicas existentes mantienen su información anterior.

El cierre de sesión ya utiliza `/api/auth/logout`, elimina la cookie desde el servidor, limpia `usuario`, el antiguo `token` y la búsqueda pendiente del navegador y vuelve a `../public/index.html`. Esa ruta funciona desde los paneles de los cinco roles tanto con Express como con Live Server. Si el servidor no confirma el cierre, se muestra un error y se permite reintentar. El Login directo y sus destinos por rol no cambian.

## Migración que requiere aprobación

Archivo: `database/scripts/003_cooperativa_perfiles.sql`.

El script crea dos tablas complementarias, sus claves, comprobaciones e índice. No inserta ejemplos, no actualiza COOPERATIVAS y no borra tablas ni registros. Se ejecuta dentro de una transacción con rollback si hay error. Omite la creación de cada tabla si ya existe; no transforma una tabla existente con una estructura distinta.

**COOPERATIVA_PERFILES**: una fila por cooperativa.

| Campo | Uso |
| --- | --- |
| `ID_COP` varchar(5) | Clave primaria y clave externa a `COOPERATIVAS.ID_COP`. |
| `BORRADOR_JSON` nvarchar(max) | Contenido privado que puede seguir editándose. Debe ser JSON válido. |
| `PUBLICADO_JSON` nvarchar(max), nullable | Copia independiente del contenido aprobado con «Guardar y publicar». Nulo antes de publicar. |
| `REVISION` int | Versión creciente para impedir que una pestaña antigua sobrescriba cambios recientes. |
| `ACTUALIZADO_UTC` datetime2(3) | Fecha de la última escritura del perfil, en UTC. |
| `PUBLICADO_UTC` datetime2(3), nullable | Fecha de la última publicación confirmada, en UTC. |

Ambos documentos JSON contienen exclusivamente estos campos, validados por el backend:

| Campo JSON | Límite / contenido |
| --- | --- |
| `nombre` | Nombre comercial obligatorio, hasta 80 caracteres. |
| `descripcion` | Presentación, hasta 2000 caracteres. |
| `mision` | Texto opcional, hasta 1000 caracteres. |
| `telefono`, `direccion`, `correo` | Contacto público; máximos 40, 240 y 120 caracteres. Correo validado si se proporciona. |
| `principal`, `secundario` | Colores `#RRGGBB`; la página adapta el color del texto del encabezado y botones. |
| `logo`, `portada` | Identificadores de imágenes propias del tipo correspondiente, o nulo. Sin logo personalizado se conserva el administrativo existente. |
| `galeria` | Hasta seis identificadores distintos de imágenes propias. |
| `servicios` | Hasta ocho textos de 100 caracteres cada uno. |

No hace falta una tercera tabla de servicios para esta etapa: se publican junto con el resto del contenido en una sola operación. Las referencias de imágenes dentro del JSON se comprueban en el servidor, dentro de la transacción; no son claves externas SQL individuales.

**COOPERATIVA_IMAGENES**: biblioteca privada de archivos subidos.

| Campo | Uso |
| --- | --- |
| `ID_IMG` uniqueidentifier | Identificador aleatorio de cada imagen. |
| `ID_COP` varchar(5) | Propietaria; clave externa a COOPERATIVAS. |
| `TIPO` varchar(10) | `logo`, `portada` o `galeria`. |
| `ARCHIVO` varchar(50) | Nombre generado por el servidor, único; no conserva el nombre enviado por el usuario. |
| `MIME` varchar(20) | `image/webp`, formato del archivo procesado. |
| `BYTES` int | Tamaño real del archivo procesado. |
| `ANCHO`, `ALTO` int | Dimensiones verificadas. |
| `CREADO_UTC` datetime2(3) | Fecha de alta en UTC. |

El índice por cooperativa y fecha permite listar su biblioteca y comprobar la cuota. No se usa eliminación en cascada.

## Flujo después de instalar la migración

1. El representante entra desde su Dashboard. El servidor obtiene la cooperativa de su sesión; el formulario no contiene un ID editable de empresa.
2. Selecciona imágenes y revisa las miniaturas locales. «Subir a biblioteca privada» valida y almacena cada archivo. Subir no publica. Puede reutilizar imágenes de su biblioteca.
3. «Guardar borrador» persiste únicamente la copia privada. Si quedan archivos locales sin subir, se avisa antes de guardar.
4. «Vista previa» guarda el borrador y abre `cooperativa.html?preview=1` dentro del editor. La plantilla, estilos y renderizador son los mismos de la página pública; la consulta de datos y las imágenes requieren sesión R002 y usan exclusivamente su empresa.
5. «Guardar y publicar» valida referencias y revisión y guarda las copias privada y pública en una transacción SQL. Solo confirma éxito después del commit.
6. La página pública y las tarjetas de cooperativas de la portada leen la versión publicada. Nuevos cambios en el borrador no alteran esa versión.

No se ha probado todavía este ciclo contra las nuevas tablas reales, porque instalarlas requiere autorización. Se comprobó con un adaptador de persistencia transaccional exclusivo de pruebas.

## Imágenes y acceso

Los archivos se almacenan en `backend/private_media/cooperativas`, fuera de `/uploads` y del directorio estático del frontend; la carpeta está excluida de Git. Debe incluirse junto con SQL Server en los respaldos de los contenidos una vez habilitados.

Se aceptan JPG, PNG y WebP sin animación, hasta 8 MB por archivo, 6000 píxeles por lado y 24 megapíxeles. Mínimos: logo 64 × 64; portada 800 × 240; galería 320 × 200. Se comprueba la firma del archivo, se inspecciona su formato real y se decodifica completo antes de volver a codificarlo como WebP sin conservar metadatos del original. Se utiliza [Sharp](https://sharp.pixelplumbing.com/api-constructor/), añadido a `package.json` y `package-lock.json`.

La biblioteca admite hasta 40 archivos y 120 MB por cooperativa. Se pueden eliminar archivos no usados; el servidor rechaza eliminar imágenes presentes en el borrador o en la publicación. Para retirar una imagen publicada hay que publicar primero un contenido que ya no la utilice.

La ruta privada verifica sesión, rol y propiedad. La ruta pública sirve únicamente imágenes referenciadas en la versión publicada de una cooperativa activa. Conocer un UUID no concede acceso. Las respuestas privadas y los archivos usan `Cache-Control: no-store`.

Las sesiones continúan en memoria del proceso, como en la etapa anterior; reiniciar Node requiere iniciar sesión otra vez. No se modificó la comparación de credenciales existente.

## Archivos principales

Nuevos de esta etapa:

- `database/scripts/003_cooperativa_perfiles.sql`
- `backend/src/repositories/cooperativaProfileRepository.js`
- `backend/src/services/profileContent.js`, `profileImages.js`
- `backend/src/controllers/cooperativaProfileController.js`
- `backend/src/routes/cooperativaProfileRoutes.js`
- `frontend/src/views/cooperativa/personalizar.html`
- `frontend/src/assets/coop_personalizar.css`
- `frontend/src/js/coop_personalizar.js`
- `tests/profile-publication.test.cjs`, `tests/profile-editor.test.cjs`
- Este documento.

Integraciones modificadas:

- `.gitignore`, `package.json`, `package-lock.json`.
- `backend/src/server.js`, `middleware/session.js`, `controllers/publicController.js`, `routes/publicRoutes.js`.
- Dashboard R002: `dashboard_coop.html`, `coop_dashboard.css`.
- Plantilla pública: `cooperativa.html`, `public_cooperativa.js`, `public_cooperativa.css`.
- Cierre de sesión: `transport_session.js`, `api.js`, `admin_layout.js`, `admin_operaciones.js`, `user_viajes.js`, `views/controlador/panel.html`.
- Pruebas existentes: `cooperativa-security.test.cjs`, `public-cooperativa.test.cjs`.

Los demás cambios locales que ya estaban presentes se conservan.

## Comprobaciones y prueba manual

Ejecutar `node --test tests/*.test.cjs` desde la raíz. Las pruebas cubren campos permitidos, formatos y dimensiones de imágenes, aislamiento de dos cooperativas, subida privada, borrador, publicación, transacciones fallidas, conflictos de revisión, referencia de imágenes ajenas, contenido publicado y cierre de sesión de los cinco roles desde ambos servidores.

Con SQL Server real se verificó mediante consultas de lectura que no existen las tablas nuevas, que los perfiles CP001/CP002 siguen respondiendo y que el editor devuelve `503 MIGRATION_REQUIRED`. En una instancia temporal del backend se comprobó que cerrar sesión elimina la cookie y que cada sesión anterior recibe 401. No se alteraron registros reales ni se ejecutaron migraciones.

Para revisar ahora: reiniciar el backend desde su terminal, abrir la portada, iniciar sesión R002 y entrar en Personalización. Debe aparecer el aviso de migración pendiente. Comprobar también que Cerrar sesión vuelve a la portada. Con Live Server usar 5500 o 5501 y mantener el backend en 3000.

Después de autorizar e instalar el SQL: volver a entrar, probar dos cooperativas con contenidos diferentes, guardar un borrador y abrir su vista previa; comprobar que la página pública aún conserva la versión anterior. Publicar y recargar la página pública. Repetir editando sin publicar y verificar el aislamiento. La revisión visual en navegador queda pendiente si el servicio de acceso al navegador no está disponible.
