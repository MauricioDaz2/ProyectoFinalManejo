# Imágenes de cooperativas: dimensiones flexibles

La migración 004 se aplicó con autorización del usuario. Las dos restricciones quedaron activas y verificadas; el número de registros no cambió. Se comprobaron en SQL Server las dimensiones 1 × 1, 120 × 80 y 40 × 150 para PNG, JPEG y WebP dentro de una transacción de prueba revertida, sin conservar registros ni publicar contenido de prueba.

Las dimensiones recomendadas son orientativas. El backend acepta cualquier dimensión positiva dentro de los límites de seguridad, tanto para logo como para portada o galería. También acepta imágenes pequeñas aunque se vean pixeladas.

Recomendaciones del formulario:

- Logotipo: 600 × 600 px; se aceptan otras dimensiones.
- Portada: 1920 × 700 px; se adapta automáticamente al banner.
- Galería: 1200 × 800 px; se aceptan imágenes horizontales y verticales.

Se mantienen JPG, PNG y WebP sin animación, 8 MB por archivo, 24 megapíxeles y 32768 píxeles por lado como límites de seguridad. La validación comprueba la firma, el formato real y la decodificación completa. Los metadatos y bytes del original se conservan; no se recomprime, redimensiona ni recorta el archivo.

Los archivos nuevos usan un nombre UUID y una extensión derivada del formato verificado, nunca del nombre enviado por el usuario. Siguen en la carpeta privada y conservan los controles de propiedad y publicación. Se sirven con el MIME correspondiente, `nosniff` y una política de contenido restrictiva. Los WebP anteriores siguen funcionando, aunque no es posible recuperar los originales que el sistema anterior ya había convertido.

Portada y fotografías se encuadran con `object-fit: cover; object-position: center`. El logotipo usa `contain` centrado. Las reglas se aplican a la página pública, la vista previa privada y las miniaturas del editor. No modifican los archivos.

## Ajuste SQL necesario

La tabla instalada conserva `CK_IMAGEN_MIME` limitada a WebP y `CK_IMAGEN_DIMENSIONES` limitada a 64–6000 píxeles. Por ello es necesario revisar `database/scripts/004_cooperativa_imagenes_flexibles.sql` y aplicarlo únicamente con autorización.

El script reemplaza esas dos comprobaciones dentro de una transacción. No cambia columnas ni registros. Permite los tres MIME admitidos y dimensiones desde 1 píxel, manteniendo el límite total de píxeles. Usa `WITH CHECK` para verificar también los registros existentes y revierte si hay algún error. Para una instalación nueva se aplica primero 003 y después 004.

Mientras sigan las restricciones anteriores, las cargas incompatibles muestran `IMAGE_STORAGE_MIGRATION_REQUIRED`. El archivo temporal se retira y no se confirma un guardado falso.

## Archivos ajustados

- `backend/src/services/profileImages.js`: verificación sin transformación y sin mínimos de presentación.
- `backend/src/controllers/cooperativaProfileController.js`: conserva y sirve el original validado.
- `backend/src/repositories/cooperativaProfileRepository.js`: almacena y consulta el MIME real; identifica las restricciones SQL antiguas.
- `frontend/src/views/cooperativa/personalizar.html`: recomendaciones y límites de seguridad.
- `frontend/src/js/coop_personalizar.js`: identifica el uso de cada miniatura.
- `frontend/src/assets/coop_personalizar.css`, `frontend/src/assets/public_cooperativa.css`: encuadre visual por tipo.
- `database/scripts/004_cooperativa_imagenes_flexibles.sql`: ajuste de comprobaciones.
- `tests/profile-publication.test.cjs`: tamaños variados, conservación exacta del original y ciclo de publicación.

## Verificación

Se prueba un logo PNG de 1 × 1, una portada JPEG de 120 × 80, una galería WebP de 40 × 150, una imagen de 6001 píxeles de ancho y un JPEG con orientación EXIF. Se comprueba igualdad byte a byte antes y después de guardar y publicar. Los archivos incompletos, falsos, demasiado pesados o con excesivos píxeles siguen rechazándose.

Las pruebas de persistencia usan un adaptador transaccional aislado: no insertan empresas, imágenes ni publicaciones en la base real. Ejecutar `node --test tests/*.test.cjs`.

Después de aplicar 004 y reiniciar el backend, entrar como R002 en Personalización, seleccionar una imagen pequeña, subirla, abrir Vista previa y publicar. Comprobar que la portada y las fotografías llenan sus espacios y que el logo se ve completo. Repetir con orientación vertical y horizontal.
