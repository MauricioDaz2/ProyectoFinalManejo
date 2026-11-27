# RFC-000085 · Frecuencias destacadas / publicidad patrocinada

## Resumen del cambio

Permite monetizar posiciones destacadas en la portada mediante un cupo que controla el Administrador. No hay pasarela de pago dentro de la app: el cupo se registra después de contratarlo fuera del sistema.

- **BD:** `COOPERATIVAS.LIM_DES_COP int NOT NULL DEFAULT 0` (CHECK de 0 a 50) y `FRECUENCIAS.ES_DESTACADA bit NOT NULL DEFAULT 0`, con un índice filtrado y el trigger `TR_RFC085_CupoDestacadas`, que impide superar el cupo también desde la base de datos.
- **Admin (R001):** en `cooperativas.html` aparece la columna «Destacadas», donde se edita el límite de cada cooperativa (`PUT /api/admin/cooperativas/:id/destacadas`).
- **Cooperativa (R002):** en `resoluciones_ant.html` cada frecuencia tiene una estrella ★ para marcarla o desmarcarla (`PUT /api/coop/frecuencias/:id/destacada`). Al superar el límite responde `409` e indica cuántas tiene contratadas.
- **Portada:** «Rutas destacadas» consulta `GET /api/public/destacadas` y muestra solo las frecuencias destacadas de cooperativas activas, con la insignia «★ Destacado · Patrocinado».

## Instalación

1. Respaldar `BD_COOPERATIVAS_BUSES`.
2. Aplicar `database/scripts/019_frecuencias_destacadas.sql` con `sqlcmd -b` o SSMS. Requiere de 014 a 018, es transaccional e idempotente y no altera datos históricos.
3. Reiniciar Express.

Sin la migración, el sistema funciona como antes: la columna y la estrella no se muestran, la portada indica que no hay destacadas y las escrituras responden `409 DESTACADAS_NO_INSTALADAS`.

## Contrato API

| Método | Ruta | Rol | Cuerpo | Respuesta |
|---|---|---|---|---|
| GET | `/api/admin/cooperativas/:id/destacadas` | R001 | — | `{ disponible, limite, usadas }` |
| PUT | `/api/admin/cooperativas/:id/destacadas` | R001 | `{ limite: 0..50 }` | `{ limite, usadas }` o `409` si el límite es menor que las destacadas en uso |
| PUT | `/api/coop/frecuencias/:id/destacada` | R002 | `{ destacada: true\|false }` | `{ destacada, limite, usadas }` o `409 CUPO_DESTACADAS_EXCEDIDO` |
| GET | `/api/coop/frecuencias` | R002 | — | Incluye `ES_DESTACADA` en cada frecuencia y `destacadas: { disponible, limite, usadas }` |
| GET | `/api/public/destacadas` | Público | — | `{ destacadas: [...] }` (máximo 8) |

El aislamiento multi-cooperativa se aplica con `cooperativaScope` (propiedad de `:id`) y con el `UPDATE ... WHERE ID_COP_PER = @cooperativa` en una transacción `SERIALIZABLE`.

## Verificación

1. El Admin habilita 2 destacadas para CP001.
2. CP001 marca 2 frecuencias. Al intentar marcar una 3.ª recibe «Ya usas 2 de 2 frecuencias destacadas contratadas».
3. Al desmarcar una, puede marcar otra.
4. La portada muestra solo las destacadas, con su insignia.

## Pruebas

```powershell
node --test
```

`test/rfc-000085-destacadas.test.cjs` cubre:

- Las reglas de cupo y el escenario CP001.
- El aislamiento entre cooperativas, el límite menor que las destacadas en uso y el funcionamiento sin migración.
- El análisis estático de la migración 019 y de su reversión.
- Las rutas, la interfaz de la estrella y la portada.

## Reversión

Revertir los commits y aplicar `database/scripts/019_reversion_frecuencias_destacadas.sql`, que elimina el trigger, el índice, las restricciones y las columnas. También se puede restaurar el respaldo `.bak`.
