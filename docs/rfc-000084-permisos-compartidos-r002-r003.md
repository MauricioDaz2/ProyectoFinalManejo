# RFC-000084: Habilitación de permisos operativos compartidos entre Cooperativa (`R002`) y Oficinista (`R003`) con aislamiento por empresa

## Objetivo
Permitir que las cuentas autorizadas de Cooperativa (`R002`) puedan operar los módulos de Ventanilla de Boletos y Validación de Reservas (`/api/oficinista/*`) de su propia empresa, y que el Oficinista (`R003`) pueda gestionar Frecuencias y Hojas de Ruta (`/api/coop/frecuencias*`, `/api/coop/hojas-ruta*`, `/api/operacion/asignaciones*`) de su cooperativa, manteniendo el aislamiento multi-empresa y la restricción de módulos administrativos exclusivos (`buses`, `personal`, `personalización`).

## Componentes implementados

1. **Matriz de permisos y sesión (`backend/src/security/permissions.js`):**
   - Incorpora los permisos operativos de `R003` (`rutas`, `salidas`, `ventanilla`) en `permissions.context` y `permissions.can`.
   - Habilita el permiso `ventanilla` para cuentas `R002` principales o gestores con permisos operativos configurados.

2. **Enrutamiento y control de alcance (`backend/src/server.js`, `backend/src/routes/tripOperationRoutes.js`, `backend/src/services/tripOperations.js`):**
   - Habilita `R002` y `R003` en `/api/coop` (conservando `/api/coop/personal` exclusivo para `R002` y validando cada recurso con `cooperativaScope` y `requirePermission`).
   - Habilita `R001`, `R002` y `R003` en `/api/oficinista` exigiendo permiso `ventanilla` para `R002` y aplicando aislamiento por empresa en `workerScope('oficinista')`.
   - Habilita `R003` en `/api/operacion/asignaciones` y `/api/operacion/asignaciones/opciones` con verificación de pertenencia del bus y la frecuencia a `user.cooperativaId`.

3. **Navegación y guardas de frontend (`frontend/src/js/transport_session.js`, `frontend/src/js/panel_layout.js`, `frontend/src/js/coop_navigation.js`, `frontend/src/js/coop_access.js`, `frontend/src/js/coop_resoluciones.js`, `frontend/src/js/coop_asignacion.js`):**
   - Permite acceso compartido de `R002` a las vistas de `oficinista/` y de `R003` a `cooperativa/resoluciones_ant.html`.
   - Actualiza los menús laterales de Cooperativa y Oficinista para navegar entre Frecuencias/Hojas de Ruta y Ventanilla/Validación.
