# RFC-000087 · Rediseño del módulo de Pasajero, hora de salida y detalle «Ver más»

## Resumen del cambio

- **Backend:** `backend/src/controllers/userViajesController.js` (`GET /api/usuario/viajes`) ahora también devuelve `HORA_SAL_FRE`, `TAR_BAS_FRE`, `SALIDA_PLAN_UTC` e `IMG_URL_BUS`, además de placa, pisos, total de asientos y nombre de la cooperativa. Cada columna se detecta con `COL_LENGTH`. Si falta la migración 010 o la 015, la consulta devuelve `NULL` y no falla.
- **Catálogo:** `frontend/src/js/user_viajes.js` muestra en cada viaje:
  - la cooperativa, la ruta y la fecha;
  - la **hora de salida**: `SALIDA_PLAN_UTC` convertida a la hora de Ecuador o, si no existe, `HORA_SAL_FRE`;
  - el **precio base**;
  - un botón **«Ver más»**, que despliega la foto real del bus (`IMG_URL_BUS`), la placa, los pisos y los asientos disponibles.
  
  Si falta algún dato se muestra «Por confirmar» o «Fotografía no disponible».
- **Diseño:** la nueva hoja `frontend/src/assets/passenger_modern.css` se carga en `catalogo_viajes.html`, `seleccion_asientos.html` y `mis_boletos.html`. Usa la paleta y la tipografía de la portada, tarjetas y estados coherentes, y es responsive.
- **Mis boletos:** `user_boletos.js` usa tarjetas con clases (`ticket-card`) en lugar de estilos en línea, y cancela la reserva mediante delegación de eventos (`data-cancelar-boleto`) en lugar de `onclick`.

No requiere migraciones nuevas: reutiliza las columnas de las migraciones 010 (`SALIDA_PLAN_UTC`) y 015 (`HORA_SAL_FRE`, `TAR_BAS_FRE`), y la columna existente `BUSES.IMG_URL_BUS`.

## Verificación

Al buscar una ruta en `catalogo_viajes.html`, cada viaje muestra la fecha, la hora de salida y el precio base. El botón «Ver más» abre el detalle con la foto y la placa del bus.

## Pruebas

```powershell
node --test
```

`test/rfc-000087-pasajero.test.cjs` cubre:

- Las columnas nuevas de la consulta, con y sin las migraciones 010 y 015.
- Las tarjetas del catálogo: la hora de Ecuador, los valores faltantes y el escapado de HTML.
- El despliegue de «Ver más».
- La carga del diseño en las tres vistas y la eliminación de estilos en línea en «Mis boletos».

## Reversión

Revertir los commits de la rama. No hay cambios en la base de datos.
