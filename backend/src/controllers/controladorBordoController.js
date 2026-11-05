const { sql, conectarBD } = require('../config/db');

const generarId = (prefijo, ultimoId) => {
    const numero = ultimoId ? parseInt(String(ultimoId).replace(/\D/g, ''), 10) || 0 : 0;
    return prefijo + String(numero + 1).padStart(5 - prefijo.length, '0');
};

// 1. Listar hojas de ruta asignadas a un controlador específico
const listarHojasPorControlador = async (req, res) => {
    const { idControlador } = req.params;
    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('idCon', sql.VarChar, idControlador)
            .query(`
                SELECT H.ID_HOJ,
                       CONVERT(varchar(10), H.FEC_PRO_HOJ, 23) AS FEC_PRO_HOJ,
                       H.EST_VIA_HOJ,
                       F.CIU_ORI_FRE,
                       F.CIU_DES_FRE,
                       B.ID_BUS,
                       B.NUM_BUS,
                       B.PLA_BUS
                FROM HOJAS_RUTAS H
                INNER JOIN FRECUENCIAS F ON H.ID_FRE_PER = F.ID_FRE
                INNER JOIN BUSES B       ON H.ID_BUS_PER = B.ID_BUS
                WHERE H.ID_USU_CON = @idCon AND H.EST_VIA_HOJ = 'PROGRAMADO'
            `);

        res.status(200).json({ success: true, hojas: resultado.recordset });
    } catch (error) {
        console.error('Error al listar hojas del controlador:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

// 2. Listar asientos disponibles de una hoja de ruta para venta a bordo
const listarAsientosDisponibles = async (req, res) => {
    const { idHoj } = req.params;
    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('idHoj', sql.VarChar, idHoj)
            .query(`
                SELECT A.ID_ASI, A.PIS_ASI, T.NOM_TIP, T.PRE_TIP
                FROM ASIENTOS_BUS A
                INNER JOIN HOJAS_RUTAS H ON A.ID_BUS_PER = H.ID_BUS_PER
                INNER JOIN TIPOS_ASIENTOS T ON A.ID_TIP_PER = T.ID_TIP
                WHERE H.ID_HOJ = @idHoj 
                  AND A.ID_ASI NOT IN (
                      SELECT ID_ASI_PER FROM BOLETOS 
                      WHERE ID_HOJ_PER = @idHoj AND EST_BOL IN ('Reservado', 'OK', 'Usado')
                  )
            `);

        res.status(200).json({ success: true, asientos: resultado.recordset });
    } catch (error) {
        console.error('Error al listar asientos disponibles:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

// 3. Venta de boleto a bordo por el controlador (Efectivo)

// 3. Venta de boleto a bordo por el controlador (Efectivo)
const venderBoletoABordo = async (req, res) => {
    const { idHoj, idAsi, oriTra, desTra, preFin, idUsuCon } = req.body;

    if (!idHoj || !idAsi || !oriTra || !desTra || !preFin || !idUsuCon) {
        return res.status(400).json({ success: false, message: 'Faltan datos obligatorios para la venta.' });
    }

    try {
        const pool = await conectarBD();

        // 1. Consultar todos los IDs que comiencen con 'BOL' de forma segura
        const resultadoBoletos = await pool.request().query(`
            SELECT ID_BOL 
            FROM BOLETOS 
            WHERE ID_BOL LIKE 'BOL%'
        `);

        // 2. Calcular el número máximo de forma limpia en JavaScript
        let maxNum = 0;
        resultadoBoletos.recordset.forEach(row => {
            const match = row.ID_BOL.match(/^BOL(\d+)$/);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxNum) {
                    maxNum = num;
                }
            }
        });

        const nuevoId = `BOL${maxNum + 1}`;

        // Generar URL del código QR externo (Ej: api.qrserver.com con los datos del boleto)
        const datosQr = `Boleto:${nuevoId}|Hoja:${idHoj}|Asiento:${idAsi}`;
        const urlQr = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(datosQr)}`;

        await pool.request()
            .input('idBol', sql.VarChar, nuevoId)
            .input('ori', sql.VarChar, oriTra)
            .input('des', sql.VarChar, desTra)
            .input('tipDes', sql.VarChar, 'Ninguno')
            .input('pre', sql.Decimal(10, 2), preFin)
            .input('met', sql.VarChar, 'Efectivo')
            .input('est', sql.VarChar, 'OK')
            .input('qr', sql.VarChar, urlQr)
            .input('fecCom', sql.DateTime, new Date())
            .input('idHoj', sql.VarChar, idHoj)
            .input('idAsi', sql.VarChar, idAsi)
            .input('idCon', sql.VarChar, idUsuCon)
            .query(`
                INSERT INTO BOLETOS 
                (ID_BOL, ORI_TRA_BOL, DES_TRA_BOL, TIP_DES_BOL, PRE_FIN_BOL, MET_PAG_BOL, EST_BOL, COD_QR_BOL, FEC_COM_BOL, ID_HOJ_PER, ID_ASI_PER, ID_USU_CON)
                VALUES (@idBol, @ori, @des, @tipDes, @pre, @met, @est, @qr, @fecCom, @idHoj, @idAsi, @idCon)
            `);

        res.status(201).json({
            success: true,
            message: 'Boleto vendido a bordo correctamente.',
            idBoleto: nuevoId,
            codigoQrUrl: urlQr
        });

    } catch (error) {
        console.error('Error al vender boleto a bordo:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};
// 4. Escanear y validar código QR (Cambiar estado a 'Usado')
const escanerValidarBoleto = async (req, res) => {
    const { idBoleto, idUsuCon } = req.body;

    if (!idBoleto) {
        return res.status(400).json({ success: false, message: 'Código de boleto no proporcionado.' });
    }

    try {
        const pool = await conectarBD();

        // Buscar el boleto
        const boletoQuery = await pool.request()
            .input('idBol', sql.VarChar, idBoleto)
            .query('SELECT * FROM BOLETOS WHERE ID_BOL = @idBol');

        if (boletoQuery.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'El boleto no existe en el sistema.' });
        }

        const boleto = boletoQuery.recordset[0];

        if (boleto.EST_BOL === 'Usado') {
            return res.status(400).json({ success: false, message: '¡Atención! Este boleto ya fue utilizado (Escaneado previamente).' });
        }

        if (boleto.EST_BOL === 'Cancelado') {
            return res.status(400).json({ success: false, message: 'Error: Este boleto fue cancelado.' });
        }

        // Actualizar a estado 'Usado' y registrar el controlador que escaneó
        await pool.request()
            .input('idBol', sql.VarChar, idBoleto)
            .input('idCon', sql.VarChar, idUsuCon || null)
            .input('fecUso', sql.DateTime, new Date())
            .query(`
                UPDATE BOLETOS 
                SET EST_BOL = 'Usado', 
                    FEC_USO_BOL = @fecUso, 
                    ID_USU_CON = ISNULL(@idCon, ID_USU_CON)
                WHERE ID_BOL = @idBol
            `);

        res.status(200).json({
            success: true,
            message: `Acceso permitido. Boleto ${idBoleto} validado correctamente (Asiento: ${boleto.ID_ASI_PER}).`
        });

    } catch (error) {
        console.error('Error al validar boleto:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

module.exports = {
    listarHojasPorControlador,
    listarAsientosDisponibles,
    venderBoletoABordo,
    escanerValidarBoleto
};