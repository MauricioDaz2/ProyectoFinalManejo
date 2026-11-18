# Ajustes finales de Gestión de cooperativas R001

Verificado el 16 de noviembre de 2026, en `feature/redisenio-pagina`.

## Cambios realizados

Los formularios de empresa y cuentas comparan sus valores actuales con una copia tomada al abrirlos. Volver al valor original elimina el cambio pendiente. Guardar correctamente o confirmar el descarte limpia esa copia; un error de guardado conserva los datos y la protección. Cerrar con X, Escape o el fondo del diálogo solicita confirmación únicamente si hay cambios. La navegación interna por cooperativa también permite cancelar el abandono. Buscar, filtrar y cambiar entre Empresa, Responsables y Personal no modifica estos formularios.

El componente compartido Mi perfil conservaba una bandera `dirty` calculada por eventos, y `beforeunload` consultaba esa bandera sin comprobar si el diálogo seguía abierto ni volver a comparar los valores. Se corrigió ese riesgo de estado desactualizado: se recalcula antes de salir o cerrar, solo en un diálogo abierto; también después de seleccionar una fotografía y terminar un guardado. Al abrir se limpian las contraseñas pendientes de una apertura anterior. No se pudo reproducir visualmente el aviso original por falta de conexión con la herramienta del navegador.

El historial de responsables utiliza la consulta existente, ampliada con uniones a USUARIOS para obtener los nombres del nuevo principal, del anterior y del administrador. No se cambiaron registros históricos ni tablas. Se presenta como una lista cronológica de eventos, del más reciente al más antiguo, con fecha y hora de Ecuador. Cuando falta un nombre se conserva el identificador; cuando no había principal anterior se muestra «ninguno». Los nombres corresponden a los datos actuales almacenados en USUARIOS.

Responsables y Personal ya no muestran Consultar. El principal tiene Editar y conserva su protección contra desactivación directa. Los gestores adicionales tienen Editar, Desactivar o Reactivar, y Designar principal cuando están activos. Los oficinistas y controladores tienen Editar y Desactivar o Reactivar. No hay Eliminar ni Suspendido para cuentas. Las confirmaciones identifican la cuenta y explican el efecto sobre sus sesiones. Después de guardar se recargan la ficha y el listado y se muestra el resultado.

Los estados de cooperativas, las dependencias de eliminación, los permisos, la revocación de sesiones y las escrituras de estado conservan los servicios existentes.

## Verificaciones realizadas

- `node --test --test-reporter=tap tests/*.test.cjs`: 116 pruebas aprobadas, sin fallos. Incluye formularios, reversión y descarte, fallos de guardado, historial, acciones de cuentas, protección del principal, aislamiento entre cooperativas, sesiones revocadas y posterior inicio de sesión. También pasan las pruebas existentes de registro, personalización, reservas y Login.
- `node --check`: 89 archivos JavaScript/CJS correctos. `git diff --check`: sin errores de espacios.
- SQL Server real: consulta de CP001, CP002 y CP003, con usuarios pertenecientes únicamente a cada cooperativa. El historial de CP003 devuelve el evento existente y los campos de nombres de la nueva consulta.
- SQL Server real: servicio de cambio de estado de un R003 y un R004, pasando por Inactivo y Activo dentro de una transacción. Se leyó cada resultado y se ejecutó rollback; después se verificaron sus estados originales. No se confirmaron cambios permanentes ni se revocaron sesiones reales para esta comprobación.
- No había un R002 delegado entre los registros elegibles. Su desactivación, reactivación y revocación se comprobaron en el flujo HTTP con persistencia aislada.
- La migración 008 ya estaba instalada al consultar SQL Server. Esta entrega no necesita nuevas migraciones y no ejecutó ninguna.
- La herramienta de control visual devolvió «Computer Use native pipe is unavailable». No se verificaron visualmente escritorio, tableta ni celular.

## Comprobación manual

1. Reinicia el backend con tu procedimiento habitual. Abre con Live Server `frontend/src/views/admin/cooperativas.html`, inicia sesión como R001 y recarga con Ctrl+F5.
2. Abre una cooperativa, recorre las tres pestañas y utiliza búsqueda y filtros. Abre y cierra Editar sin tocar campos: no debe haber advertencias.
3. Cambia un campo y restáuralo exactamente: al cerrar no debe aparecer confirmación. Cambia de nuevo: X, Escape o clic fuera deben ofrecer descartar; cancelar conserva la edición. Recargar o abandonar la página debe usar la advertencia nativa del navegador.
4. Guarda un cambio válido que quieras conservar. Revisa que la tabla y la ficha lo muestren, recarga y comprueba que no queden avisos pendientes. Prueba una validación fallida: el formulario debe conservar la edición.
5. En Responsables abre el historial; CP003 tiene un evento disponible al momento de esta revisión. Revisa nombres, fecha, administrador y principal anterior. El principal vigente debe tener únicamente Editar entre las acciones de su fila.
6. Con una cuenta de prueba autorizada, desactiva y reactiva un gestor, un oficinista y un controlador. La sesión anterior debe perder acceso; reactivar permite un nuevo inicio de sesión, sin recuperar la sesión revocada. Confirma el estado después de recargar.
7. Abre otra cooperativa y comprueba que no aparecen los trabajadores de la primera. Conserva el acceso Visitar página pública de cada ficha.
8. Revisa a 1440, 768 y 390 píxeles: formulario desplazable, campos legibles, botones accesibles y tabla con desplazamiento horizontal cuando lo necesite. Comprueba también Mi perfil: abrir, editar, revertir, guardar y cerrar.

## Archivos de esta entrega

Modificados:

- `backend/src/services/companyAdministration.js`
- `frontend/src/js/admin_company_accounts.js`
- `frontend/src/js/admin_cooperativas.js`
- `frontend/src/js/admin_company_detail.js`
- `frontend/src/js/mi_perfil.js`
- `frontend/src/assets/admin_company_detail.css`
- `tests/company-detail-ui.test.cjs`
- `tests/personal-access.test.cjs`

Nuevos:

- `tests/profile-pending-ui.test.cjs`
- `docs/ajustes-finales-cooperativas.md`

Se conservaron los cambios locales anteriores. No se modificó `.env` ni se hicieron commits, merges o push.
