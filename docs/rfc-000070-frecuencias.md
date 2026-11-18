# RFC-000070 · Frecuencias, resoluciones ANT y cupos

## Instalación y activación

1. Desplegar primero el backend de esta RFC **sin** `CC01_FRECUENCIAS=1`. Los escritores nuevos son compatibles con las protecciones de base de datos; el backend anterior usa `OUTPUT` directo en algunas tablas, incompatible con los nuevos triggers.
2. Respaldar la base y comprobar la restauración en un entorno de pruebas. Conectarse explícitamente a `BD_COOPERATIVAS_BUSES` y aplicar `011_frecuencias_vigencia.sql`, seguido de `012_frecuencias_catalogo_cupos.sql`. La `012` requiere también `010_operacion_viajes.sql`. Usar SSMS o `sqlcmd -b` y detenerse ante el primer error. Los borradores del formulario **no** son migraciones.
3. Cargar provincias, cantones y parroquias con códigos territoriales aprobados, en ese orden; luego cargar `CAT_PUNTOS_TRAYECTO` con las paradas utilizadas por Operaciones. Cada `ETIQUETA` es única y de hasta 15 caracteres: se usa para mantener compatibilidad con catálogos, paradas y boletos históricos. No cambiar una etiqueta con boletos emitidos sin conciliar el itinerario. La prueba SQL usa datos sintéticos, no importa un catálogo oficial.
4. Antes de activar, conciliar permisos con Operaciones: fechas legales y revocación en `RESOLUCIONES_ANT`, luego ambos puntos y al menos un máximo en `FRECUENCIAS`. Al asignar puntos, actualizar `CIU_ORI_FRE` y `CIU_DES_FRE` con sus respectivas `ETIQUETA` en la misma sentencia. No deducir el inicio legal de la fecha de emisión. Un fin nulo con inicio registrado significa que el permiso no caduca; un inicio nulo se reporta como pendiente. Revisar especialmente hojas futuras y boletos asociados a frecuencias que no podrán publicarse; no se borran ni se anulan automáticamente.
5. Configurar `CC01_FRECUENCIAS=1` en `backend/.env` y reiniciar Express. Ejecutar primero en pruebas y luego monitorear la publicación, la programación, las ventas y los conflictos `409`. Usar la misma configuración en todas las instancias conectadas a una base. El usuario SQL de la aplicación no debe tener permisos para deshabilitar protecciones ni alterar el esquema.

Consultas previas al corte:

```sql
SELECT ID_RES, ID_COP_PER FROM dbo.RESOLUCIONES_ANT WHERE FEC_INI_VIG_RES IS NULL;
SELECT ID_FRE, ID_RES_PER FROM dbo.FRECUENCIAS WHERE ID_PUN_ORI IS NULL;
SELECT h.ID_HOJ, h.FEC_PRO_HOJ, h.ID_FRE_PER
FROM dbo.HOJAS_RUTAS h
WHERE h.FEC_PRO_HOJ >= dbo.fn_CC_FechaEcuador(SYSUTCDATETIME())
  AND h.EST_VIA_HOJ IN ('PROGRAMADO', 'PROGRAMADA')
  AND NOT EXISTS (SELECT 1 FROM dbo.fn_CC_HojaVigente(h.ID_HOJ, NULL));
```

## Contrato y reglas

- `/api/coop/resoluciones` conserva sus campos e incorpora `FEC_INI_VIG_RES`, `FEC_FIN_VIG_RES` y `REVOCADA_RES`. Las dos fechas de vigencia son inclusivas. Suspender una frecuencia o revocar su permiso bloquea nuevas operaciones sin borrar el historial.
- `/api/coop/frecuencias` acepta `ID_PUN_ORI`, `ID_PUN_DES`, `MAX_UNIDADES` y `MAX_PASAJEROS` cuando el control está habilitado. Al menos un máximo es obligatorio y ambos se cuentan por día de salida en Ecuador continental. Entre provincias distintas se clasifica como interprovincial; dos puntos de un cantón, intracantonal. Se rechaza el trayecto intercantonal dentro de una misma provincia mientras no se acuerde esa categoría.
- `GET /api/coop/catalogo-territorial` alimenta los selectores en cascada. Es posible pedir un nivel (`provincia`, `canton`, `parroquia`, `punto`) con `nivel` y el código de su padre (`padreId`, salvo para provincia), o consultar los puntos con su jerarquía sin filtros.
- `GET /api/coop/frecuencias/:id/disponibilidad?fecha=AAAA-MM-DD` devuelve vigencia, máximos, consumo y saldo. Un máximo o saldo `null` significa que esa dimensión no tiene límite específico. No sustituye la disponibilidad de asientos ni garantiza que una operación futura vaya a confirmarse.
- `CUP_FRE_MAX` sigue limitando el número de frecuencias de la resolución. El cupo de unidades cuenta buses operativos distintos, incluido el reemplazo efectivo, por frecuencia y fecha. El cupo de pasajeros cuenta boletos que retienen plaza, incluidos los usados, y libera plazas al confirmar una cancelación, anulación, rechazo o vencimiento. El bloqueo vive hasta el `COMMIT`; una sesión concurrente no puede ocupar el último cupo simultáneamente. No se debe cambiar el bus, fecha o frecuencia de una hoja con boletos activos sin un proceso de reprogramación.
- Los conflictos de uso devuelven `409` con `code` estable. El formulario público y ventanilla muestran el menor valor entre cupo y asientos físicos libres. Se conserva bloqueada la venta a bordo: el sistema todavía no tiene una tarifa por tramo y no se habilitan cobros con esta RFC.

## Pruebas

`node --test` corre la regresión. Para incluir SQL Server 2022, local en el puerto 1433, proveer `CC01_SQL_TEST_PASSWORD` mediante el gestor de secretos o el entorno, sin registrarlo en Git. Luego ejecutar `node --test test/frecuencias-sql.test.cjs`. La prueba crea y elimina su propia base `RFC70_TEST_*` y ejecuta migraciones, fechas límite, sustituciones, cupos concurrentes y rutas HTTP reales. No apunta a la base del proyecto.

## Reversión

Deshabilitar el control de aplicación solo con aprobación de Operaciones y detener temporalmente las nuevas operaciones si hay riesgo de incumplimiento. Las protecciones SQL siguen aplicándose a las frecuencias configuradas; nunca volver al backend anterior sin una reversión coordinada. Conservar columnas, permisos, boletos e historial y conciliar las transacciones posteriores al despliegue. No hacer una restauración destructiva para revertir solo la interfaz.
