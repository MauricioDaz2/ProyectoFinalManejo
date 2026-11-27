const crypto = require('crypto');
const fs = require('fs/promises');
const { sql, conectarBD } = require('../config/db');
const cc = require('../services/frequencyControl');

const EXPIRACION_TRANSFERENCIA_MINUTOS = 5;
const EXPIRACION_TRANSFERENCIA_SEGUNDOS = EXPIRACION_TRANSFERENCIA_MINUTOS * 60;

const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');

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

function normalizarPlantilla(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return null; }
}

async function liberarReservasVencidas(gestor, idHoja = null) {
    try {
        const check = await gestor.request().query(`
            SELECT CASE WHEN COL_LENGTH('dbo.BOLETOS', 'FEC_EXP_RES_UTC') IS NOT NULL THEN 1 ELSE 0 END AS TIENE_EXP
        `);
        if (check.recordset?.[0]?.TIENE_EXP !== 1) return [];

        const req = gestor.request();
        if (idHoja) req.input('idHoja', sql.VarChar(5), idHoja);
        const res = await req.query(`
            UPDATE dbo.BOLETOS
            SET EST_BOL = 'VENCIDO',
                EST_REV_PAG = 'EXPIRADO'
            OUTPUT INSERTED.ID_BOL, INSERTED.ID_ASI_PER, INSERTED.ID_HOJ_PER
            WHERE UPPER(LTRIM(RTRIM(ISNULL(EST_BOL, '')))) IN ('RESERVADO', 'PENDIENTE')
              AND UPPER(LTRIM(RTRIM(ISNULL(MET_PAG_BOL, '')))) = 'TRANSFERENCIA'
              AND (COM_PAG_URL IS NULL OR LTRIM(RTRIM(COM_PAG_URL)) = '')
              AND FEC_EXP_RES_UTC IS NOT NULL
              AND FEC_EXP_RES_UTC <= SYSUTCDATETIME()
              ${idHoja ? 'AND ID_HOJ_PER = @idHoja' : ''}
        `);
        return res.recordset || [];
    } catch {
        return [];
    }
}

const obtenerAsientos = async (req, res) => {
    const cooperativa = texto(req.query.cooperativa).toUpperCase();
    if (req.query.cooperativa !== undefined && !/^[A-Z0-9_-]{1,5}$/.test(cooperativa)) {
        return res.status(400).json({ success: false, message: 'Cooperativa no válida.' });
    }
    const idHoja = texto(req.params.idHoja).toUpperCase();
    if (!/^[A-Z0-9_-]{1,5}$/.test(idHoja)) {
        return res.status(400).json({ success: false, message: 'La hoja de ruta indicada no es válida.' });
    }

    try {
        const pool = await conectarBD();
        let resultado;
        try {
            resultado = await pool.request()
                .input('idHoja', sql.VarChar(5), idHoja)
                .input('cooperativa', sql.VarChar(5), cooperativa || null)
                .query(`
                    SELECT H.ID_HOJ, H.FEC_PRO_HOJ, H.EST_VIA_HOJ,
                           B.ID_BUS, B.NUM_BUS, B.PLA_BUS, B.NUM_PIS, B.IMG_URL_BUS, B.MOD_PLA_BUS, B.PLANTILLA_JSON,
                           F.CIU_ORI_FRE, F.CIU_DES_FRE, F.HORA_SAL_FRE, F.TAR_BAS_FRE,
                           A.ID_ASI, A.PIS_ASI, A.ID_TIP_PER, A.FIL_ASI, A.COL_ASI, A.UBI_ASI,
                           T.NOM_TIP, T.PRE_TIP,
                           CASE
                               WHEN UPPER(LTRIM(RTRIM(ISNULL(O.EST_BOL, '')))) IN ('EMITIDO', 'PAGADO', 'USADO', 'OCUPADO', 'CONFIRMADO') THEN 'OCUPADO'
                               WHEN UPPER(LTRIM(RTRIM(ISNULL(O.EST_BOL, '')))) IN ('RESERVADO', 'PENDIENTE') THEN 'RESERVADO'
                               ELSE 'LIBRE'
                           END AS ESTADO_ASIENTO,
                           O.ID_BOL, O.FEC_EXP_RES_UTC, O.EST_REV_PAG
                    FROM HOJAS_RUTAS H
                    INNER JOIN BUSES B ON B.ID_BUS = ${cc.effectiveBus()}
                    INNER JOIN FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                    INNER JOIN ASIENTOS_BUS A ON A.ID_BUS_PER = B.ID_BUS
                    INNER JOIN TIPOS_ASIENTOS T ON T.ID_TIP = A.ID_TIP_PER
                    OUTER APPLY (
                        SELECT TOP 1 BO.ID_BOL, BO.EST_BOL, BO.FEC_EXP_RES_UTC, BO.EST_REV_PAG
                        FROM BOLETOS BO
                        WHERE BO.ID_HOJ_PER = H.ID_HOJ
                          AND BO.ID_ASI_PER = A.ID_ASI
                          AND UPPER(LTRIM(RTRIM(ISNULL(BO.EST_BOL, '')))) IN ('EMITIDO', 'PAGADO', 'USADO', 'OCUPADO', 'CONFIRMADO', 'RESERVADO', 'PENDIENTE')
                          AND NOT (
                              UPPER(LTRIM(RTRIM(ISNULL(BO.EST_BOL, '')))) IN ('RESERVADO', 'PENDIENTE')
                              AND UPPER(LTRIM(RTRIM(ISNULL(BO.MET_PAG_BOL, '')))) = 'TRANSFERENCIA'
                              AND (BO.COM_PAG_URL IS NULL OR LTRIM(RTRIM(BO.COM_PAG_URL)) = '')
                              AND BO.FEC_EXP_RES_UTC IS NOT NULL
                              AND BO.FEC_EXP_RES_UTC <= SYSUTCDATETIME()
                          )
                        ORDER BY
                            CASE
                                WHEN UPPER(LTRIM(RTRIM(BO.EST_BOL))) IN ('EMITIDO', 'PAGADO', 'USADO', 'OCUPADO', 'CONFIRMADO') THEN 0
                                WHEN UPPER(LTRIM(RTRIM(BO.EST_BOL))) IN ('RESERVADO', 'PENDIENTE') THEN 1
                                ELSE 2
                            END,
                            BO.FEC_COM_BOL DESC
                    ) O
                    WHERE H.ID_HOJ = @idHoja
                      AND EXISTS (
                          SELECT 1 FROM FRECUENCIAS F2
                          JOIN COOPERATIVAS C ON C.ID_COP = F2.ID_COP_PER
                          WHERE F2.ID_FRE = H.ID_FRE_PER AND (@cooperativa IS NULL OR C.ID_COP = @cooperativa)
                            AND B.ID_COP_PER = C.ID_COP AND C.EST_COP = '1'
                      )
                    ORDER BY A.PIS_ASI, TRY_CAST(A.ID_ASI AS INT), A.ID_ASI
                `);
        } catch (errCol) {
            const num = errCol.number ?? errCol.originalError?.info?.number;
            if (num !== 207) throw errCol;
            resultado = await pool.request()
                .input('idHoja', sql.VarChar(5), idHoja)
                .input('cooperativa', sql.VarChar(5), cooperativa || null)
                .query(`
                    SELECT H.ID_HOJ, H.FEC_PRO_HOJ, H.EST_VIA_HOJ, B.ID_BUS, B.NUM_BUS, B.NUM_PIS, B.IMG_URL_BUS,
                           A.ID_ASI, A.PIS_ASI, A.ID_TIP_PER, T.NOM_TIP, T.PRE_TIP,
                           CASE
                               WHEN UPPER(LTRIM(RTRIM(ISNULL(O.EST_BOL, '')))) IN ('EMITIDO', 'PAGADO', 'USADO', 'OCUPADO', 'CONFIRMADO') THEN 'OCUPADO'
                               WHEN UPPER(LTRIM(RTRIM(ISNULL(O.EST_BOL, '')))) IN ('RESERVADO', 'PENDIENTE') THEN 'RESERVADO'
                               ELSE 'LIBRE'
                           END AS ESTADO_ASIENTO,
                           O.ID_BOL
                    FROM HOJAS_RUTAS H
                    INNER JOIN BUSES B ON B.ID_BUS = ${cc.effectiveBus()}
                    INNER JOIN ASIENTOS_BUS A ON A.ID_BUS_PER = B.ID_BUS
                    INNER JOIN TIPOS_ASIENTOS T ON T.ID_TIP = A.ID_TIP_PER
                    OUTER APPLY (
                        SELECT TOP 1 BO.ID_BOL, BO.EST_BOL
                        FROM BOLETOS BO
                        WHERE BO.ID_HOJ_PER = H.ID_HOJ
                          AND BO.ID_ASI_PER = A.ID_ASI
                          AND UPPER(LTRIM(RTRIM(ISNULL(BO.EST_BOL, '')))) IN ('EMITIDO', 'PAGADO', 'USADO', 'OCUPADO', 'CONFIRMADO', 'RESERVADO', 'PENDIENTE')
                        ORDER BY
                            CASE
                                WHEN UPPER(LTRIM(RTRIM(BO.EST_BOL))) IN ('EMITIDO', 'PAGADO', 'USADO', 'OCUPADO', 'CONFIRMADO') THEN 0
                                WHEN UPPER(LTRIM(RTRIM(BO.EST_BOL))) IN ('RESERVADO', 'PENDIENTE') THEN 1
                                ELSE 2
                            END,
                            BO.FEC_COM_BOL DESC
                    ) O
                    WHERE H.ID_HOJ = @idHoja
                      AND EXISTS (
                          SELECT 1 FROM FRECUENCIAS F
                          JOIN COOPERATIVAS C ON C.ID_COP = F.ID_COP_PER
                          WHERE F.ID_FRE = H.ID_FRE_PER AND (@cooperativa IS NULL OR C.ID_COP = @cooperativa)
                            AND B.ID_COP_PER = C.ID_COP AND C.EST_COP = '1'
                      )
                    ORDER BY A.PIS_ASI, A.ID_ASI
                `);
        }

        if (resultado.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'No se encontró la hoja de ruta o no tiene asientos.' });
        }

        if (resultado.recordset.some((r) => r.ESTADO_ASIENTO === 'RESERVADO')) {
            await liberarReservasVencidas(pool, idHoja);
        }

        const primerAsiento = resultado.recordset[0];
        const tarifaBase = Number(primerAsiento.TAR_BAS_FRE) > 0 ? Number(primerAsiento.TAR_BAS_FRE) : 0;

        let contadorP1 = 0;
        let contadorP2 = 0;
        const asientos = resultado.recordset.map((fila) => {
            const piso = Number(fila.PIS_ASI) === 2 ? 2 : 1;
            if (piso === 2) contadorP2 += 1;
            else contadorP1 += 1;
            const numero = piso === 2 ? contadorP2 : contadorP1;
            const etiqueta = `${piso}${String(numero).padStart(2, '0')}`;
            const recargo = Number(fila.PRE_TIP) || 0;
            const precioCalculado = tarifaBase > 0 ? tarifaBase + recargo : (recargo > 0 ? recargo : 5.00);

            return {
                ...fila,
                NUMERO: numero,
                ETIQUETA: etiqueta,
                RECARGO_TIP: recargo,
                PRE_TIP: precioCalculado,
                PRECIO_ASIENTO: precioCalculado
            };
        });

        return res.status(200).json({
            success: true,
            viaje: {
                idHoja: primerAsiento.ID_HOJ,
                fecha: primerAsiento.FEC_PRO_HOJ,
                estado: primerAsiento.EST_VIA_HOJ,
                idBus: primerAsiento.ID_BUS,
                numeroBus: primerAsiento.NUM_BUS,
                placaBus: primerAsiento.PLA_BUS || null,
                pisos: primerAsiento.NUM_PIS,
                imgBus: primerAsiento.IMG_URL_BUS,
                origen: primerAsiento.CIU_ORI_FRE || null,
                destino: primerAsiento.CIU_DES_FRE || null,
                horaSalida: primerAsiento.HORA_SAL_FRE ? String(primerAsiento.HORA_SAL_FRE).slice(0, 5) : '08:00',
                tarifaBase: tarifaBase > 0 ? tarifaBase : 5.00,
                modeloPlantilla: primerAsiento.MOD_PLA_BUS || null,
                plantilla: normalizarPlantilla(primerAsiento.PLANTILLA_JSON),
                temporizadorTransferenciaSegundos: EXPIRACION_TRANSFERENCIA_SEGUNDOS,
                cupoPasajerosDisponible: null
            },
            asientos
        });
    } catch (error) {
        console.error('Error al consultar asientos:', error);
        return res.status(500).json({ success: false, message: 'No fue posible consultar los asientos.' });
    }
};

const obtenerMisBoletos = async (req, res) => {
    const cedulaUsuario = texto(req.params.cedula);
    if (cedulaUsuario !== req.auth?.id) {
        return res.status(403).json({ success: false, message: 'Solo puedes consultar tus propios boletos.' });
    }
    if (!cedulaUsuario) {
        return res.status(400).json({ success: false, message: 'Cédula de usuario no proporcionada.' });
    }

    try {
        const pool = await conectarBD();
        await liberarReservasVencidas(pool);

        let resultado;
        try {
            resultado = await pool.request()
                .input('cedula', sql.VarChar(10), cedulaUsuario)
                .query(`
                    SELECT B.ID_BOL, B.ORI_TRA_BOL, B.DES_TRA_BOL, B.TIP_DES_BOL, B.PRE_FIN_BOL,
                           B.MET_PAG_BOL, B.COM_PAG_URL, B.BAN_ORI_BOL, B.EST_BOL, B.COD_QR_BOL,
                           B.FEC_COM_BOL, B.ID_HOJ_PER, B.ID_ASI_PER,
                           B.FEC_EXP_RES_UTC, B.EST_REV_PAG,
                           CASE
                               WHEN B.FEC_EXP_RES_UTC IS NOT NULL AND B.FEC_EXP_RES_UTC > SYSUTCDATETIME()
                               THEN DATEDIFF(SECOND, SYSUTCDATETIME(), B.FEC_EXP_RES_UTC)
                               ELSE 0
                           END AS SEGUNDOS_RESTANTES,
                           H.FEC_PRO_HOJ, BU.NUM_BUS, BU.PLA_BUS,
                           F.HORA_SAL_FRE,
                           ASI.PIS_ASI,
                           (SELECT COUNT(*)
                              FROM dbo.ASIENTOS_BUS ASI2
                             WHERE ASI2.ID_BUS_PER = ASI.ID_BUS_PER
                               AND ASI2.PIS_ASI = ASI.PIS_ASI
                               AND TRY_CAST(ASI2.ID_ASI AS INT) <= TRY_CAST(ASI.ID_ASI AS INT)) AS NUMERO_ASIENTO
                    FROM BOLETOS B
                    INNER JOIN HOJAS_RUTAS H ON H.ID_HOJ = B.ID_HOJ_PER
                    INNER JOIN BUSES BU ON BU.ID_BUS = H.ID_BUS_PER
                    LEFT JOIN FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                    LEFT JOIN ASIENTOS_BUS ASI ON ASI.ID_ASI = B.ID_ASI_PER
                    WHERE B.ID_USU_FIN = @cedula
                    ORDER BY B.FEC_COM_BOL DESC, B.ID_BOL DESC
                `);
        } catch {
            resultado = await pool.request()
                .input('cedula', sql.VarChar(10), cedulaUsuario)
                .query(`
                    SELECT B.ID_BOL, B.ORI_TRA_BOL, B.DES_TRA_BOL, B.TIP_DES_BOL, B.PRE_FIN_BOL,
                           B.MET_PAG_BOL, B.EST_BOL, B.COD_QR_BOL, B.FEC_COM_BOL, B.ID_HOJ_PER, B.ID_ASI_PER,
                           H.FEC_PRO_HOJ, BU.NUM_BUS
                    FROM BOLETOS B
                    INNER JOIN HOJAS_RUTAS H ON H.ID_HOJ = B.ID_HOJ_PER
                    INNER JOIN BUSES BU ON BU.ID_BUS = H.ID_BUS_PER
                    WHERE B.ID_USU_FIN = @cedula
                    ORDER BY B.FEC_COM_BOL DESC
                `);
        }

        const boletos = (resultado.recordset || []).map((b) => {
            const piso = Number(b.PIS_ASI) || 1;
            const num = Number(b.NUMERO_ASIENTO) || 0;
            const etiqueta = num > 0 ? `${piso}${String(num).padStart(2, '0')}` : b.ID_ASI_PER;
            return {
                ...b,
                ETIQUETA_ASIENTO: etiqueta
            };
        });

        return res.status(200).json({
            success: true,
            boletos
        });
    } catch (error) {
        console.error('Error al consultar los boletos del usuario:', error);
        return res.status(500).json({ success: false, message: 'No fue posible consultar el historial.' });
    }
};

const cancelarReservaUsuario = async (req, res) => {
    const idBoleto = texto(req.params.idBoleto).toUpperCase();
    const cedulaUsuario = texto(req.body?.cedula || req.auth?.id);
    if (cedulaUsuario !== req.auth?.id) {
        return res.status(403).json({ success: false, message: 'Solo puedes cancelar tus propias reservas.' });
    }

    if (!idBoleto) {
        return res.status(400).json({ success: false, message: 'ID de boleto no válido.' });
    }

    try {
        const pool = await conectarBD();
        const transaccion = new sql.Transaction(pool);
        await transaccion.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

        const boletoActual = await transaccion.request()
            .input('idBoleto', sql.VarChar(5), idBoleto)
            .input('cedula', sql.VarChar(10), cedulaUsuario)
            .query(`
                SELECT EST_BOL
                FROM BOLETOS
                WHERE ID_BOL = @idBoleto AND ID_USU_FIN = @cedula
            `);

        if (!boletoActual.recordset.length) {
            await transaccion.rollback();
            return res.status(404).json({ success: false, message: 'Boleto no encontrado o no autorizado.' });
        }

        const estadoActual = String(boletoActual.recordset[0].EST_BOL || '').toUpperCase();
        if (estadoActual !== 'RESERVADO' && estadoActual !== 'PENDIENTE') {
            await transaccion.rollback();
            return res.status(400).json({ success: false, message: 'Solo se pueden cancelar boletos con estado Reservado o Pendiente.' });
        }

        await transaccion.request()
            .input('idBoleto', sql.VarChar(5), idBoleto)
            .query(`
                UPDATE BOLETOS
                SET EST_BOL = 'CANCELADO'
                WHERE ID_BOL = @idBoleto
            `);

        await transaccion.commit();
        return res.status(200).json({ success: true, message: 'Reserva cancelada exitosamente. El asiento ha sido liberado.' });
    } catch (error) {
        console.error('Error al cancelar la reserva:', error);
        return res.status(500).json({ success: false, message: 'No fue posible cancelar la reserva.' });
    }
};

const expirarReservaUsuario = async (req, res) => {
    const idParam = texto(req.params.idBoleto).toUpperCase();
    let ids = idParam ? [idParam] : [];
    if (!ids.length && Array.isArray(req.body?.idBoletos)) {
        ids = req.body.idBoletos.map((x) => texto(x).toUpperCase()).filter(Boolean);
    }
    if (!ids.length) {
        return res.status(400).json({ success: false, message: 'Indica la reserva a expirar.' });
    }

    try {
        const pool = await conectarBD();
        const transaccion = new sql.Transaction(pool);
        await transaccion.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

        for (const idBoleto of ids) {
            const actual = await transaccion.request()
                .input('idBoleto', sql.VarChar(5), idBoleto)
                .input('cedula', sql.VarChar(10), req.auth?.id)
                .query(`
                    SELECT EST_BOL
                    FROM BOLETOS
                    WHERE ID_BOL = @idBoleto AND ID_USU_FIN = @cedula
                `);
            if (actual.recordset.length) {
                const est = String(actual.recordset[0].EST_BOL || '').toUpperCase();
                if (est === 'RESERVADO' || est === 'PENDIENTE') {
                    await transaccion.request()
                        .input('idBoleto', sql.VarChar(5), idBoleto)
                        .query(`
                            UPDATE BOLETOS
                            SET EST_BOL = 'VENCIDO'
                            WHERE ID_BOL = @idBoleto
                        `);
                }
            }
        }

        await transaccion.commit();
        return res.status(200).json({
            success: true,
            code: 'RESERVA_EXPIRADA',
            message: 'El tiempo de 5 minutos expiró. La reserva fue cancelada y el asiento quedó libre.'
        });
    } catch (error) {
        console.error('Error al expirar reserva:', error);
        return res.status(500).json({ success: false, message: 'No fue posible expirar la reserva.' });
    }
};

const subirComprobanteTransferencia = async (req, res) => {
    const idParam = texto(req.params.idBoleto).toUpperCase();
    let ids = idParam ? [idParam] : [];
    if (!ids.length && req.body?.idBoletos) {
        try {
            const parsed = typeof req.body.idBoletos === 'string' ? JSON.parse(req.body.idBoletos) : req.body.idBoletos;
            if (Array.isArray(parsed)) ids = parsed.map((x) => texto(x).toUpperCase()).filter(Boolean);
        } catch {
            ids = [texto(req.body.idBoletos).toUpperCase()].filter(Boolean);
        }
    }

    if (!ids.length) {
        if (req.file) await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ success: false, message: 'Indica la reserva a la que corresponde el comprobante.' });
    }
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Debes adjuntar el archivo del comprobante de transferencia (JPG, PNG o PDF).' });
    }

    const comprobanteUrl = `/uploads/${req.file.filename}`;
    const bancoOrigen = texto(req.body?.bancoOrigen).slice(0, 60) || null;
    const cedulaUsuario = req.auth?.id;

    let transaccion;
    try {
        const pool = await conectarBD();
        const schema = await pool.request().query(`
            SELECT CASE WHEN COL_LENGTH('dbo.BOLETOS', 'FEC_EXP_RES_UTC') IS NOT NULL THEN 1 ELSE 0 END AS TEMPORIZADOR_DISPONIBLE
        `);
        const tieneTemporizador = schema.recordset?.[0]?.TEMPORIZADOR_DISPONIBLE === 1;

        transaccion = new sql.Transaction(pool);
        await transaccion.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

        for (const idBoleto of ids) {
            const consulta = await transaccion.request()
                .input('idBoleto', sql.VarChar(5), idBoleto)
                .input('cedula', sql.VarChar(10), cedulaUsuario)
                .query(`
                    SELECT ID_BOL, EST_BOL, MET_PAG_BOL
                           ${tieneTemporizador ? ', FEC_EXP_RES_UTC, EST_REV_PAG, CASE WHEN FEC_EXP_RES_UTC IS NOT NULL AND FEC_EXP_RES_UTC <= SYSUTCDATETIME() THEN 1 ELSE 0 END AS EXPIRADO' : ''}
                    FROM dbo.BOLETOS WITH (UPDLOCK, HOLDLOCK)
                    WHERE ID_BOL = @idBoleto AND ID_USU_FIN = @cedula
                `);

            if (!consulta.recordset.length) {
                await transaccion.rollback();
                await fs.unlink(req.file.path).catch(() => {});
                return res.status(404).json({ success: false, message: 'Reserva no encontrada o no pertenece a tu usuario.' });
            }

            const fila = consulta.recordset[0];
            const estado = String(fila.EST_BOL || '').toUpperCase();

            if (fila.EXPIRADO === 1 || estado === 'VENCIDO') {
                await transaccion.request()
                    .input('idBoleto', sql.VarChar(5), idBoleto)
                    .query(`
                        UPDATE dbo.BOLETOS
                        SET EST_BOL = 'VENCIDO'
                            ${tieneTemporizador ? ", EST_REV_PAG = 'EXPIRADO'" : ''}
                        WHERE ID_BOL = @idBoleto
                    `);
                await transaccion.commit();
                await fs.unlink(req.file.path).catch(() => {});
                return res.status(409).json({
                    success: false,
                    code: 'RESERVA_EXPIRADA',
                    message: 'El tiempo de 5 minutos para subir el comprobante expiró y el asiento fue liberado automáticamente.'
                });
            }

            if (estado !== 'RESERVADO' && estado !== 'PENDIENTE') {
                await transaccion.rollback();
                await fs.unlink(req.file.path).catch(() => {});
                return res.status(409).json({
                    success: false,
                    message: `La reserva ya no admite comprobante (estado actual: ${estado}).`
                });
            }

            const updateReq = transaccion.request()
                .input('idBoleto', sql.VarChar(5), idBoleto)
                .input('url', sql.VarChar(500), comprobanteUrl);

            if (tieneTemporizador) {
                updateReq.input('banco', sql.VarChar(60), bancoOrigen);
                await updateReq.query(`
                    UPDATE dbo.BOLETOS
                    SET COM_PAG_URL = @url,
                        BAN_ORI_BOL = COALESCE(@banco, BAN_ORI_BOL),
                        EST_REV_PAG = 'EN_REVISION',
                        FEC_EXP_RES_UTC = NULL
                    WHERE ID_BOL = @idBoleto
                `);
            } else {
                await updateReq.query(`
                    UPDATE dbo.BOLETOS
                    SET COM_PAG_URL = @url
                    WHERE ID_BOL = @idBoleto
                `);
            }
        }

        await transaccion.commit();
        return res.status(200).json({
            success: true,
            message: 'Comprobante de transferencia recibido. Tu reserva pasó a la bandeja de aprobación del oficinista.',
            comprobanteUrl,
            bancoOrigen,
            estadoRevision: 'EN_REVISION',
            boletos: ids
        });
    } catch (error) {
        if (transaccion) {
            try { await transaccion.rollback(); } catch {}
        }
        if (req.file) await fs.unlink(req.file.path).catch(() => {});
        console.error('Error al subir comprobante de transferencia:', error);
        return res.status(500).json({ success: false, message: 'No fue posible registrar el comprobante de transferencia.' });
    }
};

const reservarAsiento = async (req, res) => {
    const idHoja = texto(req.body?.idHoja).toUpperCase();
    const metodoPagoCrudo = texto(req.body?.metodoPago);

    const limpiarTexto = (t) => (t ? t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() : '');
    const metodoLimpio = limpiarTexto(metodoPagoCrudo);

    let metodoPago = '';
    if (metodoLimpio.includes('DEPOSITO')) {
        metodoPago = 'DEPOSITO';
    } else if (metodoLimpio.includes('TRANSFERENCIA')) {
        metodoPago = 'TRANSFERENCIA';
    } else if (metodoLimpio.includes('EFECTIVO')) {
        metodoPago = 'EFECTIVO';
    }

    const cedulaTitular = texto(req.body?.cedulaTitular);
    if (cedulaTitular !== req.auth?.id) {
        if (req.file) await fs.unlink(req.file.path).catch(() => {});
        return res.status(403).json({ success: false, message: 'El titular debe ser el usuario autenticado.' });
    }

    if (metodoPago === 'EFECTIVO') {
        if (req.file) await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({
            success: false,
            code: 'EFECTIVO_SOLO_VENTANILLA',
            message: 'El pago en efectivo se realiza exclusivamente en la ventanilla física con el oficinista.'
        });
    }

    const comprobanteUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const bancoOrigen = texto(req.body?.bancoOrigen).slice(0, 60) || null;

    let estadoBoleto = 'RESERVADO';
    if (metodoPago === 'DEPOSITO') {
        estadoBoleto = 'PAGADO';
    }

    let idAsientos;
    let pasajeros;
    try {
        idAsientos = JSON.parse(req.body?.idAsientos || '[]').map((id) => texto(id).toUpperCase());
        pasajeros = JSON.parse(req.body?.pasajeros || '[]');
    } catch {
        if (req.file) await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ success: false, message: 'Formato de datos inválido.' });
    }

    if (!idAsientos.length || idAsientos.length > 10) {
        if (req.file) await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ success: false, message: 'Selecciona entre 1 y 10 asientos.' });
    }

    if (!['DEPOSITO', 'TRANSFERENCIA'].includes(metodoPago)) {
        if (req.file) await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ success: false, message: 'Método de pago no válido. Usa Transferencia o Depósito.' });
    }

    const pool = await conectarBD();
    const schema = await pool.request().query(`
        SELECT
            CASE WHEN COL_LENGTH('dbo.BOLETOS','CED_PAS_BOL') IS NOT NULL AND COL_LENGTH('dbo.BOLETOS','TIP_PAS_BOL') IS NOT NULL THEN 1 ELSE 0 END AS RESERVAS_DISPONIBLES,
            CASE WHEN COL_LENGTH('dbo.BOLETOS','FEC_EXP_RES_UTC') IS NOT NULL THEN 1 ELSE 0 END AS TEMPORIZADOR_DISPONIBLE,
            CASE WHEN COL_LENGTH('dbo.FRECUENCIAS','TAR_BAS_FRE') IS NOT NULL THEN 1 ELSE 0 END AS TARIFA_FRECUENCIA_DISPONIBLE
    `);
    const infoSchema = schema.recordset[0] || {};
    if (infoSchema.RESERVAS_DISPONIBLES !== 1) {
        if (req.file) await fs.unlink(req.file.path).catch(() => {});
        return res.status(503).json({ success: false, message: 'Las reservas requieren aplicar migracion_pasajeros_facturacion.sql. No se realizó ningún cobro.' });
    }

    const tieneTemporizador = infoSchema.TEMPORIZADOR_DISPONIBLE === 1;
    const tieneTarifaFrecuencia = infoSchema.TARIFA_FRECUENCIA_DISPONIBLE === 1;

    if (tieneTemporizador) {
        await liberarReservasVencidas(pool, idHoja);
    }

    const transaccion = new sql.Transaction(pool);

    try {
        await transaccion.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

        const parametrosAsientos = idAsientos.map((_, index) => `@idAsiento${index}`);
        await cc.lock(transaccion);
        await cc.sale(transaccion, idHoja);
        await require('../services/workerSchedule').reserve(transaccion, cedulaTitular, idHoja, req.auth.rolId);
        const company = await transaccion.request().input('sheet', sql.VarChar(5), idHoja).query(`
            SELECT C.EST_COP FROM dbo.COOPERATIVAS C WITH (UPDLOCK,HOLDLOCK)
            JOIN dbo.FRECUENCIAS F ON F.ID_COP_PER=C.ID_COP
            JOIN dbo.HOJAS_RUTAS H ON H.ID_FRE_PER=F.ID_FRE
            JOIN dbo.BUSES B ON B.ID_BUS=${cc.effectiveBus()} AND B.ID_COP_PER=C.ID_COP
            WHERE H.ID_HOJ=@sheet AND C.EST_COP='1' AND UPPER(LTRIM(RTRIM(H.EST_VIA_HOJ))) IN ('PROGRAMADO','PROGRAMADA')
        `);
        if (!company.recordset.length) {
            await transaccion.rollback();
            if (req.file) await fs.unlink(req.file.path).catch(() => {});
            return res.status(409).json({ success: false, message: 'El viaje no está disponible para nuevas reservas. La cooperativa puede estar suspendida o inactiva.' });
        }

        const solicitudAsientos = transaccion.request().input('idHoja', sql.VarChar(5), idHoja);
        idAsientos.forEach((id, index) => solicitudAsientos.input(`idAsiento${index}`, sql.VarChar(5), id));

        const asiento = await solicitudAsientos.query(`
            SELECT H.ID_HOJ, F.CIU_ORI_FRE, F.CIU_DES_FRE, A.ID_ASI, T.PRE_TIP, T.NOM_TIP
                   ${tieneTarifaFrecuencia ? ', F.TAR_BAS_FRE, A.PIS_ASI' : ''}
            FROM HOJAS_RUTAS H WITH (UPDLOCK, HOLDLOCK)
            INNER JOIN FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
            INNER JOIN ASIENTOS_BUS A ON A.ID_BUS_PER = ${cc.effectiveBus()}
            INNER JOIN TIPOS_ASIENTOS T ON T.ID_TIP = A.ID_TIP_PER
            WHERE H.ID_HOJ = @idHoja AND A.ID_ASI IN (${parametrosAsientos.join(', ')})
        `);

        if (asiento.recordset.length !== idAsientos.length) {
            await transaccion.rollback();
            if (req.file) await fs.unlink(req.file.path).catch(() => {});
            return res.status(404).json({ success: false, message: 'Uno o más asientos no pertenecen a la hoja.' });
        }

        const occupiedRequest = transaccion.request().input('sheetOccupied', sql.VarChar(5), idHoja);
        idAsientos.forEach((id, i) => occupiedRequest.input('occupied' + i, sql.VarChar(5), id));
        const occupied = await occupiedRequest.query(`SELECT ID_BOL FROM dbo.BOLETOS WITH(UPDLOCK,HOLDLOCK) WHERE ID_HOJ_PER=@sheetOccupied AND ID_ASI_PER IN (${idAsientos.map((_, i) => '@occupied' + i).join(',')}) AND ${cc.enabled() ? cc.activeTicket : "UPPER(LTRIM(RTRIM(ISNULL(EST_BOL,'')))) NOT IN ('CANCELADO','ANULADO','INVALIDO','VENCIDO')"}`);
        if (occupied.recordset.length) {
            await transaccion.rollback();
            if (req.file) await fs.unlink(req.file.path).catch(() => {});
            return res.status(409).json({ success: false, message: 'Uno de los asientos ya está reservado o vendido. Actualiza la disponibilidad.' });
        }

        const usuario = await transaccion.request()
            .input('cedula', sql.VarChar(10), cedulaTitular)
            .query("SELECT ID_USU FROM USUARIOS WHERE ID_USU = @cedula AND ISNULL(EST_USU, '1') <> '0'");

        if (!usuario.recordset.length) {
            await transaccion.rollback();
            if (req.file) await fs.unlink(req.file.path).catch(() => {});
            return res.status(404).json({ success: false, message: 'El usuario titular no existe en la base de datos.' });
        }

        const usuarioId = usuario.recordset[0].ID_USU;
        const reservas = [];
        const tieneComprobante = Boolean(comprobanteUrl);
        const expiraDate = (metodoPago === 'TRANSFERENCIA' && !tieneComprobante)
            ? new Date(Date.now() + EXPIRACION_TRANSFERENCIA_SEGUNDOS * 1000)
            : null;
        const estRevPag = metodoPago === 'TRANSFERENCIA'
            ? (tieneComprobante ? 'EN_REVISION' : 'PENDIENTE_COMPROBANTE')
            : null;

        for (let index = 0; index < idAsientos.length; index += 1) {
            const datos = asiento.recordset.find((fila) => fila.ID_ASI === idAsientos[index]);
            const pasajero = pasajeros[index] || { tipo: 'ADULTO' };
            const tipoPasajero = texto(pasajero.tipo).toUpperCase() || 'ADULTO';

            const tarifaBaseFre = Number(datos.TAR_BAS_FRE) > 0 ? Number(datos.TAR_BAS_FRE) : 0;
            const recargoAsiento = Number(datos.PRE_TIP) || 0;
            const precioBase = tarifaBaseFre > 0
                ? tarifaBaseFre + recargoAsiento
                : (recargoAsiento > 0 ? recargoAsiento : 5.00);
            const aplicaDescuento = ['NINO', 'ADULTO_MAYOR', 'DISCAPACIDAD', 'TERCERA_EDAD', 'MENOR_EDAD'].includes(tipoPasajero);
            const precioFinal = Math.round((aplicaDescuento ? precioBase * 0.5 : precioBase) * 100) / 100;

            const idBoleto = generarCodigo(metodoPago === 'DEPOSITO' ? 'B' : 'R');
            const codigoQr = generarQr(idBoleto, idHoja, datos.ID_ASI);

            const reqInsert = transaccion.request()
                .input('idBoleto', sql.VarChar(5), idBoleto)
                .input('origen', sql.VarChar(20), datos.CIU_ORI_FRE)
                .input('destino', sql.VarChar(20), datos.CIU_DES_FRE)
                .input('precio', sql.Decimal(18, 2), precioFinal)
                .input('tipoDescuento', sql.VarChar(30), tipoPasajero === 'ADULTO' ? (datos.NOM_TIP || 'NORMAL') : `${tipoPasajero}_50`)
                .input('tipoPasajero', sql.VarChar(15), tipoPasajero)
                .input('cedulaPasajero', sql.VarChar(10), cedulaTitular)
                .input('metodoPago', sql.VarChar(15), metodoPago)
                .input('codigoQr', sql.VarChar(500), codigoQr)
                .input('comprobanteUrl', sql.VarChar(500), comprobanteUrl)
                .input('estadoBoleto', sql.VarChar(15), estadoBoleto)
                .input('idHoja', sql.VarChar(5), idHoja)
                .input('idAsiento', sql.VarChar(5), datos.ID_ASI)
                .input('usuarioId', sql.VarChar(10), usuarioId);

            if (tieneTemporizador) {
                reqInsert
                    .input('bancoOrigen', sql.VarChar(60), bancoOrigen)
                    .input('fecExpUtc', sql.DateTime2(0), expiraDate)
                    .input('estRevPag', sql.VarChar(25), estRevPag);
                await reqInsert.query(`
                    INSERT INTO BOLETOS
                        (ID_BOL, ORI_TRA_BOL, DES_TRA_BOL, TIP_DES_BOL, PRE_FIN_BOL, MET_PAG_BOL, COM_PAG_URL, BAN_ORI_BOL, EST_BOL, COD_QR_BOL, FEC_COM_BOL, ID_HOJ_PER, ID_ASI_PER, ID_USU_FIN, CED_PAS_BOL, TIP_PAS_BOL, FEC_EXP_RES_UTC, EST_REV_PAG)
                    VALUES
                        (@idBoleto, @origen, @destino, @tipoDescuento, @precio, @metodoPago, @comprobanteUrl, @bancoOrigen, @estadoBoleto, @codigoQr, CONVERT(date, GETDATE()), @idHoja, @idAsiento, @usuarioId, @cedulaPasajero, @tipoPasajero, @fecExpUtc, @estRevPag)
                `);
            } else {
                await reqInsert.query(`
                    INSERT INTO BOLETOS
                        (ID_BOL, ORI_TRA_BOL, DES_TRA_BOL, TIP_DES_BOL, PRE_FIN_BOL, MET_PAG_BOL, COM_PAG_URL, EST_BOL, COD_QR_BOL, FEC_COM_BOL, ID_HOJ_PER, ID_ASI_PER, ID_USU_FIN, CED_PAS_BOL, TIP_PAS_BOL)
                    VALUES
                        (@idBoleto, @origen, @destino, @tipoDescuento, @precio, @metodoPago, @comprobanteUrl, @estadoBoleto, @codigoQr, CONVERT(date, GETDATE()), @idHoja, @idAsiento, @usuarioId, @cedulaPasajero, @tipoPasajero)
                `);
            }

            reservas.push({
                idBoleto,
                idHoja,
                idAsiento: datos.ID_ASI,
                estado: estadoBoleto,
                estadoRevision: estRevPag,
                expiraEnUtc: expiraDate ? expiraDate.toISOString() : null,
                segundosRestantes: expiraDate ? EXPIRACION_TRANSFERENCIA_SEGUNDOS : 0,
                codigoQr,
                precio: precioFinal
            });
        }

        await transaccion.commit();
        let mensajeExito = 'Operación procesada con éxito.';
        if (metodoPago === 'DEPOSITO') {
            mensajeExito = 'Depósito procesado. Tus boletos están en estado PAGADO.';
        } else if (metodoPago === 'TRANSFERENCIA') {
            mensajeExito = tieneComprobante
                ? 'Transferencia y comprobante enviados a la bandeja de aprobación del oficinista.'
                : 'Asiento retenido temporalmente por 5 minutos. Sube el comprobante de transferencia antes de que expire el temporizador.';
        }

        return res.status(201).json({
            success: true,
            message: mensajeExito,
            requiereComprobante: metodoPago === 'TRANSFERENCIA' && !tieneComprobante,
            expiraEnUtc: expiraDate ? expiraDate.toISOString() : null,
            segundosRestantes: expiraDate ? EXPIRACION_TRANSFERENCIA_SEGUNDOS : 0,
            reservas
        });
    } catch (error) {
        try { await transaccion.rollback(); } catch {}
        if (req.file) { try { await fs.unlink(req.file.path); } catch {} }
        const control = cc.respond(res, error);
        if (control) return control;
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        console.error('Error al procesar reserva:', error);
        return res.status(500).json({ success: false, message: 'No fue posible procesar la operación.' });
    }
};

module.exports = {
    EXPIRACION_TRANSFERENCIA_MINUTOS,
    EXPIRACION_TRANSFERENCIA_SEGUNDOS,
    liberarReservasVencidas,
    obtenerAsientos,
    reservarAsiento,
    subirComprobanteTransferencia,
    expirarReservaUsuario,
    obtenerMisBoletos,
    cancelarReservaUsuario
};
