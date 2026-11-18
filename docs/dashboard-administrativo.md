# Dashboard administrativo

El rediseño se limita a `frontend/src/views/admin/dashboard.html`, `frontend/src/assets/admin_dashboard.css` y `frontend/src/js/admin_dashboard.js`. Añade `frontend/src/js/admin_dashboard_data.js` para cálculos verificables. No cambia `admin_layout.css` ni `admin_layout.js`: se conservan su control de sesión y menú móvil. Los estilos nuevos están limitados a `.dashboard-page`. El banner reutiliza `assets/images/ecuador-bus.png` sin modificarlo.

## Consultas y definición de los datos

| Información | API existente | Criterio |
|---|---|---|
| Cooperativas | `/api/admin/cooperativas` | Total registrado; activas con `EST_COP = 1` como desglose. |
| Buses | `/api/admin/parada/flota` | Cantidad de unidades devueltas. No se usa su campo `TOTAL_ASIENTOS` para ocupación. |
| Personal operativo | `/api/admin/usuarios` | R003 + R004; ambos conteos originales se conservan visibles. |
| Rutas | `/api/admin/rutas/frecuencias` | Pares únicos de origen/destino entre frecuencias registradas; el sentido inverso es otra ruta. No se etiquetan como activas. |
| Próximas salidas | `/api/admin/rutas/hojas` | Hasta cinco hojas PROGRAMADA/PROGRAMADO desde hoy, ordenadas por fecha e ID. Se muestra el estado devuelto por la API. Sin horas inventadas. |
| Estado operativo | Listados de cooperativas, buses, usuarios y frecuencias | Cooperativas activas/inactivas, ausencia de buses o rutas, frecuencias activas y situación del personal. Los errores se muestran como No disponible. |
| Ventas | `/api/oficinista/resumen?fecha=YYYY-MM-DD` | Siete fechas, incluido hoy, sin filtro de cooperativa. `VENDIDOS_HOY`: emitidos, pagados o usados. La gráfica requiere siete respuestas válidas y al menos una venta. |
| Ocupación | `/api/usuario/reservas/:idHoja/asientos` | Todos los viajes programados/en curso de hoy. Cada asiento se cuenta por viaje. Ocupados, reservados y libres se distinguen; no se suman reservas como ventas. |

Si una consulta falla, muestra **No disponible**; las demás se siguen actualizando. Los ceros solo corresponden a respuestas válidas. No se crean porcentajes de crecimiento ni eventos de actividad. Sin ventas, se muestra un mensaje compacto. Ocupación permanece oculta si no hay viajes elegibles o mapas fiables; si ocurre un error se informa en Estado operativo. Una actualización que falla retira el gráfico anterior.

El orden del contenido es: banner, cuatro estadísticas, Estado operativo y Próximas salidas, Ventas y, solo cuando corresponda, Ocupación. Se eliminó Accesos rápidos; se conservaron los cinco destinos del menú lateral. En pantallas estrechas las secciones se apilan en ese mismo orden. Los contenedores vacíos no reservan alturas de gráfico.

## Comprobación en el navegador

1. Mantener Express y SQL Server activos. No es necesario reiniciar el backend por este cambio, que solo afecta al frontend.
2. Abrir la portada con Live Server e iniciar sesión con una cuenta R001. También se puede abrir `frontend/src/views/admin/dashboard.html` con Live Server después de iniciar sesión en el mismo origen.
3. Recargar con Ctrl + F5. Verificar nombre real del administrador, cuatro tarjetas, desgloses, Estado operativo y botón Actualizar datos.
4. Probar Cooperativas, Oficinistas, Controladores, Hojas de Ruta y Parada de Buses desde el menú. Comprobar que ya no existe Accesos rápidos.
5. Revisar a 1440, 1024, 768 y 390 píxeles: tarjetas adaptadas, menú móvil con fondo y Escape, tabla con desplazamiento horizontal y controles accesibles por teclado.
6. Si falla una consulta, comprobar que muestra No disponible y que las otras tarjetas siguen funcionando. Reintentar con Actualizar datos.
7. Cuando haya registros reales, comparar ventas y plazas con los módulos correspondientes. En la gráfica de ventas, abrir Ver valores por día.

## Pruebas

`node --test tests/admin-dashboard.test.cjs tests/admin-dashboard-ui.test.cjs tests/login.test.cjs tests/public-catalog.test.cjs`

Incluyen conteo de rutas, filtrado de fechas/estados, ocupación por viaje, rechazo de datos incompletos, siete fechas cruzando año, respuestas vacías, errores parciales/totales, conservación de los conteos anteriores y ausencia de consultas sin autorización del layout.

En la verificación con el backend local, Cooperativas, Usuarios, Flota y Frecuencias respondieron correctamente. Hojas de Ruta devolvió HTTP 500; mientras persista ese fallo, Próximas salidas muestra No disponible y Ocupación permanece oculta. Estado operativo informa del error de programación. No se modificó ese controlador ni el esquema SQL.

Las 28 pruebas automatizadas pasaron, incluidas regresiones del Login y catálogo, estados vacíos/errores, las cinco opciones del menú, orden de secciones, máximo de cinco salidas, conteos reales y retirada del gráfico de ocupación ante fallos. Se verificó mediante hashes la conservación de los archivos del frontend y backend ajenos al Dashboard. La revisión visual renderizada queda pendiente: el proveedor de acceso al navegador no estuvo disponible.
