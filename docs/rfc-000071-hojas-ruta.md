# RFC-000071 · Hojas de ruta por categoría, lotes y tripulación

## Instalación y activación

1. Confirmar que CC-01 está desplegado, con `011`, `012` y `010_operacion_viajes.sql` aplicados.
2. Respaldar la base y conectar explícitamente a `BD_COOPERATIVAS_BUSES`.
3. Aplicar `013_hojas_ruta_lotes.sql` con `sqlcmd -b` o SSMS. Detenerse ante el primer error.
4. Clasificar buses y frecuencias antes de habilitar la validación estricta:
   - Asignar una o varias categorías a cada bus en `BUS_CATEGORIAS`.
   - Asignar `FRECUENCIAS.ID_CAT_OP` a cada frecuencia que se programará.
5. Completar `SALIDA_PLAN_UTC`, `LLEGADA_PLAN_UTC`, `ID_USU_CHO` e `ID_USU_CON` en las hojas no finalizadas que se vayan a operar.
6. Revisar que los códigos existentes no usen el prefijo `L`; la secuencia `SEQ_CC02_HOJA` genera identificadores `L####`.
7. Configurar `CC01_FRECUENCIAS=1` y `CC02_HOJAS_RUTA=1` en `backend/.env`, y reiniciar Express.
8. Usar la misma configuración en todas las instancias conectadas a la base.

Consultas previas:

```sql
SELECT f.ID_FRE, f.ID_CAT_OP FROM dbo.FRECUENCIAS f WHERE f.ID_CAT_OP IS NULL;
SELECT b.ID_BUS FROM dbo.BUSES b
WHERE NOT EXISTS (SELECT 1 FROM dbo.BUS_CATEGORIAS c WHERE c.ID_BUS=b.ID_BUS);
SELECT h.ID_HOJ, h.ID_FRE_PER FROM dbo.HOJAS_RUTAS h
WHERE h.EST_VIA_HOJ IN ('PROGRAMADO', 'PROGRAMADA', 'EN CURSO')
  AND (h.SALIDA_PLAN_UTC IS NULL OR h.LLEGADA_PLAN_UTC IS NULL
       OR h.ID_USU_CHO IS NULL OR h.ID_USU_CON IS NULL);
```

## Contrato

- `GET /api/coop/categorias-operativas` devuelve categorías, buses con sus categorías y frecuencias con `ID_CAT_OP`.
- `PUT /api/coop/buses/:id/categorias` recibe `{ categorias: [...] }` y reemplaza la matriz del bus.
- `PUT /api/coop/frecuencias/:id/categoria` recibe `{ categoria: "URBANO" }`.
- `GET /api/coop/hojas-ruta/disponibilidad?frecuenciaId=...&inicio=...&fin=...` devuelve categoría, buses, tripulación y cupo del día. Es orientativa.
- `POST /api/coop/hojas-ruta/lotes` recibe:

```json
{
  "idLote": "uuid-v4",
  "frecuenciaId": "F0001",
  "inicio": "2026-12-01T13:00:00.000Z",
  "fin": "2026-12-01T16:00:00.000Z",
  "filas": [
    { "busId": "B0001", "choferId": "U0001", "controladorId": "U0002", "observacion": "Opcional" }
  ]
}
```

- `201` crea el lote y devuelve las hojas. `200` repite un lote idéntico sin duplicar. `409 LOTE_REUTILIZADO` rechaza el mismo UUID con contenido distinto.
- Un lote admite entre 1 y 100 filas. Un error revierte todo el lote.
- Las horas se guardan en UTC y se muestran en `America/Guayaquil`. Los intervalos son semiabiertos `[inicio, fin)`.
- El bus debe tener la categoría de la frecuencia; el chofer debe ser `R006` y el controlador `R004`, activos y de la misma cooperativa.
- No se repite bus, chofer ni controlador dentro del lote ni contra hojas activas de otras frecuencias.
- Códigos de error principales:
  - `LOTES_NO_HABILITADOS` → 404.
  - `CC01_REQUERIDO` → 503.
  - `LOTE_INVALIDO` → 422, con `details.fila` cuando aplica.
  - `CATEGORIA_INCOMPATIBLE` → 422.
  - `FRECUENCIA_SIN_CATEGORIA` → 422.
  - `BUS_O_TRIPULACION_INVALIDOS` → 422.
  - `CATEGORIA_CON_SALIDAS` → 409.
  - `HORARIO_EN_CONFLICTO` → 409.
  - `LOTE_REUTILIZADO` → 409.
  - `OPERACION_OCUPADA` → 409.

## Pruebas

`node --test` ejecuta la regresión. Para SQL Server 2022 local, proveer `CC01_SQL_TEST_PASSWORD` mediante el entorno o el gestor de secretos, sin registrarlo en Git:

```powershell
$env:CC01_SQL_TEST_PASSWORD = "..."
node --test test/frecuencias-sql.test.cjs
```

La prueba crea y elimina una base `RFC70_TEST_*`, aplica el esquema y las migraciones `009` a `013`, y ejecuta `test/hojas-ruta-lotes.sql`. No apunta a la base del proyecto.

## Reversión

- Quitar `CC02_HOJAS_RUTA=1` y reiniciar Express. La UI vuelve al formulario individual y los endpoints de lote responden `404 LOTES_NO_HABILITADOS`.
- Conservar las tablas, secuencia, hojas creadas y evidencia de lotes.
- No borrar hojas confirmadas ni boletos para revertir solo la interfaz.
- Si se requiere reprogramar, conciliar pasajeros e identificadores antes de cualquier cambio.
- No volver al backend anterior sin una reversión coordinada de CC-01 y CC-02.
