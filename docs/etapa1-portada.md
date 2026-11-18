# Página pública — Etapa 1

## Abrir

1. Con SQL Server disponible, reiniciar el backend existente para cargar las rutas nuevas: `node backend/src/server.js` desde la raíz. No iniciar otro proceso sobre el mismo puerto ocupado.
2. En VS Code, abrir `frontend/src/views/public/index.html` con **Open with Live Server**.
3. También se puede abrir `frontend/index.html` con Live Server o acceder a `http://localhost:3000/` con Express iniciado.

Las APIs usan `http://localhost:3000/api`, como el catálogo existente. Mantener el mismo host y puerto del frontend durante portada, catálogo y Login: localStorage y sessionStorage pertenecen al origen del navegador.

## Datos

- Origen/destino: API existente `/api/usuario/viajes/rutas`.
- Búsqueda: API existente `/api/usuario/viajes` con origen, destino y fecha.
- Disponibilidad: API existente `/api/usuario/reservas/:idHoja/asientos`. El catálogo cuenta estados `LIBRE` y filtra por cantidad de pasajeros. No bloquea asientos ni garantiza disponibilidad hasta reservar.
- Cooperativas: nueva API de lectura `/api/public/cooperativas`, solo ID, nombre y logo de cooperativas activas.
- Salidas: nueva API de lectura `/api/public/salidas`, hasta seis viajes programados desde la fecha actual en Ecuador, sin datos personales.

Se muestran hasta cuatro rutas reales. Si hay menos, no se completan con rutas ficticias. No se presentan precios, horas o duración no disponibles. Las fotografías ilustrativas no representan flota registrada ni prueban una ruta.

Si un logo registrado falla, se muestra la inicial de la cooperativa. Si no hay registros, se muestran estados vacíos; si falla una API, aparece un mensaje con reintento.

## Integración

El catálogo acepta parámetros `origen`, `destino`, `fecha` y `pasajeros`. Permite ajustar los filtros, incluido el número de pasajeros. Al pulsar Elegir asiento sin sesión R005, guarda la búsqueda en sessionStorage y abre el Login existente. Al regresar al catálogo, recupera la búsqueda. El Login y sus cinco redirecciones permanecen intactos. Los usuarios R005 continúan al selector existente y eligen la cantidad de asientos indicada. No se modificaron controladores de reserva, pago ni autenticación.

## Comprobación

Ejecutar `node --test tests/public-catalog.test.cjs`. Prueba filtros, cantidad disponible, paso de visitante a Login, continuidad para R005 y fallo de disponibilidad. Los datos simulados existen únicamente en esas pruebas.

Comprobación manual con registros disponibles:

1. Seleccionar origen, destino, fecha y dos pasajeros; confirmar que el catálogo conserva los valores.
2. Abrir una tarjeta de ruta y una próxima salida; comprobar filtros y fecha.
3. Pulsar Elegir asiento como visitante, iniciar sesión con una cuenta R005 y verificar que se recupera la búsqueda. Continuar sin confirmar una compra de prueba.
4. Verificar las redirecciones habituales del Login con los otros roles.
5. Comprobar menú, teclado, anclas y pie a 1440, 768 y 390 píxeles de ancho.
6. Con backend detenido, comprobar errores y reintentos. Con listas vacías, comprobar que no se muestran cifras o tarjetas inventadas.

Verificación realizada: sintaxis JavaScript, cuatro pruebas automatizadas, HTTP 200 de portada y nuevas APIs contra SQL Server. La base consultada devolvió dos cooperativas activas y ninguna ruta ni salida. No se insertaron datos ni se ejecutaron migraciones. El navegador automatizado no estuvo disponible: falta la revisión visual renderizada en escritorio y móvil.

## Recursos gráficos

Generados con la herramienta integrada ImageGen, sin fotografías descargadas de terceros. Guardados en `frontend/src/assets/images/`:

- `ecuador-bus.png`: banner de autobús blanco/rojo en paisaje andino.
- `route-1.png`: ilustración fotográfica de Quito.
- `route-2.png`: ilustración fotográfica de Cuenca.
- `route-3.png`: ilustración fotográfica de Guayaquil.
- `route-4.png`: ilustración fotográfica de un valle andino.
- `transport-logo.svg`: símbolo vectorial creado para esta portada; no es el emblema oficial de la UTA.

Prompt del banner:

> Use case: photorealistic-natural. Create a photorealistic panoramic website banner, 3:1 aspect ratio: beautiful Ecuadorian Andean highland landscape with snow capped Chimborazo-like volcano, green valleys and curving paved road. A modern white interprovincial touring coach with elegant red swooshes on the RIGHT third, fully visible, facing slightly toward viewer. Left half mostly landscape and deep shaded foreground for white website text overlay. Bright blue sky, natural daylight, professional travel photography aesthetic. No text, no logos, no watermark. Save image for project website.

Prompt de cada tarjeta, sustituyendo `{scene}` por las escenas siguientes:

> Use case: photorealistic-natural. Single landscape travel photograph-style illustration of {scene}. Wide landscape 3:2 composition for small website route card, bright natural daylight, professional travel photography. No words, no logos, no watermarks, no collage. This is illustrative scenery, not documentary proof of a route.

1. Quito historic colonial city rooftops and Andean hills
2. Cuenca Ecuador cathedral blue domes and colonial rooftops
3. Guayaquil colorful Las Peñas hillside beside the Guayas river
4. Ecuador green Andean valley and distant mountains
