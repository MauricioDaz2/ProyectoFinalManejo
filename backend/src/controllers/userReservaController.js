const crypto = require('crypto');
const fs = require('fs/promises');
const { sql, conectarBD } = require('../config/db');
const cc = require('../services/frequencyControl');

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

const obtenerAsientos = async (req, res) => {
    const cooperativa = texto(req.query.cooperativa).toUpperCase();
    if (req.query.cooperativa !== undefined && !/^[A-Z0-9_-]{1,5}$/.test(cooperativa)) return res.status(400).json({ success: false, message: 'Cooperativa no válida.' });
    const idHoja = texto(req.params.idHoja).toUpperCase();
    if (!/^[A-Z0-9_-]{1,5}$/.test(idHoja)) {
        return res.status(400).json({ success: false, message: 'La hoja de ruta indicada no es válida.' });
    }

    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('idHoja', sql.VarChar(5), idHoja)
            .input('cooperativa', sql.VarChar(5), cooperativa || null)
            .query(`
                SELECT H.ID_HOJ, H.FEC_PRO_HOJ, H.EST_VIA_HOJ, B.ID_BUS, B.NUM_BUS, B.NUM_PIS, B.IMG_URL_BUS,
                   A.ID_ASI, A.PIS_ASI, A.ID_TIP_PER, T.NOM_TIP, T.PRE_TIP,
                   CASE
                       WHEN UPPER(LTRIM(RTRIM(ISNULL(O.EST_BOL, '')))) IN ('EMITIDO', 'PAGADO', 'USADO', 'OCUPADO', 'CONFIRMADO') THEN 'OCUPADO'
                        WHEN UPPER(LTRIM(RTRIM(ISNULL(O.EST_BOL, '')))) IN ('RESERVADO', 'PENDIENTE') THEN 'RESERVADO'
                        ${cc.enabled() ? "WHEN O.ID_BOL IS NOT NULL THEN 'OCUPADO'" : ''}
                       ELSE 'LIBRE'
                   END AS ESTADO_ASIENTO,
                    O.ID_BOL
                    ${cc.enabled() ? ',CU.MAX_PASAJEROS,CU.PASAJEROS_USADOS' : ''}
            FROM HOJAS_RUTAS H
             INNER JOIN BUSES B ON B.ID_BUS = ${cc.effectiveBus()}
            INNER JOIN ASIENTOS_BUS A ON A.ID_BUS_PER = B.ID_BUS
             INNER JOIN TIPOS_ASIENTOS T ON T.ID_TIP = A.ID_TIP_PER
             ${cc.enabled() ? 'OUTER APPLY dbo.fn_CC_CupoDia(H.ID_FRE_PER,H.FEC_PRO_HOJ) CU' : ''}
            OUTER APPLY (
                SELECT TOP 1 BO.ID_BOL, BO.EST_BOL
                FROM BOLETOS BO
                WHERE BO.ID_HOJ_PER = H.ID_HOJ 
                  AND BO.ID_ASI_PER = A.ID_ASI
                  AND ${cc.enabled() ? cc.activeTicket : "UPPER(LTRIM(RTRIM(ISNULL(BO.EST_BOL, '')))) IN ('EMITIDO', 'PAGADO', 'USADO', 'OCUPADO', 'CONFIRMADO', 'RESERVADO', 'PENDIENTE')"}
                ORDER BY 
                    CASE 
                        WHEN UPPER(LTRIM(RTRIM(BO.EST_BOL))) IN ('EMITIDO', 'PAGADO', 'USADO', 'OCUPADO', 'CONFIRMADO') THEN 0 
                        WHEN UPPER(LTRIM(RTRIM(BO.EST_BOL))) IN ('RESERVADO', 'PENDIENTE') THEN 1 
                        ELSE 2 
                    END,
                    BO.FEC_COM_BOL DESC
            ) O
             WHERE H.ID_HOJ = @idHoja
               ${cc.enabled() ? `AND H.FEC_PRO_HOJ>=${cc.today} AND ${cc.allowedSheet}
                   AND UPPER(LTRIM(RTRIM(H.EST_VIA_HOJ))) IN ('PROGRAMADO','PROGRAMADA')
                   AND UPPER(LTRIM(RTRIM(B.EST_BUS))) IN ('ACTIVO','1','OPERANDO')` : ''}
              AND EXISTS (
                  SELECT 1 FROM FRECUENCIAS F
                  JOIN RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
                  JOIN COOPERATIVAS C ON C.ID_COP = R.ID_COP_PER
                  WHERE F.ID_FRE = H.ID_FRE_PER AND (@cooperativa IS NULL OR C.ID_COP = @cooperativa)
                    AND B.ID_COP_PER = C.ID_COP AND C.EST_COP = '1'
              )
            ORDER BY A.PIS_ASI, A.ID_ASI
            `);

        if (resultado.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'No se encontró la hoja de ruta o no tiene asientos.' });
        }

        const primerAsiento = resultado.recordset[0];
        const cupo = primerAsiento.MAX_PASAJEROS == null ? null
            : Math.max(0, primerAsiento.MAX_PASAJEROS - Number(primerAsiento.PASAJEROS_USADOS));
        return res.status(200).json({
            success: true,
            viaje: {
                idHoja: primerAsiento.ID_HOJ,
                fecha: primerAsiento.FEC_PRO_HOJ,
                estado: primerAsiento.EST_VIA_HOJ,
                idBus: primerAsiento.ID_BUS,
                numeroBus: primerAsiento.NUM_BUS,
                pisos: primerAsiento.NUM_PIS,
                imgBus: primerAsiento.IMG_URL_BUS,
                cupoPasajerosDisponible: cupo
            },
            asientos: resultado.recordset
        });
    } catch (error) {
        console.error('Error al consultar asientos:', error);
        return res.status(500).json({ success: false, message: 'No fue posible consultar los asientos.' });
    }
};
const obtenerMisBoletos = async (req, res) => {
    const cedulaUsuario = texto(req.params.cedula);
    if(cedulaUsuario!==req.auth?.id)return res.status(403).json({success:false,message:'Solo puedes consultar tus propios boletos.'});
    if (!cedulaUsuario) {
        return res.status(400).json({ success: false, message: 'Cédula de usuario no proporcionada.' });
    }

    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
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

        return res.status(200).json({
            success: true,
            boletos: resultado.recordset
        });
    } catch (error) {
        console.error('Error al consultar los boletos del usuario:', error);
        return res.status(500).json({ success: false, message: 'No fue posible consultar el historial.' });
    }
};
const cancelarReservaUsuario = async (req, res) => {
    const idBoleto = texto(req.params.idBoleto).toUpperCase();
    const cedulaUsuario = texto(req.body?.cedula);
    if(cedulaUsuario!==req.auth?.id)return res.status(403).json({success:false,message:'Solo puedes cancelar tus propias reservas.'});

    if (!idBoleto) {
        return res.status(400).json({ success: false, message: 'ID de boleto no válido.' });
    }

    try {
        const pool = await conectarBD();
        const transaccion = new sql.Transaction(pool);
        await transaccion.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

        // Verificamos que el boleto pertenezca al usuario y esté en estado reservado
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

        // Actualizamos el estado del boleto a CANCELADO (o ELIMINADO según prefieras liberar el asiento)
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

const reservarAsiento = async (req, res) => {
    const idHoja = texto(req.body?.idHoja).toUpperCase();
    const metodoPagoCrudo = texto(req.body?.metodoPago);
    
    // Normalización robusta para limpiar tildes y espacios
    const limpiarTexto = (t) => (t ? t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : '');
    const metodoLimpio = limpiarTexto(metodoPagoCrudo);

    let metodoPago = '';
    if (metodoLimpio.includes('DEPOSITO') || metodoLimpio.includes('DEPÓSITO')) {
        metodoPago = 'DEPOSITO';
    } else if (metodoLimpio.includes('TRANSFERENCIA')) {
        metodoPago = 'TRANSFERENCIA';
    } else if (metodoLimpio.includes('EFECTIVO')) {
        metodoPago = 'EFECTIVO';
    }

    const cedulaTitular = texto(req.body?.cedulaTitular);
    if(cedulaTitular!==req.auth?.id) {
        if(req.file)await fs.unlink(req.file.path).catch(()=>{});
        return res.status(403).json({success:false,message:'El titular debe ser el usuario autenticado.'});
    }
    const comprobanteUrl = req.file ? `/uploads/${req.file.filename}` : null;

    let estadoBoleto = 'RESERVADO'; 
    if (metodoPago === 'DEPOSITO') {
        estadoBoleto = 'PAGADO'; 
    }

    let idAsientos;
    let pasajeros;
    try {
        idAsientos = JSON.parse(req.body?.idAsientos || '[]').map((id) => texto(id).toUpperCase());
        pasajeros = JSON.parse(req.body?.pasajeros || '[]');
    } catch (error) {
        return res.status(400).json({ success: false, message: 'Formato de datos inválido.' });
    }

    if (!idAsientos.length || idAsientos.length > 10) {
        return res.status(400).json({ success: false, message: 'Selecciona entre 1 y 10 asientos.' });
    }
    
    // Validación de método de pago válido
    if (!['EFECTIVO', 'DEPOSITO', 'TRANSFERENCIA'].includes(metodoPago)) {
        return res.status(400).json({ success: false, message: 'Método de pago no válido.' });
    }
    
    if (metodoPago === 'TRANSFERENCIA' && !req.file) {
        return res.status(400).json({ success: false, message: 'Adjunta el comprobante de transferencia.' });
    }

    const pool = await conectarBD();
    const schema = await pool.request().query("SELECT CASE WHEN COL_LENGTH('dbo.BOLETOS','CED_PAS_BOL') IS NOT NULL AND COL_LENGTH('dbo.BOLETOS','TIP_PAS_BOL') IS NOT NULL THEN 1 ELSE 0 END AS RESERVAS_DISPONIBLES");
    if(schema.recordset[0]?.RESERVAS_DISPONIBLES!==1) {
        if(req.file)await fs.unlink(req.file.path).catch(()=>{});
        return res.status(503).json({success:false,message:'Las reservas requieren aplicar migracion_pasajeros_facturacion.sql. No se realizó ningún cobro.'});
    }
    const transaccion = new sql.Transaction(pool);

    try {
        await transaccion.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

        const parametrosAsientos = idAsientos.map((_, index) => `@idAsiento${index}`);
        await cc.lock(transaccion);
        await cc.sale(transaccion,idHoja);
        await require('../services/workerSchedule').reserve(transaccion,cedulaTitular,idHoja,req.auth.rolId);
        const company = await transaccion.request().input('sheet', sql.VarChar(5), idHoja).query(`
            SELECT C.EST_COP FROM dbo.COOPERATIVAS C WITH (UPDLOCK,HOLDLOCK)
            JOIN dbo.RESOLUCIONES_ANT R ON R.ID_COP_PER=C.ID_COP
            JOIN dbo.FRECUENCIAS F ON F.ID_RES_PER=R.ID_RES
            JOIN dbo.HOJAS_RUTAS H ON H.ID_FRE_PER=F.ID_FRE
             JOIN dbo.BUSES B ON B.ID_BUS=${cc.effectiveBus()} AND B.ID_COP_PER=C.ID_COP
            WHERE H.ID_HOJ=@sheet AND C.EST_COP='1' AND UPPER(LTRIM(RTRIM(H.EST_VIA_HOJ))) IN ('PROGRAMADO','PROGRAMADA')
        `);
        if (!company.recordset.length) {
            await transaccion.rollback();
            if (req.file) await fs.unlink(req.file.path).catch(() => {});
            return res.status(409).json({success:false,message:'El viaje no está disponible para nuevas reservas. La cooperativa puede estar suspendida o inactiva.'});
        }
        const solicitudAsientos = transaccion.request().input('idHoja', sql.VarChar(5), idHoja);
        idAsientos.forEach((id, index) => solicitudAsientos.input(`idAsiento${index}`, sql.VarChar(5), id));

        const asiento = await solicitudAsientos.query(`
            SELECT H.ID_HOJ, F.CIU_ORI_FRE, F.CIU_DES_FRE, A.ID_ASI, T.PRE_TIP, T.NOM_TIP
            FROM HOJAS_RUTAS H WITH (UPDLOCK, HOLDLOCK)
            INNER JOIN FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
             INNER JOIN ASIENTOS_BUS A ON A.ID_BUS_PER = ${cc.effectiveBus()}
            INNER JOIN TIPOS_ASIENTOS T ON T.ID_TIP = A.ID_TIP_PER
            WHERE H.ID_HOJ = @idHoja AND A.ID_ASI IN (${parametrosAsientos.join(', ')})
        `);

        if (asiento.recordset.length !== idAsientos.length) {
            await transaccion.rollback();
            return res.status(404).json({ success: false, message: 'Uno o más asientos no pertenecen a la hoja.' });
        }

        const occupiedRequest=transaccion.request().input('sheetOccupied',sql.VarChar(5),idHoja);
        idAsientos.forEach((id,i)=>occupiedRequest.input('occupied'+i,sql.VarChar(5),id));
        const occupied=await occupiedRequest.query(`SELECT ID_BOL FROM dbo.BOLETOS WITH(UPDLOCK,HOLDLOCK) WHERE ID_HOJ_PER=@sheetOccupied AND ID_ASI_PER IN (${idAsientos.map((_,i)=>'@occupied'+i).join(',')}) AND ${cc.enabled() ? cc.activeTicket : "UPPER(LTRIM(RTRIM(ISNULL(EST_BOL,'')))) NOT IN ('CANCELADO','ANULADO','INVALIDO','VENCIDO')"}`);
        if(occupied.recordset.length){await transaccion.rollback();if(req.file)await fs.unlink(req.file.path).catch(()=>{});return res.status(409).json({success:false,message:'Uno de los asientos ya está reservado o vendido. Actualiza la disponibilidad.'});}

        const usuario = await transaccion.request()
            .input('cedula', sql.VarChar(10), cedulaTitular)
            .query("SELECT ID_USU FROM USUARIOS WHERE ID_USU = @cedula AND ISNULL(EST_USU, '1') <> '0'");

        if (!usuario.recordset.length) {
            await transaccion.rollback();
            return res.status(404).json({ success: false, message: 'El usuario titular no existe en la base de datos.' });
        }

        const usuarioId = usuario.recordset[0].ID_USU;
        const reservas = [];

        for (let index = 0; index < idAsientos.length; index += 1) {
            const datos = asiento.recordset.find((fila) => fila.ID_ASI === idAsientos[index]);
            const pasajero = pasajeros[index] || { tipo: 'ADULTO' };
            const tipoPasajero = texto(pasajero.tipo).toUpperCase();
            
            let precioBase = Number(datos.PRE_TIP);
            let precioFinal = (tipoPasajero === 'NINO' || tipoPasajero === 'ADULTO_MAYOR') ? precioBase * 0.5 : precioBase;

            const idBoleto = generarCodigo(metodoPago === 'DEPOSITO' ? 'B' : 'R');
            const codigoQr = generarQr(idBoleto, idHoja, datos.ID_ASI);

            await transaccion.request()
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
                .input('usuarioId', sql.VarChar(10), usuarioId)
                .query(`
                    INSERT INTO BOLETOS
                        (ID_BOL, ORI_TRA_BOL, DES_TRA_BOL, TIP_DES_BOL, PRE_FIN_BOL, MET_PAG_BOL, COM_PAG_URL, EST_BOL, COD_QR_BOL, FEC_COM_BOL, ID_HOJ_PER, ID_ASI_PER, ID_USU_FIN, CED_PAS_BOL, TIP_PAS_BOL)
                    VALUES
                        (@idBoleto, @origen, @destino, @tipoDescuento, @precio, @metodoPago, @comprobanteUrl, @estadoBoleto, @codigoQr, CONVERT(date, GETDATE()), @idHoja, @idAsiento, @usuarioId, @cedulaPasajero, @tipoPasajero)
                `);

            reservas.push({ idBoleto, idHoja, idAsiento: datos.ID_ASI, estado: estadoBoleto, codigoQr, precio: precioFinal });
        }

        await transaccion.commit();
        let mensajeExito = 'Operación procesada con éxito.';
        if (metodoPago === 'DEPOSITO') {
            mensajeExito = 'Depósito procesado. Tus boletos están en estado PAGADO.';
        } else if (metodoPago === 'TRANSFERENCIA') {
            mensajeExito = 'Transferencia enviada a revisión. Queda en estado RESERVADO.';
        } else if (metodoPago === 'EFECTIVO') {
            mensajeExito = 'Reserva generada. Paga en ventanilla para confirmar.';
        }

        return res.status(201).json({ success: true, message: mensajeExito, reservas });
    } catch (error) {
        try { await transaccion.rollback(); } catch (e) {}
        if (req.file) { try { await fs.unlink(req.file.path); } catch (e) {} }
        const control = cc.respond(res, error);
        if (control) return control;
        if(error.status)return res.status(error.status).json({success:false,message:error.message});
        console.error('Error al procesar reserva:', error);
        return res.status(500).json({ success: false, message: 'No fue posible procesar la operación.' });
    }
};

module.exports = { 
    obtenerAsientos, 
    reservarAsiento, 
    obtenerMisBoletos, 
    cancelarReservaUsuario 
};
