const crypto = require('crypto');
const { sql, conectarBD } = require('../config/db');

const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');
const estadosOcupados = ['EMITIDO', 'PAGADO', 'USADO', 'OCUPADO', 'CONFIRMADO'];
const metodosPago = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA'];

const generarCodigo = (prefijo) => `${prefijo}${crypto.randomBytes(3).toString('hex').toUpperCase()}`.slice(0, 5);
const generarQr = (idBoleto, idHoja, idAsiento) => {
    const payload = JSON.stringify({
        boleto: idBoleto,
        hoja: idHoja,
        asiento: idAsiento,
        expira: Date.now() + 15 * 60 * 1000
    });
    return `reserva:${Buffer.from(payload).toString('base64url')}`;
};

const obtenerAsientos = async (req, res) => {
    const idHoja = texto(req.params.idHoja).toUpperCase();

    if (!/^[A-Z0-9_-]{1,5}$/.test(idHoja)) {
        return res.status(400).json({ success: false, message: 'La hoja de ruta indicada no es válida.' });
    }

    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('idHoja', sql.VarChar(5), idHoja)
            .query(`
                SELECT H.ID_HOJ,
                       H.FEC_PRO_HOJ,
                       H.EST_VIA_HOJ,
                       B.ID_BUS,
                       B.NUM_BUS,
                       B.NUM_PIS,
                       A.ID_ASI,
                       A.PIS_ASI,
                       A.ID_TIP_PER,
                       T.NOM_TIP,
                       T.PRE_TIP,
                       CASE
                           WHEN UPPER(ISNULL(O.EST_BOL, '')) IN ('EMITIDO', 'PAGADO', 'USADO', 'OCUPADO', 'CONFIRMADO') THEN 'OCUPADO'
                           WHEN UPPER(ISNULL(O.EST_BOL, '')) IN ('RESERVADO', 'PENDIENTE') THEN 'RESERVADO'
                           ELSE 'LIBRE'
                       END AS ESTADO_ASIENTO,
                       O.ID_BOL
                FROM HOJAS_RUTAS H
                INNER JOIN BUSES B ON B.ID_BUS = H.ID_BUS_PER
                INNER JOIN ASIENTOS_BUS A ON A.ID_BUS_PER = B.ID_BUS
                INNER JOIN TIPOS_ASIENTOS T ON T.ID_TIP = A.ID_TIP_PER
                OUTER APPLY (
                    SELECT TOP 1 BO.ID_BOL, BO.EST_BOL
                    FROM BOLETOS BO
                    WHERE BO.ID_HOJ_PER = H.ID_HOJ
                      AND BO.ID_ASI_PER = A.ID_ASI
                      AND UPPER(ISNULL(BO.EST_BOL, '')) IN ('EMITIDO', 'PAGADO', 'USADO', 'OCUPADO', 'CONFIRMADO', 'RESERVADO', 'PENDIENTE')
                    ORDER BY CASE WHEN UPPER(BO.EST_BOL) IN ('EMITIDO', 'PAGADO', 'USADO', 'OCUPADO', 'CONFIRMADO') THEN 0 ELSE 1 END,
                             BO.FEC_COM_BOL DESC
                ) O
                WHERE H.ID_HOJ = @idHoja
                ORDER BY A.PIS_ASI, A.ID_ASI
            `);

        if (resultado.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'No se encontró la hoja de ruta o no tiene asientos configurados.' });
        }

        const primerAsiento = resultado.recordset[0];
        return res.status(200).json({
            success: true,
            viaje: {
                idHoja: primerAsiento.ID_HOJ,
                fecha: primerAsiento.FEC_PRO_HOJ,
                estado: primerAsiento.EST_VIA_HOJ,
                idBus: primerAsiento.ID_BUS,
                numeroBus: primerAsiento.NUM_BUS,
                pisos: primerAsiento.NUM_PIS
            },
            asientos: resultado.recordset
        });
    } catch (error) {
        console.error('Error al consultar asientos del usuario:', error);
        return res.status(500).json({ success: false, message: 'No fue posible consultar los asientos.' });
    }
};

const reservarAsiento = async (req, res) => {
    const idHoja = texto(req.body?.idHoja).toUpperCase();
    const idAsiento = texto(req.body?.idAsiento).toUpperCase();
    const metodoPago = texto(req.body?.metodoPago).toUpperCase();
    const cedula = texto(req.body?.cedula);

    if (!/^[A-Z0-9_-]{1,5}$/.test(idHoja) || !/^[A-Z0-9_-]{1,5}$/.test(idAsiento)) {
        return res.status(400).json({ success: false, message: 'La hoja de ruta y el asiento son obligatorios.' });
    }
    if (!metodosPago.includes(metodoPago)) {
        return res.status(400).json({ success: false, message: 'El método de pago indicado no es válido.' });
    }
    if (!/^\d{10}$/.test(cedula)) {
        return res.status(400).json({ success: false, message: 'La cédula debe contener exactamente 10 dígitos.' });
    }

    const pool = await conectarBD();
    const transaccion = new sql.Transaction(pool);

    try {
        await transaccion.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const solicitud = transaccion.request();
        solicitud.input('idHoja', sql.VarChar(5), idHoja);
        solicitud.input('idAsiento', sql.VarChar(5), idAsiento);

        const asiento = await solicitud.query(`
            SELECT H.ID_HOJ, F.CIU_ORI_FRE, F.CIU_DES_FRE, A.ID_ASI, T.PRE_TIP
            FROM HOJAS_RUTAS H WITH (UPDLOCK, HOLDLOCK)
            INNER JOIN FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
            INNER JOIN ASIENTOS_BUS A ON A.ID_BUS_PER = H.ID_BUS_PER
            INNER JOIN TIPOS_ASIENTOS T ON T.ID_TIP = A.ID_TIP_PER
            WHERE H.ID_HOJ = @idHoja AND A.ID_ASI = @idAsiento
        `);

        if (asiento.recordset.length === 0) {
            await transaccion.rollback();
            return res.status(404).json({ success: false, message: 'El asiento no pertenece a la hoja de ruta indicada.' });
        }

        const boletoExistente = await transaccion.request()
            .input('idHoja', sql.VarChar(5), idHoja)
            .input('idAsiento', sql.VarChar(5), idAsiento)
            .query(`
                SELECT TOP 1 ID_BOL, EST_BOL
                FROM BOLETOS WITH (UPDLOCK, HOLDLOCK)
                WHERE ID_HOJ_PER = @idHoja AND ID_ASI_PER = @idAsiento
                  AND UPPER(ISNULL(EST_BOL, '')) IN ('EMITIDO', 'PAGADO', 'USADO', 'OCUPADO', 'CONFIRMADO', 'RESERVADO', 'PENDIENTE')
                ORDER BY CASE WHEN UPPER(EST_BOL) IN ('EMITIDO', 'PAGADO', 'USADO', 'OCUPADO', 'CONFIRMADO') THEN 0 ELSE 1 END,
                         FEC_COM_BOL DESC
            `);

        if (boletoExistente.recordset.length > 0) {
            await transaccion.rollback();
            const ocupado = estadosOcupados.includes(String(boletoExistente.recordset[0].EST_BOL).toUpperCase());
            return res.status(409).json({
                success: false,
                message: ocupado ? 'El asiento ya está ocupado.' : 'El asiento ya tiene una reserva pendiente.'
            });
        }

        const usuario = await transaccion.request()
            .input('cedula', sql.VarChar(10), cedula)
            .query('SELECT ID_USU FROM USUARIOS WHERE CED_USU = @cedula AND ISNULL(EST_USU, \'1\') <> \'0\'');
        if (usuario.recordset.length === 0) {
            await transaccion.rollback();
            return res.status(404).json({ success: false, message: 'La cédula indicada no está registrada.' });
        }

        const datos = asiento.recordset[0];
        const usuarioId = usuario.recordset[0].ID_USU;
        const idBoleto = generarCodigo('R');
        const codigoQr = generarQr(idBoleto, idHoja, idAsiento);

        await transaccion.request()
            .input('idBoleto', sql.VarChar(5), idBoleto)
            .input('origen', sql.VarChar(20), datos.CIU_ORI_FRE)
            .input('destino', sql.VarChar(20), datos.CIU_DES_FRE)
            .input('precio', sql.Decimal(18, 0), datos.PRE_TIP)
            .input('metodoPago', sql.VarChar(15), metodoPago)
            .input('codigoQr', sql.VarChar(500), codigoQr)
            .input('idHoja', sql.VarChar(5), idHoja)
            .input('idAsiento', sql.VarChar(5), idAsiento)
            .input('usuarioId', sql.VarChar(10), usuarioId)
            .query(`
                INSERT INTO BOLETOS
                    (ID_BOL, ORI_TRA_BOL, DES_TRA_BOL, TIP_DES_BOL, PRE_FIN_BOL, MET_PAG_BOL,
                     COM_PAG_URL, EST_BOL, COD_QR_BOL, FEC_COM_BOL, ID_HOJ_PER, ID_ASI_PER, ID_USU_FIN)
                VALUES
                    (@idBoleto, @origen, @destino, 'PASAJERO', @precio, @metodoPago,
                     NULL, 'RESERVADO', @codigoQr, CONVERT(date, GETDATE()), @idHoja, @idAsiento, @usuarioId)
            `);

        await transaccion.commit();
        return res.status(201).json({
            success: true,
            message: 'Reserva creada correctamente. Tiene estado pendiente de validación.',
            reserva: { idBoleto, idHoja, idAsiento, estado: 'RESERVADO', codigoQr, precio: datos.PRE_TIP }
        });
    } catch (error) {
        try {
            await transaccion.rollback();
        } catch (rollbackError) {
            console.error('Error al revertir reserva:', rollbackError);
        }
        console.error('Error al reservar asiento:', error);
        return res.status(500).json({ success: false, message: 'No fue posible crear la reserva.' });
    }
};

module.exports = { obtenerAsientos, reservarAsiento };
