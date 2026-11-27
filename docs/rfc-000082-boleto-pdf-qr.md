# RFC-000082 · Generación y descarga de boleto en PDF con código QR para pasajero y ventanilla

## Resumen del cambio

Se implementa la generación y descarga de boletos formales en formato **PDF 1.4 vectorial** con código **QR ISO/IEC 18004** escaneable, disponible tanto para el pasajero (en **Mis Boletos**) como para el oficinista (en el comprobante de **Ventanilla de Boletos** y en **Validación de Reservas**):

- **Generador QR ISO/IEC 18004 sin dependencias externas (`backend/src/services/qrCode.js`):** codificación en modo Byte con corrección de errores Reed-Solomon $\text{GF}(2^8)$ (Versiones 1 a 10), patrones finder, alineación, timing, información de formato BCH y selección automática de máscara óptima.
- **Servicio de boleto PDF vectorial (`backend/src/services/ticketPdf.js`):** genera un documento `%PDF-1.4` con cabecera corporativa de la cooperativa, estado del boleto, bloque principal de origen y destino, fecha y hora de salida, bus y placa, piso, asiento y ubicación (Ventana/Pasillo), datos del pasajero, método de pago, valor total y talón de abordaje con matriz QR vectorial de alta nitidez.
- **Control de acceso y aislamiento:**
  - `GET /api/usuario/reservas/:idBoleto/pdf`: verifica que el usuario autenticado (`R005`, `R004` o `R006`) sea el titular del boleto (`ID_USU_FIN = req.auth.id`), rechazando accesos ajenos con `403`.
  - `GET /api/oficinista/boletos/:id/pdf`: verifica que el boleto pertenezca a la cooperativa del oficinista (`req.scopeCompany`), rechazando boletos de otras cooperativas con `404`.

## Archivos modificados y creados

- `backend/src/services/qrCode.js`
- `backend/src/services/ticketPdf.js`
- `backend/src/controllers/userReservaController.js`
- `backend/src/routes/userReservaRoutes.js`
- `backend/src/controllers/oficinistaBoletoController.js`
- `backend/src/routes/oficinistaBoletoRoutes.js`
- `frontend/src/js/user_boletos.js`
- `frontend/src/views/oficinista/ventanilla_boletos.html`
- `frontend/src/js/oficinista_ventanilla.js`
- `frontend/src/js/oficinista_validacion.js`
- `test/ticket-pdf.test.cjs`

## Pruebas

```powershell
$env:CC01_SQL_TEST_PASSWORD = "..."
node --test
```

## Reversión

El cambio no altera el esquema de base de datos ni agrega dependencias externas en `package.json`. Para revertir, basta con deshacer el merge commit en `develop` (`git revert`) y reiniciar el servidor Express.
