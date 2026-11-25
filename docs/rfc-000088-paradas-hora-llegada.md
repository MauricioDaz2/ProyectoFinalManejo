# RFC-000088: Configuración de paradas intermedias (Directo vs. Con paradas) y hora estimada de llegada en Frecuencias

## Objetivo
Incorporar la hora estimada de llegada (`HORA_LLE_FRE`) y la modalidad del recorrido (`ES_DIRECTA`: **Directo** vs. **Con paradas intermedias**) en el módulo de Rutas y Frecuencias de la cooperativa, persistiendo las paradas intermedias ordenadas en `dbo.FRECUENCIA_PARADAS` de forma compatible con el portal operativo del chofer y controlador (`tripOperations.js` / `tripRules.js`).

## Componentes implementados

1. **Migración de Base de Datos (`database/scripts/016_frecuencias_hora_llegada_paradas.sql`):**
   - Añade `HORA_LLE_FRE varchar(5) NULL` y `ES_DIRECTA bit NOT NULL DEFAULT (1)` en `dbo.FRECUENCIAS`.
   - Garantiza la existencia de `dbo.FRECUENCIA_PARADAS (ID_FRE, ORDEN, NOMBRE, COMERCIAL)` e inicializa valores consistentes en registros históricos.

2. **Backend (`backend/src/controllers/coopBusController.js` y `backend/src/routes/coopBusRoutes.js`):**
   - Detección dinámica de `FRE_LLEGADA_PARADAS` y `TABLA_FRE_PARADAS` en `columnasEsquemaExtendidas`.
   - Normalización y validación de `HORA_LLE_FRE`, `ES_DIRECTA` y `PARADAS` (impidiendo paradas vacías en modalidad Con paradas, duplicadas o iguales a `CIU_ORI_FRE` / `CIU_DES_FRE`).
   - Persistencia ordenada en `dbo.FRECUENCIA_PARADAS` incluyendo extremo inicial (`ORDEN = 0`, origen) y extremo final (`ORDEN = N + 1`, destino) para compatibilidad directa con `tripRules.itinerary`.
   - Endpoints `GET /api/coop/frecuencias/:id/paradas` y `PUT /api/coop/frecuencias/:id/paradas` además de soporte integrado en `POST /api/coop/frecuencias` y `PUT /api/coop/frecuencias/:id`.
   - Limpieza previa de `dbo.FRECUENCIA_PARADAS` en `DELETE /api/coop/frecuencias/:id` cuando la frecuencia no tiene hojas de ruta asociadas.

3. **Frontend (`frontend/src/views/cooperativa/resoluciones_ant.html`, `frontend/src/js/coop_resoluciones.js`, `frontend/src/assets/coop_dashboard.css`):**
   - Campo `Hora estimada de llegada` (`#horaLlegadaFrecuencia`) y selector `Modalidad de recorrido` (`#tipoTrayectoFrecuencia`: Directo vs. Con paradas intermedias).
   - Constructor dinámico de paradas (`#seccionParadasFrecuencia`) con selector de ciudades/cantones (`#paradaIntermediaCiudad`), indicador de parada comercial (`#paradaIntermediaComercial`) y lista ordenada (`#listaParadasFrecuencia`) con acciones para subir (`↑`), bajar (`↓`) y quitar paradas.
   - Visualización en tabla de frecuencias del rango horario (`HORA_SAL_FRE → HORA_LLE_FRE`) y resumen de paradas o etiqueta `Directo`.
