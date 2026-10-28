const { sql, conectarBD } = require('../config/db');
const crypto = require('crypto');

/**
 * Módulo de Oficinista
 * - Venta de boletos en ventanilla
 * - Registro y búsqueda de pasajeros por cédula (USUARIOS.COR_USU)
 * - Validación de reservas/boletos por QR o cédula
 * - Cambio de estado de boletos
 */

const CODIGO_RE = /^[A-Z0-9_-]{1,10}$/;
const CODIGO_CORTO_RE = /^[A-Z0-9_-]{1,5}$/;
const ESTADOS_BOLETO = ['RESERVADO', 'EMITIDO', 'PAGADO', 'USADO', 'CANCELADO', 'ANULADO'];
const ESTADOS_ACTIVOS = ['RESERVADO', 'EMITIDO', 'PAGADO', 'USADO'];
const ESTADOS_VIAJE = ['PROGRAMADA', 'EN CURSO'];
const METODOS_PAGO = ['EFECTIVO', 'TRANSFERENCIA', 'DEPOSITO'];

const TRANSICIONES = {
    RESERVADO: ['PAGADO', 'USADO', 'CANCELADO', 'ANULADO'],
    EMITIDO: ['PAGADO', 'USADO', 'CANCELADO', 'ANULADO'],
    PAGADO: ['USADO', 'ANULADO'],
    USADO: [],
    CANCELADO: [],
    ANULADO: []
};

const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');
const codigo = (valor) => texto(valor).toUpperCase();
const soloDigitos = (valor) => texto(valor).replace(/\D/g, '');

function fecha(valor) {
    if (valor === undefined || valor === null || valor === '') return null;
    const normalizada = String(valor).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(normalizada) ? normalizada : null;
}

function hoyISO() {
    const ahora = new Date();
    const desfase = ahora.getTimezoneOffset() * 60000;
    return new Date(ahora.getTime() - desfase).toISOString().slice(0, 10);
}

function generarCodigoQR() {
    const token = crypto.randomBytes(16).toString('hex').toUpperCase();
    const fechaActual = hoyISO().replace(/-/g, '');
    return `QR-${fechaActual}-${token}`;
}

/**
 * Genera un código consecutivo de 5 caracteres (B0001) usando bloqueo de rango
 * dentro de la transacción de venta para evitar códigos duplicados.
 */
async function siguienteCodigoBoleto(request) {
    const resultado = await request.query(`
        SELECT ISNULL(MAX(TRY_CAST(SUBSTRING(ID_BOL, 2, 4) AS INT)), 0) + 1 AS siguiente
        FROM dbo.BOLETOS WITH (UPDLOCK, HOLDLOCK)
        WHERE ID_BOL LIKE 'B%'
    `);

    const siguiente = Number(resultado.recordset[0].siguiente) || 1;
    if (siguiente > 9999) {
        const error = new Error('Se agotó el consecutivo de boletos.');
        error.number = 51000;
        throw error;
    }

    return `B${String(siguiente).padStart(4, '0')}`;
}

function manejarError(res, contexto, error) {
    console.error(`Error en ${contexto}:`, error);
    const numero = error.number ?? error.originalError?.info?.number;

    if (numero === 2627 || numero === 2601) {
        return res.status(409).json({ success: false, message: 'Ya existe un registro con esos datos.' });
    }
    if (numero === 547) {
        return res.status(409).json({
            success: false,
            message: 'La operación no se puede completar por restricciones de integridad.'
        });
    }
    if (numero === 2628 || numero === 8152) {
        return res.status(400).json({
            success: false,
            message: 'Uno de los valores enviados supera la longitud permitida.'
        });
    }
    if (numero === 51000) {
        return res.status(409).json({ success: false, message: error.message });
    }

    return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
}

function cooperativaValida(valor) {
    const cooperativa = codigo(valor);
    if (!cooperativa) return null;
    return CODIGO_CORTO_RE.test(cooperativa) ? cooperativa : '';
}

/* -------------------------------------------------------------------------- */
/*                                 CONSULTAS                                  */
/* -------------------------------------------------------------------------- */

const SELECT_BOLETO = `
    SELECT BOL.ID_BOL, BOL.ORI_TRA_BOL, BOL.DES_TRA_BOL, BOL.TIP_DES_BOL,
           BOL.PRE_FIN_BOL, BOL.MET_PAG_BOL, BOL.COM_PAG_URL, BOL.EST_BOL,
           BOL.COD_QR_BOL, BOL.FEC_COM_BOL, BOL.FEC_USO_BOL,
           BOL.ID_HOJ_PER, BOL.ID_ASI_PER, BOL.ID_USU_FIN, BOL.ID_USU_OFI, BOL.ID_USU_CON,
           H.FEC_PRO_HOJ, H.EST_VIA_HOJ, H.OBS_HOJ,
           BUS.ID_BUS, BUS.NUM_BUS, BUS.PLA_BUS, BUS.NUM_PIS,
           F.ID_FRE, F.CIU_ORI_FRE, F.CIU_DES_FRE, F.FEC_HOR_INI_FRE,
           R.ID_COP_PER, C.NOM_COP,
           ASI.PIS_ASI,
           (SELECT COUNT(*)
              FROM dbo.ASIENTOS_BUS ASI2
             WHERE ASI2.ID_BUS_PER = ASI.ID_BUS_PER
               AND ASI2.PIS_ASI = ASI.PIS_ASI
               AND TRY_CAST(ASI2.ID_ASI AS INT) <= TRY_CAST(ASI.ID_ASI AS INT)) AS NUMERO_ASIENTO,
           T.NOM_TIP,
           PASAJERO.NOM_USU, PASAJERO.APE_USU, PASAJERO.COR_USU, PASAJERO.TEL_USU,
           OFICINISTA.NOM_USU AS NOM_OFICINISTA, OFICINISTA.APE_USU AS APE_OFICINISTA,
           CONTROL.NOM_USU AS NOM_CONTROLADOR, CONTROL.APE_USU AS APE_CONTROLADOR
    FROM dbo.BOLETOS BOL
    INNER JOIN dbo.HOJAS_RUTAS H ON H.ID_HOJ = BOL.ID_HOJ_PER
    INNER JOIN dbo.BUSES BUS ON BUS.ID_BUS = H.ID_BUS_PER
    INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
    INNER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
    INNER JOIN dbo.COOPERATIVAS C ON C.ID_COP = R.ID_COP_PER
    INNER JOIN dbo.ASIENTOS_BUS ASI ON ASI.ID_ASI = BOL.ID_ASI_PER
    INNER JOIN dbo.TIPOS_ASIENTOS T ON T.ID_TIP = ASI.ID_TIP_PER
    LEFT JOIN dbo.USUARIOS PASAJERO ON PASAJERO.ID_USU = BOL.ID_USU_FIN
    LEFT JOIN dbo.USUARIOS OFICINISTA ON OFICINISTA.ID_USU = BOL.ID_USU_OFI
    LEFT JOIN dbo.USUARIOS CONTROL ON CONTROL.ID_USU = BOL.ID_USU_CON
`;

function formatearBoleto(fila) {
    const piso = Number(fila.PIS_ASI) || 1;
    const numero = Number(fila.NUMERO_ASIENTO) || 0;

    return {
        ID_BOL: fila.ID_BOL,
        ORI_TRA_BOL: fila.ORI_TRA_BOL,
        DES_TRA_BOL: fila.DES_TRA_BOL,
        TIP_DES_BOL: fila.TIP_DES_BOL,
        PRE_FIN_BOL: Number(fila.PRE_FIN_BOL) || 0,
        MET_PAG_BOL: fila.MET_PAG_BOL,
        EST_BOL: fila.EST_BOL,
        COD_QR_BOL: fila.COD_QR_BOL,
        FEC_COM_BOL: fila.FEC_COM_BOL,
        FEC_USO_BOL: fila.FEC_USO_BOL,
        ID_HOJ_PER: fila.ID_HOJ_PER,
        ID_ASI_PER: fila.ID_ASI_PER,
        ETIQUETA_ASIENTO: `${piso}${String(numero).padStart(2, '0')}`,
        ID_USU_FIN: fila.ID_USU_FIN,
        PASAJERO: fila.NOM_USU ? `${fila.NOM_USU} ${fila.APE_USU}`.trim() : null,
        CEDULA_PASAJERO: fila.COR_USU || null,
        TELEFONO_PASAJERO: fila.TEL_USU || null,
        OFICINISTA: fila.NOM_OFICINISTA ? `${fila.NOM_OFICINISTA} ${fila.APE_OFICINISTA}`.trim() : null,
        CONTROLADOR: fila.NOM_CONTROLADOR ? `${fila.NOM_CONTROLADOR} ${fila.APE_CONTROLADOR}`.trim() : null,
        HOJA: {
            ID_HOJ: fila.ID_HOJ_PER,
            FEC_PRO_HOJ: fila.FEC_PRO_HOJ,
            EST_VIA_HOJ: fila.EST_VIA_HOJ,
            OBS_HOJ: fila.OBS_HOJ,
            BUS: {
                ID_BUS: fila.ID_BUS,
                NUM_BUS: fila.NUM_BUS,
                PLA_BUS: fila.PLA_BUS,
                NUM_PIS: fila.NUM_PIS
            },
            FRECUENCIA: {
                ID_FRE: fila.ID_FRE,
                CIU_ORI_FRE: fila.CIU_ORI_FRE,
                CIU_DES_FRE: fila.CIU_DES_FRE,
                FEC_HOR_INI_FRE: fila.FEC_HOR_INI_FRE
            },
            COOPERATIVA: {
                ID_COP: fila.ID_COP_PER,
                NOM_COP: fila.NOM_COP
            }
        },
        ASIENTO: {
            ID_ASI: fila.ID_ASI_PER,
            PISO: piso,
            NUMERO: numero,
            ETIQUETA: `${piso}${String(numero).padStart(2, '0')}`,
            TIPO: fila.NOM_TIP
        },
        VIGENTE: ESTADOS_ACTIVOS.includes(fila.EST_BOL) && fila.EST_BOL !== 'USADO'
    };
}

async function consultarBoletoPorId(pool, idBoleto, cooperativa = null) {
    const resultado = await pool.request()
        .input('id', sql.VarChar(5), idBoleto)
        .input('cooperativa', sql.VarChar(5), cooperativa || null)
        .query(`
            ${SELECT_BOLETO}
            WHERE BOL.ID_BOL = @id
              AND (@cooperativa IS NULL OR R.ID_COP_PER = @cooperativa)
        `);

    return resultado.recordset[0] ? formatearBoleto(resultado.recordset[0]) : null;
}

/**
 * Busca un pasajero registrado por cédula. La cédula se guarda en COR_USU
 * (decisión del proyecto) y también puede coincidir con ID_USU.
 */
async function buscarPasajero(pool, cedula) {
    const documento = texto(cedula);
    if (!documento) return null;

    const resultado = await pool.request()
        .input('documento', sql.VarChar(40), documento)
        .query(`
            SELECT TOP (1) ID_USU, NOM_USU, APE_USU, COR_USU, TEL_USU
            FROM dbo.USUARIOS
            WHERE COR_USU = @documento OR ID_USU = @documento
        `);

    return resultado.recordset[0] || null;
}

/* -------------------------------------------------------------------------- */
/*                            HOJAS DE RUTA PARA VENTANILLA                   */
/* -------------------------------------------------------------------------- */

async function listarHojasParaVentanilla(req, res) {
    const cooperativa = cooperativaValida(req.query.cooperativa);
    const fechaFiltro = fecha(req.query.fecha) || hoyISO();

    if (cooperativa === '') {
        return res.status(400).json({ success: false, message: 'Código de cooperativa inválido.' });
    }

    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('cooperativa', sql.VarChar(5), cooperativa || null)
            .input('fecha', sql.Date, fechaFiltro)
            .query(`
                SELECT H.ID_HOJ, H.FEC_PRO_HOJ, H.EST_VIA_HOJ,
                       B.ID_BUS, B.NUM_BUS, B.PLA_BUS, B.NUM_PIS,
                       F.ID_FRE, F.CIU_ORI_FRE, F.CIU_DES_FRE, F.FEC_HOR_INI_FRE,
                       C.ID_COP, C.NOM_COP,
                       (SELECT COUNT(*) FROM dbo.ASIENTOS_BUS A WHERE A.ID_BUS_PER = B.ID_BUS) AS TOTAL_ASIENTOS,
                       (SELECT COUNT(*) FROM dbo.BOLETOS BO
                         WHERE BO.ID_HOJ_PER = H.ID_HOJ
                           AND BO.EST_BOL IN ('RESERVADO','EMITIDO','PAGADO','USADO')) AS ASIENTOS_OCUPADOS
                FROM dbo.HOJAS_RUTAS H
                INNER JOIN dbo.BUSES B ON B.ID_BUS = H.ID_BUS_PER
                INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                INNER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
                INNER JOIN dbo.COOPERATIVAS C ON C.ID_COP = R.ID_COP_PER
                WHERE H.FEC_PRO_HOJ = @fecha
                  AND H.EST_VIA_HOJ IN ('PROGRAMADA','EN CURSO')
                  AND (@cooperativa IS NULL OR C.ID_COP = @cooperativa)
                ORDER BY C.NOM_COP, F.CIU_ORI_FRE, F.CIU_DES_FRE
            `);

        const hojas = resultado.recordset.map((hoja) => {
            const total = Number(hoja.TOTAL_ASIENTOS) || 0;
            const ocupados = Number(hoja.ASIENTOS_OCUPADOS) || 0;
            const disponibles = total - ocupados;
            return {
                ...hoja,
                ASIENTOS_OCUPADOS: ocupados,
                TOTAL_ASIENTOS: total,
                ASIENTOS_DISPONIBLES: disponibles > 0 ? disponibles : 0
            };
        });

        return res.status(200).json({
            success: true,
            fecha: fechaFiltro,
            total: hojas.length,
            hojas
        });
    } catch (error) {
        return manejarError(res, 'listado de hojas para ventanilla', error);
    }
}

async function obtenerMapaAsientosHoja(req, res) {
    const idHoja = codigo(req.params.idHoja);
    if (!CODIGO_CORTO_RE.test(idHoja)) {
        return res.status(400).json({ success: false, message: 'Código de hoja de ruta inválido.' });
    }

    try {
        const pool = await conectarBD();
        const hoja = await pool.request()
            .input('hoja', sql.VarChar(5), idHoja)
            .query(`
                SELECT H.ID_HOJ, H.FEC_PRO_HOJ, H.EST_VIA_HOJ,
                       B.ID_BUS, B.NUM_BUS, B.PLA_BUS, B.NUM_PIS,
                       F.ID_FRE, F.CIU_ORI_FRE, F.CIU_DES_FRE,
                       C.ID_COP, C.NOM_COP
                FROM dbo.HOJAS_RUTAS H
                INNER JOIN dbo.BUSES B ON B.ID_BUS = H.ID_BUS_PER
                INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                INNER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
                INNER JOIN dbo.COOPERATIVAS C ON C.ID_COP = R.ID_COP_PER
                WHERE H.ID_HOJ = @hoja
            `);

        if (hoja.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Hoja de ruta no encontrada.' });
        }

        const resultado = await pool.request()
            .input('hoja', sql.VarChar(5), idHoja)
            .query(`
                SELECT A.ID_ASI, A.PIS_ASI, A.ID_TIP_PER,
                       T.NOM_TIP, T.PRE_TIP,
                       BOL.ID_BOL, BOL.EST_BOL, BOL.COD_QR_BOL,
                       USU.NOM_USU, USU.APE_USU, USU.COR_USU, USU.TEL_USU
                FROM dbo.ASIENTOS_BUS A
                INNER JOIN dbo.TIPOS_ASIENTOS T ON T.ID_TIP = A.ID_TIP_PER
                INNER JOIN dbo.HOJAS_RUTAS H ON H.ID_BUS_PER = A.ID_BUS_PER
                LEFT JOIN dbo.BOLETOS BOL ON BOL.ID_ASI_PER = A.ID_ASI
                     AND BOL.ID_HOJ_PER = H.ID_HOJ
                     AND BOL.EST_BOL IN ('RESERVADO','EMITIDO','PAGADO','USADO')
                LEFT JOIN dbo.USUARIOS USU ON USU.ID_USU = BOL.ID_USU_FIN
                WHERE H.ID_HOJ = @hoja
                ORDER BY A.PIS_ASI, TRY_CAST(A.ID_ASI AS INT), A.ID_ASI
            `);

        let contadorPiso1 = 0;
        let contadorPiso2 = 0;
        const asientos = resultado.recordset.map((asiento) => {
            if (asiento.PIS_ASI === 2) contadorPiso2 += 1;
            else contadorPiso1 += 1;
            const numero = asiento.PIS_ASI === 2 ? contadorPiso2 : contadorPiso1;
            const ocupado = Boolean(asiento.ID_BOL);

            return {
                ID_ASI: asiento.ID_ASI,
                PIS_ASI: asiento.PIS_ASI,
                ETIQUETA: `${asiento.PIS_ASI}${String(numero).padStart(2, '0')}`,
                NUMERO: numero,
                ID_TIP_PER: asiento.ID_TIP_PER,
                NOM_TIP: asiento.NOM_TIP,
                PRE_TIP: Number(asiento.PRE_TIP) || 0,
                ID_BOL: asiento.ID_BOL,
                EST_BOL: asiento.EST_BOL,
                COD_QR_BOL: asiento.COD_QR_BOL,
                PASAJERO: asiento.NOM_USU ? `${asiento.NOM_USU} ${asiento.APE_USU}`.trim() : null,
                CEDULA: asiento.COR_USU || null,
                TELEFONO: asiento.TEL_USU || null,
                DISPONIBLE: !ocupado
            };
        });

        const pisos = [1, 2]
            .map((piso) => ({
                piso,
                asientos: asientos.filter((a) => a.PIS_ASI === piso)
            }))
            .filter((grupo) => grupo.asientos.length > 0);

        return res.status(200).json({
            success: true,
            hoja: hoja.recordset[0],
            pisos,
            asientos,
            resumen: {
                total: asientos.length,
                ocupados: asientos.filter((a) => !a.DISPONIBLE).length,
                disponibles: asientos.filter((a) => a.DISPONIBLE).length
            }
        });
    } catch (error) {
        return manejarError(res, 'mapa de asientos por hoja', error);
    }
}

/* -------------------------------------------------------------------------- */
/*                                  PASAJEROS                                 */
/* -------------------------------------------------------------------------- */

async function registrarPasajero(req, res) {
    const cedula = soloDigitos(req.body?.CEDULA ?? req.body?.cedula);
    const nombre = texto(req.body?.NOMBRE ?? req.body?.nombre);
    const apellido = texto(req.body?.APELLIDO ?? req.body?.apellido);
    const telefono = soloDigitos(req.body?.TELEFONO ?? req.body?.telefono);
    const correo = texto(req.body?.CORREO ?? req.body?.correo).toLowerCase();
    const cooperativa = cooperativaValida(req.body?.ID_COP_PER) || null;

    if (!/^[0-9]{6,10}$/.test(cedula)) {
        return res.status(400).json({ success: false, message: 'La cédula debe tener entre 6 y 10 dígitos.' });
    }
    if (!nombre || nombre.length > 15 || !apellido || apellido.length > 15) {
        return res.status(400).json({
            success: false,
            message: 'Nombres y apellidos son obligatorios (máximo 15 caracteres).'
        });
    }
    if (!/^[0-9]{7,10}$/.test(telefono)) {
        return res.status(400).json({ success: false, message: 'El teléfono debe tener entre 7 y 10 dígitos.' });
    }
    if (correo && (correo.length > 40 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))) {
        return res.status(400).json({ success: false, message: 'El correo electrónico no es válido.' });
    }
    if (cooperativa === '') {
        return res.status(400).json({ success: false, message: 'Código de cooperativa inválido.' });
    }

    try {
        const pool = await conectarBD();
        const existente = await buscarPasajero(pool, cedula);
        if (existente) {
            return res.status(200).json({
                success: true,
                message: 'El pasajero ya se encuentra registrado.',
                pasajero: existente,
                existente: true
            });
        }

        const ocupado = await pool.request()
            .input('id', sql.VarChar(10), cedula)
            .query('SELECT TOP (1) ID_USU, COR_USU FROM dbo.USUARIOS WHERE ID_USU = @id OR COR_USU = @id');

        if (ocupado.recordset.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'La cédula ya está asociada a otro usuario del sistema.'
            });
        }

        const passwordTemporal = crypto.randomBytes(6).toString('hex');
        const resultado = await pool.request()
            .input('id', sql.VarChar(10), cedula)
            .input('nombre', sql.VarChar(15), nombre)
            .input('apellido', sql.VarChar(15), apellido)
            .input('correo', sql.VarChar(40), cedula)
            .input('password', sql.VarChar(20), passwordTemporal)
            .input('telefono', sql.VarChar(20), telefono)
            .input('fecha', sql.Date, hoyISO())
            .input('estado', sql.Char(1), '1')
            .input('rol', sql.VarChar(5), 'R005')
            .input('cooperativa', sql.VarChar(5), cooperativa)
            .query(`
                INSERT INTO dbo.USUARIOS
                    (ID_USU, NOM_USU, APE_USU, COR_USU, CON_USU, TEL_USU,
                     FEC_REG_USU, EST_USU, ID_ROL_PER, ID_COP_PER)
                OUTPUT INSERTED.ID_USU, INSERTED.NOM_USU, INSERTED.APE_USU,
                       INSERTED.COR_USU, INSERTED.TEL_USU
                VALUES
                    (@id, @nombre, @apellido, @correo, @password, @telefono,
                     @fecha, @estado, @rol, @cooperativa)
            `);

        return res.status(201).json({
            success: true,
            message: 'Pasajero registrado correctamente.',
            pasajero: resultado.recordset[0],
            passwordTemporal,
            existente: false
        });
    } catch (error) {
        return manejarError(res, 'registro de pasajero', error);
    }
}

async function buscarPasajeros(req, res) {
    const busqueda = texto(req.query.q);
    if (!busqueda || busqueda.length > 40) {
        return res.status(400).json({ success: false, message: 'Indica una cédula, correo o nombre a buscar.' });
    }

    const patron = `%${busqueda.replace(/[!%_\[]/g, (valor) => `!${valor}`)}%`;

    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('patron', sql.VarChar(50), patron)
            .query(`
                SELECT TOP (15) ID_USU, NOM_USU, APE_USU, COR_USU, TEL_USU
                FROM dbo.USUARIOS
                WHERE ID_ROL_PER = 'R005'
                  AND (COR_USU LIKE @patron ESCAPE '!' OR ID_USU LIKE @patron ESCAPE '!'
                       OR NOM_USU LIKE @patron ESCAPE '!' OR APE_USU LIKE @patron ESCAPE '!')
                ORDER BY APE_USU, NOM_USU
            `);

        return res.status(200).json({ success: true, total: resultado.recordset.length, pasajeros: resultado.recordset });
    } catch (error) {
        return manejarError(res, 'búsqueda de pasajeros', error);
    }
}

/* -------------------------------------------------------------------------- */
/*                                   VENTA                                    */
/* -------------------------------------------------------------------------- */

async function crearBoletoVentanilla(req, res) {
    const {
        ID_HOJ_PER,
        ID_ASI_PER,
        ID_USU_OFI,
        ID_USU_FIN,
        ORI_TRA_BOL,
        DES_TRA_BOL,
        TIP_DES_BOL,
        PRE_FIN_BOL,
        MET_PAG_BOL,
        COR_PASAJERO
    } = req.body;

    const idHoja = codigo(ID_HOJ_PER);
    const idAsiento = codigo(ID_ASI_PER);
    const idOficinista = codigo(ID_USU_OFI);
    const idUsuarioFin = codigo(ID_USU_FIN);

    if (!CODIGO_CORTO_RE.test(idHoja) || !CODIGO_CORTO_RE.test(idAsiento)) {
        return res.status(400).json({ success: false, message: 'Hoja de ruta o asiento inválidos.' });
    }
    if (!CODIGO_RE.test(idOficinista)) {
        return res.status(400).json({ success: false, message: 'Oficinista inválido.' });
    }
    if (idUsuarioFin && !CODIGO_RE.test(idUsuarioFin)) {
        return res.status(400).json({ success: false, message: 'Pasajero inválido.' });
    }

    const metodo = texto(MET_PAG_BOL).toUpperCase();
    if (!METODOS_PAGO.includes(metodo)) {
        return res.status(400).json({ success: false, message: 'Método de pago inválido (EFECTIVO, TRANSFERENCIA o DEPOSITO).' });
    }

    const precio = Number(PRE_FIN_BOL);
    if (!Number.isFinite(precio) || precio <= 0) {
        return res.status(400).json({ success: false, message: 'Precio del boleto inválido.' });
    }

    let transaccion;
    try {
        const pool = await conectarBD();

        const hoja = await pool.request()
            .input('hoja', sql.VarChar(5), idHoja)
            .input('asiento', sql.VarChar(5), idAsiento)
            .query(`
                SELECT H.ID_HOJ, H.EST_VIA_HOJ, H.ID_BUS_PER,
                       F.CIU_ORI_FRE, F.CIU_DES_FRE,
                       A.ID_ASI, A.PIS_ASI, T.NOM_TIP, T.PRE_TIP
                FROM dbo.HOJAS_RUTAS H
                INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                INNER JOIN dbo.ASIENTOS_BUS A ON A.ID_BUS_PER = H.ID_BUS_PER
                INNER JOIN dbo.TIPOS_ASIENTOS T ON T.ID_TIP = A.ID_TIP_PER
                WHERE H.ID_HOJ = @hoja AND A.ID_ASI = @asiento
            `);

        if (hoja.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'La hoja de ruta o el asiento no existen o el asiento no pertenece al bus asignado.'
            });
        }

        const datosHoja = hoja.recordset[0];
        if (!ESTADOS_VIAJE.includes(datosHoja.EST_VIA_HOJ)) {
            return res.status(400).json({ success: false, message: 'La hoja de ruta no se encuentra disponible para venta.' });
        }

        let idPasajero = idUsuarioFin || null;
        if (!idPasajero) {
            const documento = soloDigitos(COR_PASAJERO) || codigo(COR_PASAJERO);
            if (documento) {
                const pasajero = await buscarPasajero(pool, documento);
                if (!pasajero) {
                    return res.status(400).json({
                        success: false,
                        message: 'El pasajero no está registrado. Regístralo antes de emitir el boleto.',
                        codigo: 'PASAJERO_NO_REGISTRADO'
                    });
                }
                idPasajero = pasajero.ID_USU;
            }
        } else {
            const pasajero = await pool.request()
                .input('id', sql.VarChar(10), idPasajero)
                .query('SELECT 1 AS existe FROM dbo.USUARIOS WHERE ID_USU = @id');
            if (pasajero.recordset.length === 0) {
                return res.status(404).json({ success: false, message: 'El pasajero indicado no existe.' });
            }
        }

        transaccion = new sql.Transaction(pool);
        await transaccion.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

        const ocupados = await new sql.Request(transaccion)
            .input('asiento', sql.VarChar(5), idAsiento)
            .input('hoja', sql.VarChar(5), idHoja)
            .query(`
                SELECT COUNT(*) AS total
                FROM dbo.BOLETOS WITH (UPDLOCK, HOLDLOCK)
                WHERE ID_ASI_PER = @asiento
                  AND ID_HOJ_PER = @hoja
                  AND EST_BOL IN ('RESERVADO','EMITIDO','PAGADO','USADO')
            `);

        if (ocupados.recordset[0].total > 0) {
            await transaccion.rollback();
            return res.status(409).json({ success: false, message: 'El asiento ya se encuentra ocupado para esta hoja de ruta.' });
        }

        const idBoleto = await siguienteCodigoBoleto(new sql.Request(transaccion));
        const codigoQR = generarCodigoQR();
        const fechaCompra = hoyISO();

        await new sql.Request(transaccion)
            .input('idBol', sql.VarChar(5), idBoleto)
            .input('ori', sql.VarChar(20), codigo(ORI_TRA_BOL) || datosHoja.CIU_ORI_FRE)
            .input('des', sql.VarChar(20), codigo(DES_TRA_BOL) || datosHoja.CIU_DES_FRE)
            .input('tip', sql.VarChar(30), texto(TIP_DES_BOL) || datosHoja.NOM_TIP || 'NORMAL')
            .input('precio', sql.Decimal(18, 0), precio)
            .input('metodo', sql.VarChar(15), metodo)
            .input('qr', sql.VarChar(500), codigoQR)
            .input('estado', sql.VarChar(15), 'EMITIDO')
            .input('fecCom', sql.Date, fechaCompra)
            .input('hoja', sql.VarChar(5), idHoja)
            .input('asiento', sql.VarChar(5), idAsiento)
            .input('usuFin', sql.VarChar(10), idPasajero)
            .input('usuOfi', sql.VarChar(10), idOficinista)
            .query(`
                INSERT INTO dbo.BOLETOS
                    (ID_BOL, ORI_TRA_BOL, DES_TRA_BOL, TIP_DES_BOL, PRE_FIN_BOL, MET_PAG_BOL,
                     COD_QR_BOL, EST_BOL, FEC_COM_BOL, ID_HOJ_PER, ID_ASI_PER, ID_USU_FIN, ID_USU_OFI)
                VALUES
                    (@idBol, @ori, @des, @tip, @precio, @metodo, @qr, @estado, @fecCom, @hoja, @asiento, @usuFin, @usuOfi)
            `);

        await transaccion.commit();
        const detalle = await consultarBoletoPorId(pool, idBoleto);

        return res.status(201).json({
            success: true,
            message: 'Boleto emitido correctamente desde ventanilla.',
            boleto: detalle || {
                ID_BOL: idBoleto,
                ID_HOJ_PER: idHoja,
                ID_ASI_PER: idAsiento,
                COD_QR_BOL: codigoQR,
                EST_BOL: 'EMITIDO',
                PRE_FIN_BOL: precio,
                MET_PAG_BOL: metodo,
                FEC_COM_BOL: fechaCompra
            }
        });
    } catch (error) {
        if (transaccion) {
            try { await transaccion.rollback(); } catch { /* la transacción ya cerró */ }
        }
        return manejarError(res, 'venta de boleto en ventanilla', error);
    }
}

/* -------------------------------------------------------------------------- */
/*                          BÚSQUEDA Y VALIDACIÓN                             */
/* -------------------------------------------------------------------------- */

async function buscarBoletos(req, res) {
    const busqueda = texto(req.query.q);
    const cooperativa = cooperativaValida(req.query.cooperativa);

    if (!busqueda || busqueda.length > 100) {
        return res.status(400).json({
            success: false,
            message: 'Ingresa un código QR, código de boleto o cédula para buscar.'
        });
    }
    if (cooperativa === '') {
        return res.status(400).json({ success: false, message: 'Código de cooperativa inválido.' });
    }

    const valor = codigo(busqueda);
    const documento = soloDigitos(busqueda);

    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('valor', sql.VarChar(500), valor)
            .input('documento', sql.VarChar(50), documento || valor)
            .input('cooperativa', sql.VarChar(5), cooperativa || null)
            .query(`
                ${SELECT_BOLETO}
                WHERE (
                        BOL.ID_BOL = @valor
                     OR BOL.COD_QR_BOL = @valor
                     OR PASAJERO.COR_USU = @documento
                     OR PASAJERO.ID_USU = @documento
                )
                  AND (@cooperativa IS NULL OR R.ID_COP_PER = @cooperativa)
                ORDER BY
                    CASE WHEN BOL.COD_QR_BOL = @valor OR BOL.ID_BOL = @valor THEN 0 ELSE 1 END,
                    BOL.FEC_COM_BOL DESC, BOL.ID_BOL DESC
                OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY
            `);

        const boletos = resultado.recordset.map(formatearBoleto);

        return res.status(200).json({
            success: true,
            total: boletos.length,
            boletos
        });
    } catch (error) {
        return manejarError(res, 'búsqueda de boletos', error);
    }
}

async function obtenerBoleto(req, res) {
    const id = codigo(req.params.id);
    if (!CODIGO_CORTO_RE.test(id)) {
        return res.status(400).json({ success: false, message: 'Código de boleto inválido.' });
    }

    try {
        const pool = await conectarBD();
        const boleto = await consultarBoletoPorId(pool, id);
        if (!boleto) {
            return res.status(404).json({ success: false, message: 'Boleto no encontrado.' });
        }

        return res.status(200).json({ success: true, boleto });
    } catch (error) {
        return manejarError(res, 'consulta de boleto', error);
    }
}

async function cambiarEstadoBoleto(req, res) {
    const id = codigo(req.params.id);
    const nuevoEstado = codigo(req.body?.EST_BOL ?? req.body?.estado);
    const idControlador = codigo(req.body?.ID_USU_CON ?? req.body?.ID_USU_OFI);

    if (!CODIGO_CORTO_RE.test(id)) {
        return res.status(400).json({ success: false, message: 'Código de boleto inválido.' });
    }
    if (!ESTADOS_BOLETO.includes(nuevoEstado)) {
        return res.status(400).json({ success: false, message: 'Estado de boleto inválido.' });
    }
    if (idControlador && !CODIGO_RE.test(idControlador)) {
        return res.status(400).json({ success: false, message: 'Usuario que valida inválido.' });
    }

    let transaccion;
    try {
        const pool = await conectarBD();
        transaccion = new sql.Transaction(pool);
        await transaccion.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

        const actual = await new sql.Request(transaccion)
            .input('id', sql.VarChar(5), id)
            .query(`
                SELECT ID_BOL, EST_BOL, FEC_USO_BOL
                FROM dbo.BOLETOS WITH (UPDLOCK, HOLDLOCK)
                WHERE ID_BOL = @id
            `);

        if (actual.recordset.length === 0) {
            await transaccion.rollback();
            return res.status(404).json({ success: false, message: 'Boleto no encontrado.' });
        }

        const estadoActual = actual.recordset[0].EST_BOL;
        if (estadoActual === nuevoEstado) {
            await transaccion.commit();
            const sinCambios = await consultarBoletoPorId(pool, id);
            return res.status(200).json({
                success: true,
                message: `El boleto ya se encuentra en estado ${nuevoEstado}.`,
                boleto: sinCambios
            });
        }

        const permitidos = TRANSICIONES[estadoActual] || [];
        if (!permitidos.includes(nuevoEstado)) {
            await transaccion.rollback();
            return res.status(409).json({
                success: false,
                message: `No se puede cambiar un boleto de ${estadoActual} a ${nuevoEstado}.`
            });
        }

        await new sql.Request(transaccion)
            .input('id', sql.VarChar(5), id)
            .input('estado', sql.VarChar(15), nuevoEstado)
            .input('fechaUso', sql.Date, nuevoEstado === 'USADO' ? hoyISO() : null)
            .input('usuario', sql.VarChar(10), idControlador || null)
            .query(`
                UPDATE dbo.BOLETOS
                SET EST_BOL = @estado,
                    FEC_USO_BOL = CASE WHEN @estado = 'USADO' THEN @fechaUso ELSE FEC_USO_BOL END,
                    ID_USU_CON = CASE WHEN @estado = 'USADO' THEN @usuario ELSE ID_USU_CON END
                WHERE ID_BOL = @id
            `);

        await transaccion.commit();
        const detalle = await consultarBoletoPorId(pool, id);

        return res.status(200).json({
            success: true,
            message: `Boleto actualizado a ${nuevoEstado}.`,
            boleto: detalle
        });
    } catch (error) {
        if (transaccion) {
            try { await transaccion.rollback(); } catch { /* la transacción ya cerró */ }
        }
        return manejarError(res, 'cambio de estado de boleto', error);
    }
}

async function validarBoleto(req, res) {
    const codigoIngresado = texto(req.body?.CODIGO ?? req.body?.codigo ?? req.body?.q);
    const idControlador = codigo(req.body?.ID_USU_CON ?? req.body?.ID_USU_OFI);
    const cooperativa = cooperativaValida(req.body?.ID_COP_PER);

    if (!codigoIngresado || codigoIngresado.length > 100) {
        return res.status(400).json({ success: false, message: 'Escanea un código QR o ingresa una cédula.' });
    }
    if (cooperativa === '') {
        return res.status(400).json({ success: false, message: 'Código de cooperativa inválido.' });
    }

    const valor = codigo(codigoIngresado);
    const documento = soloDigitos(codigoIngresado);

    let transaccion;
    try {
        const pool = await conectarBD();
        transaccion = new sql.Transaction(pool);
        await transaccion.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

        const encontrados = await new sql.Request(transaccion)
            .input('valor', sql.VarChar(500), valor)
            .input('documento', sql.VarChar(50), documento || valor)
            .input('cooperativa', sql.VarChar(5), cooperativa || null)
            .query(`
                SELECT TOP (5) BOL.ID_BOL, BOL.EST_BOL, BOL.COD_QR_BOL
                FROM dbo.BOLETOS BOL WITH (UPDLOCK, HOLDLOCK)
                INNER JOIN dbo.HOJAS_RUTAS H ON H.ID_HOJ = BOL.ID_HOJ_PER
                INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                INNER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
                LEFT JOIN dbo.USUARIOS PASAJERO ON PASAJERO.ID_USU = BOL.ID_USU_FIN
                WHERE (
                        BOL.ID_BOL = @valor
                     OR BOL.COD_QR_BOL = @valor
                     OR PASAJERO.COR_USU = @documento
                     OR PASAJERO.ID_USU = @documento
                )
                  AND (@cooperativa IS NULL OR R.ID_COP_PER = @cooperativa)
                ORDER BY BOL.FEC_COM_BOL DESC, BOL.ID_BOL DESC
            `);

        if (encontrados.recordset.length === 0) {
            await transaccion.rollback();
            return res.status(404).json({
                success: false,
                message: 'No se encontró ningún boleto con ese código QR o cédula.'
            });
        }

        const utilizables = encontrados.recordset.filter((boleto) =>
            ['RESERVADO', 'EMITIDO', 'PAGADO'].includes(boleto.EST_BOL)
        );

        if (utilizables.length > 1) {
            await transaccion.rollback();
            return res.status(409).json({
                success: false,
                message: 'La cédula tiene varios boletos vigentes. Escanea el código QR o indica el código del boleto.',
                codigo: 'MULTIPLES_BOLETOS',
                boletos: utilizables.map((boleto) => ({
                    ID_BOL: boleto.ID_BOL,
                    EST_BOL: boleto.EST_BOL,
                    COD_QR_BOL: boleto.COD_QR_BOL
                }))
            });
        }

        const objetivo = utilizables[0];
        if (!objetivo) {
            const usado = encontrados.recordset.find((boleto) => boleto.EST_BOL === 'USADO');
            if (usado) {
                await transaccion.commit();
                const detalleUsado = await consultarBoletoPorId(pool, usado.ID_BOL);
                return res.status(409).json({
                    success: false,
                    message: 'El boleto ya fue utilizado.',
                    codigo: 'BOLETO_USADO',
                    boleto: detalleUsado
                });
            }

            await transaccion.rollback();
            return res.status(409).json({
                success: false,
                message: 'El boleto se encuentra anulado o cancelado.',
                codigo: 'BOLETO_INACTIVO'
            });
        }

        await new sql.Request(transaccion)
            .input('id', sql.VarChar(5), objetivo.ID_BOL)
            .input('fechaUso', sql.Date, hoyISO())
            .input('usuario', sql.VarChar(10), idControlador || null)
            .query(`
                UPDATE dbo.BOLETOS
                SET EST_BOL = 'USADO',
                    FEC_USO_BOL = @fechaUso,
                    ID_USU_CON = @usuario
                WHERE ID_BOL = @id
            `);

        await transaccion.commit();
        const detalle = await consultarBoletoPorId(pool, objetivo.ID_BOL);

        return res.status(200).json({
            success: true,
            message: 'Boleto validado correctamente. El pasajero puede abordar.',
            boleto: detalle
        });
    } catch (error) {
        if (transaccion) {
            try { await transaccion.rollback(); } catch { /* la transacción ya cerró */ }
        }
        return manejarError(res, 'validación de boleto', error);
    }
}

/* -------------------------------------------------------------------------- */
/*                                  RESUMEN                                   */
/* -------------------------------------------------------------------------- */

async function resumenOficinista(req, res) {
    const cooperativa = cooperativaValida(req.query.cooperativa);
    const fechaFiltro = fecha(req.query.fecha) || hoyISO();

    if (cooperativa === '') {
        return res.status(400).json({ success: false, message: 'Código de cooperativa inválido.' });
    }

    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('cooperativa', sql.VarChar(5), cooperativa || null)
            .input('fecha', sql.Date, fechaFiltro)
            .query(`
                SELECT
                    (SELECT COUNT(*) FROM dbo.BOLETOS B
                       INNER JOIN dbo.HOJAS_RUTAS H ON H.ID_HOJ = B.ID_HOJ_PER
                       INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                       INNER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
                       WHERE B.FEC_COM_BOL = @fecha
                         AND (@cooperativa IS NULL OR R.ID_COP_PER = @cooperativa)) AS BOLETOS_HOY,
                    (SELECT COUNT(*) FROM dbo.BOLETOS B
                       INNER JOIN dbo.HOJAS_RUTAS H ON H.ID_HOJ = B.ID_HOJ_PER
                       INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                       INNER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
                       WHERE B.FEC_COM_BOL = @fecha AND B.EST_BOL IN ('EMITIDO','PAGADO','USADO')
                         AND (@cooperativa IS NULL OR R.ID_COP_PER = @cooperativa)) AS VENDIDOS_HOY,
                    (SELECT COUNT(*) FROM dbo.BOLETOS B
                       INNER JOIN dbo.HOJAS_RUTAS H ON H.ID_HOJ = B.ID_HOJ_PER
                       INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                       INNER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
                       WHERE B.FEC_COM_BOL = @fecha AND B.EST_BOL = 'RESERVADO'
                         AND (@cooperativa IS NULL OR R.ID_COP_PER = @cooperativa)) AS RESERVADOS_HOY,
                    (SELECT COUNT(*) FROM dbo.BOLETOS B
                       INNER JOIN dbo.HOJAS_RUTAS H ON H.ID_HOJ = B.ID_HOJ_PER
                       INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                       INNER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
                       WHERE B.FEC_USO_BOL = @fecha AND B.EST_BOL = 'USADO'
                         AND (@cooperativa IS NULL OR R.ID_COP_PER = @cooperativa)) AS VALIDADOS_HOY,
                    (SELECT COUNT(*) FROM dbo.BOLETOS B
                       INNER JOIN dbo.HOJAS_RUTAS H ON H.ID_HOJ = B.ID_HOJ_PER
                       INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                       INNER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
                       WHERE B.FEC_COM_BOL = @fecha AND B.EST_BOL IN ('ANULADO','CANCELADO')
                         AND (@cooperativa IS NULL OR R.ID_COP_PER = @cooperativa)) AS ANULADOS_HOY,
                    (SELECT ISNULL(SUM(B.PRE_FIN_BOL), 0) FROM dbo.BOLETOS B
                       INNER JOIN dbo.HOJAS_RUTAS H ON H.ID_HOJ = B.ID_HOJ_PER
                       INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                       INNER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
                       WHERE B.FEC_COM_BOL = @fecha AND B.EST_BOL IN ('EMITIDO','PAGADO','USADO')
                         AND (@cooperativa IS NULL OR R.ID_COP_PER = @cooperativa)) AS INGRESOS_HOY,
                    (SELECT COUNT(*) FROM dbo.HOJAS_RUTAS H
                       INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                       INNER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
                       WHERE H.FEC_PRO_HOJ = @fecha AND H.EST_VIA_HOJ IN ('PROGRAMADA','EN CURSO')
                         AND (@cooperativa IS NULL OR R.ID_COP_PER = @cooperativa)) AS HOJAS_HOY
            `);

        const resumen = resultado.recordset[0];
        const vendidos = Number(resumen.VENDIDOS_HOY) || 0;
        const ingresos = Number(resumen.INGRESOS_HOY) || 0;

        return res.status(200).json({
            success: true,
            fecha: fechaFiltro,
            resumen: {
                BOLETOS_HOY: Number(resumen.BOLETOS_HOY) || 0,
                VENDIDOS_HOY: vendidos,
                RESERVADOS_HOY: Number(resumen.RESERVADOS_HOY) || 0,
                VALIDADOS_HOY: Number(resumen.VALIDADOS_HOY) || 0,
                ANULADOS_HOY: Number(resumen.ANULADOS_HOY) || 0,
                INGRESOS_HOY: ingresos,
                PROMEDIO_BOLETO: vendidos > 0 ? Math.round(ingresos / vendidos) : 0,
                HOJAS_HOY: Number(resumen.HOJAS_HOY) || 0
            }
        });
    } catch (error) {
        return manejarError(res, 'resumen de oficinista', error);
    }
}

module.exports = {
    listarHojasParaVentanilla,
    obtenerMapaAsientosHoja,
    registrarPasajero,
    buscarPasajeros,
    crearBoletoVentanilla,
    buscarBoletos,
    obtenerBoleto,
    cambiarEstadoBoleto,
    validarBoleto,
    resumenOficinista
};
