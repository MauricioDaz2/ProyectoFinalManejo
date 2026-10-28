const crypto = require('crypto');
const fs = require('fs/promises');
const { sql, conectarBD } = require('../config/db');

const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');
const estadosOcupados = ['EMITIDO', 'PAGADO', 'USADO', 'OCUPADO', 'CONFIRMADO'];
const metodosPago = ['EFECTIVO', 'TRANSFERENCIA'];
const tiposPasajero = new Set(['ADULTO', 'NINO', 'ADULTO_MAYOR']);
const generarCodigo = (prefijo) => `${prefijo}${crypto.randomBytes(3).toString('hex').toUpperCase()}`.slice(0, 5);
const generarQr = (idBoleto, idHoja, idAsiento) => {
    const payload = JSON.stringify({ boleto: idBoleto, hoja: idHoja, asiento: idAsiento, expira: Date.now() + 15 * 60 * 1000 });
    return `reserva:${Buffer.from(payload).toString('base64url')}`;
};
const esCedulaEcuatoriana = (cedula) => {
    if (!/^\d{10}$/.test(cedula) || /^(\d)\1{9}$/.test(cedula)) return false;
    const provincia = Number(cedula.slice(0, 2));
    if (provincia < 1 || provincia > 24) return false;
    const digitos = [...cedula].map(Number);
    const suma = digitos.slice(0, 9).reduce((total, digito, indice) => {
        const valor = indice % 2 === 0 ? digito * 2 : digito;
        return total + (valor > 9 ? valor - 9 : valor);
    }, 0);
    return (10 - (suma % 10)) % 10 === digitos[9];
};

const obtenerAsientos = async (req, res) => {
    const idHoja = texto(req.params.idHoja).toUpperCase();
    if (!/^[A-Z0-9_-]{1,5}$/.test(idHoja)) return res.status(400).json({ success: false, message: 'La hoja de ruta indicada no es válida.' });
    try {
        const pool = await conectarBD();
        const resultado = await pool.request().input('idHoja', sql.VarChar(5), idHoja).query(`
            SELECT H.ID_HOJ, H.FEC_PRO_HOJ, H.EST_VIA_HOJ, B.ID_BUS, B.NUM_BUS, B.NUM_PIS,
                   A.ID_ASI, A.PIS_ASI, A.ID_TIP_PER, T.NOM_TIP, T.PRE_TIP,
                   CASE WHEN UPPER(ISNULL(O.EST_BOL, '')) IN ('EMITIDO', 'PAGADO', 'USADO', 'OCUPADO', 'CONFIRMADO') THEN 'OCUPADO'
                        WHEN UPPER(ISNULL(O.EST_BOL, '')) IN ('RESERVADO', 'PENDIENTE') THEN 'RESERVADO' ELSE 'LIBRE' END AS ESTADO_ASIENTO,
                   O.ID_BOL
            FROM HOJAS_RUTAS H
            INNER JOIN BUSES B ON B.ID_BUS = H.ID_BUS_PER
            INNER JOIN ASIENTOS_BUS A ON A.ID_BUS_PER = B.ID_BUS
            INNER JOIN TIPOS_ASIENTOS T ON T.ID_TIP = A.ID_TIP_PER
            OUTER APPLY (
                SELECT TOP 1 BO.ID_BOL, BO.EST_BOL
                FROM BOLETOS BO
                WHERE BO.ID_HOJ_PER = H.ID_HOJ AND BO.ID_ASI_PER = A.ID_ASI
                  AND UPPER(ISNULL(BO.EST_BOL, '')) IN ('EMITIDO', 'PAGADO', 'USADO', 'OCUPADO', 'CONFIRMADO', 'RESERVADO', 'PENDIENTE')
                ORDER BY CASE WHEN UPPER(BO.EST_BOL) IN ('EMITIDO', 'PAGADO', 'USADO', 'OCUPADO', 'CONFIRMADO') THEN 0 ELSE 1 END, BO.FEC_COM_BOL DESC
            ) O
            WHERE H.ID_HOJ = @idHoja
            ORDER BY A.PIS_ASI, A.ID_ASI
        `);
        if (!resultado.recordset.length) return res.status(404).json({ success: false, message: 'No se encontró la hoja de ruta o no tiene asientos configurados.' });
        const primerAsiento = resultado.recordset[0];
        return res.status(200).json({
            success: true,
            viaje: { idHoja: primerAsiento.ID_HOJ, fecha: primerAsiento.FEC_PRO_HOJ, estado: primerAsiento.EST_VIA_HOJ, idBus: primerAsiento.ID_BUS, numeroBus: primerAsiento.NUM_BUS, pisos: primerAsiento.NUM_PIS },
            asientos: resultado.recordset
        });
    } catch (error) {
        console.error('Error al consultar asientos del usuario:', error);
        return res.status(500).json({ success: false, message: 'No fue posible consultar los asientos.' });
    }
};

const reservarAsiento = async (req, res) => {
    const idHoja = texto(req.body?.idHoja).toUpperCase();
    const metodoPago = texto(req.body?.metodoPago).toUpperCase();
    const cedulaTitular = texto(req.body?.cedulaTitular);
    const comprobanteUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const estadoBoleto = metodoPago === 'EFECTIVO' ? 'PENDIENTE' : 'RESERVADO';
    let idAsientos;
    let pasajeros;
    try {
        idAsientos = JSON.parse(req.body?.idAsientos || '[]').map((id) => texto(id).toUpperCase());
        pasajeros = JSON.parse(req.body?.pasajeros || '[]');
    } catch (error) {
        return res.status(400).json({ success: false, message: 'La información de pasajeros no tiene un formato válido.' });
    }
    if (!/^[A-Z0-9_-]{1,5}$/.test(idHoja) || !idAsientos.length || idAsientos.length > 10 || new Set(idAsientos).size !== idAsientos.length) return res.status(400).json({ success: false, message: 'Debes indicar entre 1 y 10 asientos diferentes.' });
    if (!metodosPago.includes(metodoPago)) return res.status(400).json({ success: false, message: 'El método de pago indicado no es válido.' });
    if (!esCedulaEcuatoriana(cedulaTitular)) return res.status(400).json({ success: false, message: 'La cédula del titular no es válida.' });
    if (!Array.isArray(pasajeros) || pasajeros.length !== idAsientos.length || pasajeros.some((pasajero) => !esCedulaEcuatoriana(texto(pasajero.cedula)) || !tiposPasajero.has(texto(pasajero.tipo).toUpperCase()))) return res.status(400).json({ success: false, message: 'Cada pasajero debe tener una cédula ecuatoriana válida y un tipo permitido.' });
    if (new Set(pasajeros.map((pasajero) => texto(pasajero.cedula))).size !== pasajeros.length) return res.status(400).json({ success: false, message: 'No se puede registrar la misma cédula en varios asientos.' });
    if (metodoPago === 'TRANSFERENCIA' && !req.file) return res.status(400).json({ success: false, message: 'Adjunta el comprobante de transferencia para continuar.' });

    const pool = await conectarBD();
    const transaccion = new sql.Transaction(pool);
    try {
        await transaccion.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const parametrosAsientos = idAsientos.map((_, index) => `@idAsiento${index}`);
        const solicitud = transaccion.request().input('idHoja', sql.VarChar(5), idHoja);
        idAsientos.forEach((id, index) => solicitud.input(`idAsiento${index}`, sql.VarChar(5), id));
        const asiento = await solicitud.query(`
            SELECT H.ID_HOJ, F.CIU_ORI_FRE, F.CIU_DES_FRE, A.ID_ASI, T.PRE_TIP
            FROM HOJAS_RUTAS H WITH (UPDLOCK, HOLDLOCK)
            INNER JOIN FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
            INNER JOIN ASIENTOS_BUS A ON A.ID_BUS_PER = H.ID_BUS_PER
            INNER JOIN TIPOS_ASIENTOS T ON T.ID_TIP = A.ID_TIP_PER
            WHERE H.ID_HOJ = @idHoja AND A.ID_ASI IN (${parametrosAsientos.join(', ')})
        `);
        if (asiento.recordset.length !== idAsientos.length) {
            await transaccion.rollback();
            return res.status(404).json({ success: false, message: 'Uno o más asientos no pertenecen a la hoja de ruta indicada.' });
        }
        const consultaExistentes = transaccion.request().input('idHoja', sql.VarChar(5), idHoja);
        idAsientos.forEach((id, index) => consultaExistentes.input(`idAsiento${index}`, sql.VarChar(5), id));
        const boletosExistentes = await consultaExistentes.query(`
            SELECT ID_BOL, EST_BOL FROM BOLETOS WITH (UPDLOCK, HOLDLOCK)
            WHERE ID_HOJ_PER = @idHoja AND ID_ASI_PER IN (${parametrosAsientos.join(', ')})
              AND UPPER(ISNULL(EST_BOL, '')) IN ('EMITIDO', 'PAGADO', 'USADO', 'OCUPADO', 'CONFIRMADO', 'RESERVADO', 'PENDIENTE')
        `);
        if (boletosExistentes.recordset.length) {
            await transaccion.rollback();
            const ocupado = boletosExistentes.recordset.some((boleto) => estadosOcupados.includes(String(boleto.EST_BOL).toUpperCase()));
            return res.status(409).json({ success: false, message: ocupado ? 'Uno de los asientos ya está ocupado.' : 'Uno de los asientos ya tiene una reserva pendiente.' });
        }
        const usuario = await transaccion.request().input('cedula', sql.VarChar(10), cedulaTitular).query("SELECT ID_USU FROM USUARIOS WHERE CED_USU = @cedula AND ISNULL(EST_USU, '1') <> '0'");
        if (!usuario.recordset.length) {
            await transaccion.rollback();
            return res.status(404).json({ success: false, message: 'La cédula del titular no está registrada como usuario.' });
        }
        const usuarioId = usuario.recordset[0].ID_USU;
        const reservas = [];
        for (let index = 0; index < idAsientos.length; index += 1) {
            const datos = asiento.recordset.find((fila) => fila.ID_ASI === idAsientos[index]);
            const pasajero = pasajeros[index];
            const tipo = texto(pasajero.tipo).toUpperCase();
            const precio = Number(datos.PRE_TIP) * (tipo === 'ADULTO' ? 1 : .5);
            const idBoleto = generarCodigo('R');
            const codigoQr = generarQr(idBoleto, idHoja, datos.ID_ASI);
            await transaccion.request()
                .input('idBoleto', sql.VarChar(5), idBoleto).input('origen', sql.VarChar(20), datos.CIU_ORI_FRE).input('destino', sql.VarChar(20), datos.CIU_DES_FRE)
                .input('precio', sql.Decimal(18, 0), precio).input('tipoDescuento', sql.VarChar(30), tipo === 'ADULTO' ? 'ADULTO' : `${tipo}_50`)
                .input('tipoPasajero', sql.VarChar(15), tipo).input('cedulaPasajero', sql.VarChar(10), texto(pasajero.cedula))
                .input('metodoPago', sql.VarChar(15), metodoPago).input('codigoQr', sql.VarChar(500), codigoQr).input('comprobanteUrl', sql.VarChar(500), comprobanteUrl)
                .input('estadoBoleto', sql.VarChar(15), estadoBoleto).input('idHoja', sql.VarChar(5), idHoja).input('idAsiento', sql.VarChar(5), datos.ID_ASI).input('usuarioId', sql.VarChar(10), usuarioId)
                .query(`
                    INSERT INTO BOLETOS
                        (ID_BOL, ORI_TRA_BOL, DES_TRA_BOL, TIP_DES_BOL, PRE_FIN_BOL, MET_PAG_BOL, COM_PAG_URL, EST_BOL, COD_QR_BOL, FEC_COM_BOL, ID_HOJ_PER, ID_ASI_PER, ID_USU_FIN, CED_PAS_BOL, TIP_PAS_BOL)
                    VALUES
                        (@idBoleto, @origen, @destino, @tipoDescuento, @precio, @metodoPago, @comprobanteUrl, @estadoBoleto, @codigoQr, CONVERT(date, GETDATE()), @idHoja, @idAsiento, @usuarioId, @cedulaPasajero, @tipoPasajero)
                `);
            reservas.push({ idBoleto, idHoja, idAsiento: datos.ID_ASI, estado: estadoBoleto, codigoQr, precio });
        }
        await transaccion.commit();
        return res.status(201).json({ success: true, message: metodoPago === 'TRANSFERENCIA' ? 'Reservas creadas. Los comprobantes fueron enviados para validación.' : 'Reservas creadas. Quedan pendientes de pago en efectivo.', reservas, facturaTitular: cedulaTitular });
    } catch (error) {
        try { await transaccion.rollback(); } catch (rollbackError) { console.error('Error al revertir reserva:', rollbackError); }
        if (req.file) {
            try { await fs.unlink(req.file.path); } catch (cleanupError) { if (cleanupError.code !== 'ENOENT') console.error('Error al eliminar comprobante rechazado:', cleanupError); }
        }
        console.error('Error al reservar asientos:', error);
        return res.status(500).json({ success: false, message: 'No fue posible crear las reservas.' });
    }
};

module.exports = { obtenerAsientos, reservarAsiento };
