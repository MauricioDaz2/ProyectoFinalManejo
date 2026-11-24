# RFC-000078 · Simplificación de Resoluciones ANT y eliminación de cupos máximos de frecuencias

## Resumen del cambio

Por observación de la revisión docente y aprobación del Comité de Control de Cambios (CCC), se elimina el módulo independiente de **Resoluciones ANT** y las restricciones de **cupo máximo de frecuencias** (`CUP_FRE_MAX`) y **cupos diarios** (`MAX_UNIDADES`, `MAX_PASAJEROS`):

- Cada frecuencia se vincula directamente con su cooperativa mediante `FRECUENCIAS.ID_COP_PER` (FK a `COOPERATIVAS.ID_COP`).
- El respaldo administrativo ANT se registra como un campo simple **Número de resolución ANT** (`FRECUENCIAS.NUM_RES_FRE`, hasta 50 caracteres) dentro del propio formulario de frecuencias.
- El origen y destino en el formulario de frecuencias utilizan un selector en cascada de las **24 provincias y 222 cantones/ciudades de Ecuador** (`frontend/src/data/ecuador_ubicaciones.json`) con buscador integrado, sin bloqueo para rutas intercantonales y con compatibilidad para registros previos.
- La programación de salidas en lote (**CC-02 / RFC-000071**) queda desacoplada de `CC01_FRECUENCIAS` y mantiene activas la validación de categorías operativas de flota y el control de cruces de bus/tripulación.
- La gestión y programación de **Hojas de Ruta** pasa a ser exclusiva del panel de **Cooperativas (`R002`)**: se retiró el módulo `hojas_ruta.html` del menú y panel de Administración (`R001`, redirigiendo al dashboard) y se bloquearon con `403` las rutas de escritura bajo `/api/admin/rutas/*`, conservando únicamente consultas de solo lectura para métricas globales del dashboard administrativo.

## Instalación y migración

1. Respaldar `BD_COOPERATIVAS_BUSES` antes del despliegue.
2. Aplicar la migración aditiva y no destructiva `database/scripts/014_simplificar_frecuencias_sin_resoluciones.sql` con `sqlcmd -b` o SSMS:
   - Agrega `ID_COP_PER` y `NUM_RES_FRE` a `dbo.FRECUENCIAS` y migra los datos desde `RESOLUCIONES_ANT`.
   - Convierte `ID_RES_PER` en nullable conservando la tabla histórica `RESOLUCIONES_ANT`.
   - Retira `TR_CC_CupoResolucion` y `TR_CC_Frecuencias`; simplifica `fn_CC_VigenciaFrecuencia`, `fn_CC_HojaVigente`, `TR_CC_Hojas`, `TR_CC_Boletos` y `TR_CC02_Programacion`.
3. Retirar `CC01_FRECUENCIAS=1` de `backend/.env` (puede mantenerse `CC02_HOJAS_RUTA=1`) y reiniciar Express.

## Contrato API

- `GET/POST/PUT/DELETE /api/coop/resoluciones` y `GET /api/coop/resoluciones-opciones` → `410 Gone` (`MODULO_RESOLUCIONES_ELIMINADO`).
- `GET /api/coop/catalogo-territorial` y `GET /api/coop/frecuencias/:id/disponibilidad` → `410 Gone` (`CONTROL_CUPOS_ELIMINADO`).
- `GET /api/coop/frecuencias` → devuelve frecuencias de la cooperativa autenticada con `NUM_RES_FRE`, `ID_COP_PER`, `EST_VIGENCIA` y categoría operativa (si CC-02 está activo).
- `POST /api/coop/frecuencias` y `PUT /api/coop/frecuencias/:id` → reciben `{ CIU_ORI_FRE, CIU_DES_FRE, FEC_HOR_INI_FRE, FEC_HOR_FIN_FRE, EST_RES, NUM_RES_FRE }`.
- `GET /api/coop/hojas-ruta/disponibilidad` y `POST /api/coop/hojas-ruta/lotes` → operan con `CC02_HOJAS_RUTA=1` sin requerir `CC01_FRECUENCIAS=1` ni consultar cupos diarios.

## Pruebas

```powershell
$env:CC01_SQL_TEST_PASSWORD = "..."
node --test
```

## Reversión

La migración `014` conserva la tabla `RESOLUCIONES_ANT` y la columna `ID_RES_PER`. Si no se han creado frecuencias sin `ID_RES_PER` (o tras asignarles resolución / restaurar el respaldo `.bak`), ejecutar `database/scripts/014_reversion_frecuencias_resoluciones.sql` seguido de `011`, `012` y `013`, y revertir al commit previo.
