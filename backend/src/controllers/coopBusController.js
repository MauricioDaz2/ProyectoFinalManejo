const { sql, conectarBD } = require('../config/db');

/**
 * Módulo de la cooperativa:
 *  - Flota de buses y distribución de asientos.
 *  - Resoluciones de la ANT.
 *  - Frecuencias asociadas a cada resolución.
 *  - Hojas de ruta (turnos despachados).
 *  - Resumen del panel principal.
 */

const CODIGO_RE = /^[A-Z0-9_-]{1,5}$/;
const ESTADOS_BUS = ['ACTIVO', 'TALLER', 'INACTIVO'];
const ESTADOS_VIAJE = ['PROGRAMADA', 'EN CURSO', 'FINALIZADA', 'CANCELADA'];
const ESTADOS_FRECUENCIA = ['0', '1'];
const TIPO_ASIENTO_NORMAL = 'TIP01';

const CUPO_FRECUENCIA_MIN = 1;
const CUPO_FRECUENCIA_MAX = 999;

const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');
const codigo = (valor) => texto(valor).toUpperCase();
const entero = (valor) => {
    const numero = Number(valor);
    return Number.isInteger(numero) ? numero : NaN;
};

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

function cooperativaSolicitada(req) {
    const valor = req.query?.cooperativa ?? req.body?.ID_COP_PER ?? req.headers['x-cooperativa'];
    const id = codigo(valor);
    return CODIGO_RE.test(id) ? id : null;
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
            message: 'El registro está relacionado con otros datos y no se puede completar la operación.'
        });
    }

    return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
}

async function cooperativaExiste(pool, id) {
    if (!id) return false;
    const resultado = await pool.request()
        .input('id', sql.VarChar(5), id)
        .query('SELECT 1 AS existe FROM dbo.COOPERATIVAS WHERE ID_COP = @id');
    return resultado.recordset.length > 0;
}

/**
 * Calcula el siguiente código consecutivo de una tabla.
 * Ej.: prefijo "R" -> R0001, R0002...
 */
async function siguienteCodigo(request, tabla, columna, prefijo) {
    const resultado = await request.query(`
        SELECT ISNULL(MAX(TRY_CAST(SUBSTRING(${columna}, ${prefijo.length + 1}, 5) AS INT)), 0) + 1 AS siguiente
        FROM dbo.${tabla}
        WHERE ${columna} LIKE '${prefijo}%'
    `);
    const siguiente = Number(resultado.recordset[0].siguiente);
    return `${prefijo}${String(siguiente).padStart(5 - prefijo.length, '0')}`;
}

async function siguienteAsiento(request) {
    const resultado = await request.query(`
        SELECT ISNULL(MAX(TRY_CAST(ID_ASI AS INT)), 0) + 1 AS siguiente
        FROM dbo.ASIENTOS_BUS
        WHERE TRY_CAST(ID_ASI AS INT) IS NOT NULL
    `);
    return Number(resultado.recordset[0].siguiente);
}

async function asegurarTipoNormal(gestor) {
    await new sql.Request(gestor).query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.TIPOS_ASIENTOS WHERE ID_TIP = '${TIPO_ASIENTO_NORMAL}')
        BEGIN
            INSERT INTO dbo.TIPOS_ASIENTOS (ID_TIP, NOM_TIP, PRE_TIP)
            VALUES ('${TIPO_ASIENTO_NORMAL}', 'NORMAL', 0)
        END
    `);
}

/**
 * Crea los asientos de un bus. El ID_ASI es la clave global de 5 caracteres,
 * por eso se usa un consecutivo numérico y la etiqueta visible se calcula
 * en la API como piso + número de asiento.
 */
async function crearAsientos(gestor, idBus, piso1, piso2) {
    await asegurarTipoNormal(gestor);
    const base = await siguienteAsiento(new sql.Request(gestor));
    let consecutivo = base;

    const asientos = [];
    for (let i = 0; i < piso1; i += 1) asientos.push({ piso: 1 });
    for (let i = 0; i < piso2; i += 1) asientos.push({ piso: 2 });

    for (const asiento of asientos) {
        const id = String(consecutivo).padStart(5, '0');
        consecutivo += 1;

        await new sql.Request(gestor)
            .input('id', sql.VarChar(5), id)
            .input('piso', sql.Int, asiento.piso)
            .input('bus', sql.VarChar(5), idBus)
            .input('tipo', sql.VarChar(5), TIPO_ASIENTO_NORMAL)
            .query(`
                INSERT INTO dbo.ASIENTOS_BUS (ID_ASI, PIS_ASI, ID_BUS_PER, ID_TIP_PER)
                VALUES (@id, @piso, @bus, @tipo)
            `);
    }

    return asientos.length;
}

async function contarBoletosDelBus(pool, idBus) {
    const resultado = await pool.request()
        .input('bus', sql.VarChar(5), idBus)
        .query(`
            SELECT COUNT(*) AS total
            FROM dbo.BOLETOS B
            INNER JOIN dbo.ASIENTOS_BUS A ON A.ID_ASI = B.ID_ASI_PER
            WHERE A.ID_BUS_PER = @bus
        `);
    return resultado.recordset[0].total;
}

function normalizarBus(body, id = null) {
    const datos = body && typeof body === 'object' ? body : {};
    const pisos = entero(datos.NUM_PIS ?? 1);

    return {
        ID_BUS: id === null ? codigo(datos.ID_BUS) : codigo(id),
        NUM_BUS: texto(datos.NUM_BUS),
        PLA_BUS: codigo(datos.PLA_BUS),
        ANIO_BUS: entero(datos.ANIO_BUS),
        NUM_PIS: Number.isInteger(pisos) ? pisos : 1,
        IMG_URL_BUS: texto(datos.IMG_URL_BUS),
        EST_BUS: datos.EST_BUS === undefined ? 'ACTIVO' : codigo(datos.EST_BUS),
        ID_COP_PER: codigo(datos.ID_COP_PER),
        ASIENTOS_P1: entero(datos.ASIENTOS_P1 ?? 20),
        ASIENTOS_P2: entero(datos.ASIENTOS_P2 ?? 0)
    };
}

function validarBus(datos) {
    if (datos.ID_BUS && !CODIGO_RE.test(datos.ID_BUS)) {
        return 'El código del bus debe tener entre 1 y 5 caracteres, usando letras, números, guion o guion bajo.';
    }
    if (!datos.NUM_BUS || datos.NUM_BUS.length > 5) {
        return 'El número del bus es obligatorio y debe tener máximo 5 caracteres.';
    }
    if (!/^[A-Z0-9-]{5,10}$/.test(datos.PLA_BUS)) {
        return 'La placa es obligatoria, debe tener entre 5 y 10 caracteres (letras, números o guion).';
    }
    const anioMaximo = new Date().getFullYear() + 1;
    if (!Number.isInteger(datos.ANIO_BUS) || datos.ANIO_BUS < 1980 || datos.ANIO_BUS > anioMaximo) {
        return `El año del bus debe estar entre 1980 y ${anioMaximo}.`;
    }
    if (![1, 2].includes(datos.NUM_PIS)) {
        return 'El número de pisos debe ser 1 o 2.';
    }
    if (!ESTADOS_BUS.includes(datos.EST_BUS)) {
        return 'El estado del bus debe ser ACTIVO, TALLER o INACTIVO.';
    }
    if (datos.IMG_URL_BUS && datos.IMG_URL_BUS.length > 500) {
        return 'La URL de la imagen debe tener máximo 500 caracteres.';
    }
    if (!CODIGO_RE.test(datos.ID_COP_PER)) {
        return 'Debes indicar la cooperativa propietaria del bus.';
    }
    if (!Number.isInteger(datos.ASIENTOS_P1) || datos.ASIENTOS_P1 < 4 || datos.ASIENTOS_P1 > 60) {
        return 'La cantidad de asientos de la planta baja debe estar entre 4 y 60.';
    }
    if (datos.NUM_PIS === 2 && (!Number.isInteger(datos.ASIENTOS_P2) || datos.ASIENTOS_P2 < 4 || datos.ASIENTOS_P2 > 60)) {
        return 'La cantidad de asientos de la planta alta debe estar entre 4 y 60.';
    }
    if (datos.NUM_PIS === 1 && datos.ASIENTOS_P2 !== 0) {
        return 'Un bus de un solo piso no puede tener asientos en planta alta.';
    }
    return null;
}

async function placaDuplicada(pool, datos, idActual = null) {
    const resultado = await pool.request()
        .input('placa', sql.VarChar(10), datos.PLA_BUS)
        .input('idActual', sql.VarChar(5), idActual)
        .query(`
            SELECT TOP (1) ID_BUS
            FROM dbo.BUSES
            WHERE PLA_BUS = @placa
              AND (@idActual IS NULL OR ID_BUS <> @idActual)
        `);
    return resultado.recordset.length > 0;
}

/* -------------------------------------------------------------------------- */
/*                                   BUSES                                     */
/* -------------------------------------------------------------------------- */

async function listarBuses(req, res) {
    const cooperativa = cooperativaSolicitada(req);
    if (!cooperativa) {
        return res.status(400).json({ success: false, message: 'Debes indicar una cooperativa válida.' });
    }

    const buscar = texto(req.query.buscar);
    const estado = req.query.estado ? codigo(req.query.estado) : null;

    if (buscar.length > 100 || (estado && !ESTADOS_BUS.includes(estado))) {
        return res.status(400).json({ success: false, message: 'Filtros de búsqueda no válidos.' });
    }

    const escapado = buscar.replace(/[!%_\[]/g, (valor) => `!${valor}`);

    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('cooperativa', sql.VarChar(5), cooperativa)
            .input('buscar', sql.VarChar(110), `%${escapado}%`)
            .input('estado', sql.VarChar(10), estado)
            .query(`
                SELECT
                    B.ID_BUS, B.NUM_BUS, B.PLA_BUS, B.ANIO_BUS, B.NUM_PIS,
                    B.IMG_URL_BUS, B.EST_BUS, B.ID_COP_PER,
                    C.NOM_COP,
                    (SELECT COUNT(*) FROM dbo.ASIENTOS_BUS A WHERE A.ID_BUS_PER = B.ID_BUS) AS TOTAL_ASIENTOS,
                    (SELECT COUNT(*) FROM dbo.ASIENTOS_BUS A WHERE A.ID_BUS_PER = B.ID_BUS AND A.PIS_ASI = 1) AS ASIENTOS_P1,
                    (SELECT COUNT(*) FROM dbo.ASIENTOS_BUS A WHERE A.ID_BUS_PER = B.ID_BUS AND A.PIS_ASI = 2) AS ASIENTOS_P2
                FROM dbo.BUSES B
                INNER JOIN dbo.COOPERATIVAS C ON C.ID_COP = B.ID_COP_PER
                WHERE B.ID_COP_PER = @cooperativa
                  AND (@estado IS NULL OR B.EST_BUS = @estado)
                  AND (
                        B.ID_BUS LIKE @buscar ESCAPE '!'
                     OR B.NUM_BUS LIKE @buscar ESCAPE '!'
                     OR B.PLA_BUS LIKE @buscar ESCAPE '!'
                  )
                ORDER BY B.NUM_BUS, B.ID_BUS
            `);

        return res.status(200).json({
            success: true,
            total: resultado.recordset.length,
            buses: resultado.recordset
        });
    } catch (error) {
        return manejarError(res, 'listado de buses', error);
    }
}

async function obtenerBus(req, res) {
    const id = codigo(req.params.id);

    if (!CODIGO_RE.test(id)) {
        return res.status(400).json({ success: false, message: 'Código de bus inválido.' });
    }

    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('id', sql.VarChar(5), id)
            .query(`
                SELECT B.*, C.NOM_COP
                FROM dbo.BUSES B
                INNER JOIN dbo.COOPERATIVAS C ON C.ID_COP = B.ID_COP_PER
                WHERE B.ID_BUS = @id
            `);

        if (resultado.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Bus no encontrado.' });
        }

        return res.status(200).json({ success: true, bus: resultado.recordset[0] });
    } catch (error) {
        return manejarError(res, 'consulta de bus', error);
    }
}

async function crearBus(req, res) {
    const datos = normalizarBus(req.body);
    const problema = validarBus(datos);
    if (problema) return res.status(400).json({ success: false, message: problema });

    let transaccion;
    try {
        const pool = await conectarBD();
        if (!(await cooperativaExiste(pool, datos.ID_COP_PER))) {
            return res.status(404).json({ success: false, message: 'La cooperativa indicada no existe.' });
        }
        if (await placaDuplicada(pool, datos)) {
            return res.status(409).json({ success: false, message: 'Ya existe un bus registrado con esa placa.' });
        }

        transaccion = new sql.Transaction(pool);
        await transaccion.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

        const peticion = new sql.Request(transaccion);
        const idBus = datos.ID_BUS || await siguienteCodigo(peticion, 'BUSES', 'ID_BUS', 'B');

        if (datos.ID_BUS) {
            const existente = await new sql.Request(transaccion)
                .input('id', sql.VarChar(5), idBus)
                .query('SELECT 1 AS existe FROM dbo.BUSES WHERE ID_BUS = @id');
            if (existente.recordset.length > 0) {
                await transaccion.rollback();
                return res.status(409).json({ success: false, message: 'Ya existe un bus con ese código.' });
            }
        }

        await new sql.Request(transaccion)
            .input('id', sql.VarChar(5), idBus)
            .input('numero', sql.VarChar(5), datos.NUM_BUS)
            .input('placa', sql.VarChar(10), datos.PLA_BUS)
            .input('anio', sql.Int, datos.ANIO_BUS)
            .input('pisos', sql.Int, datos.NUM_PIS)
            .input('imagen', sql.VarChar(500), datos.IMG_URL_BUS || null)
            .input('estado', sql.VarChar(10), datos.EST_BUS)
            .input('cooperativa', sql.VarChar(5), datos.ID_COP_PER)
            .query(`
                INSERT INTO dbo.BUSES
                    (ID_BUS, NUM_BUS, PLA_BUS, ANIO_BUS, NUM_PIS, IMG_URL_BUS, EST_BUS, ID_COP_PER)
                VALUES (@id, @numero, @placa, @anio, @pisos, @imagen, @estado, @cooperativa)
            `);

        const totalAsientos = await crearAsientos(transaccion, idBus, datos.ASIENTOS_P1, datos.ASIENTOS_P2);
        await transaccion.commit();

        return res.status(201).json({
            success: true,
            message: `Bus registrado correctamente con ${totalAsientos} asientos.`,
            bus: {
                ID_BUS: idBus,
                NUM_BUS: datos.NUM_BUS,
                PLA_BUS: datos.PLA_BUS,
                ANIO_BUS: datos.ANIO_BUS,
                NUM_PIS: datos.NUM_PIS,
                EST_BUS: datos.EST_BUS,
                TOTAL_ASIENTOS: totalAsientos
            }
        });
    } catch (error) {
        if (transaccion) {
            try { await transaccion.rollback(); } catch { /* la transacción ya cerró */ }
        }
        return manejarError(res, 'registro de bus', error);
    }
}

async function actualizarBus(req, res) {
    const id = codigo(req.params.id);
    if (!CODIGO_RE.test(id)) {
        return res.status(400).json({ success: false, message: 'Código de bus inválido.' });
    }

    const datos = normalizarBus(req.body, id);
    const problema = validarBus(datos);
    if (problema) return res.status(400).json({ success: false, message: problema });

    let transaccion;
    try {
        const pool = await conectarBD();
        const actual = await pool.request()
            .input('id', sql.VarChar(5), id)
            .query('SELECT * FROM dbo.BUSES WHERE ID_BUS = @id');

        if (actual.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Bus no encontrado.' });
        }

        const busActual = actual.recordset[0];
        datos.ID_COP_PER = busActual.ID_COP_PER;

        if (await placaDuplicada(pool, datos, id)) {
            return res.status(409).json({ success: false, message: 'Ya existe otro bus con esa placa.' });
        }

        const configuraAsientos = req.body?.ASIENTOS_P1 !== undefined || req.body?.ASIENTOS_P2 !== undefined;
        const cambiaPisos = datos.NUM_PIS !== busActual.NUM_PIS;

        if ((configuraAsientos || cambiaPisos) && (await contarBoletosDelBus(pool, id)) > 0) {
            return res.status(409).json({
                success: false,
                message: 'No se pueden redistribuir los asientos porque el bus ya tiene boletos asociados.'
            });
        }

        transaccion = new sql.Transaction(pool);
        await transaccion.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

        await new sql.Request(transaccion)
            .input('id', sql.VarChar(5), id)
            .input('numero', sql.VarChar(5), datos.NUM_BUS)
            .input('placa', sql.VarChar(10), datos.PLA_BUS)
            .input('anio', sql.Int, datos.ANIO_BUS)
            .input('pisos', sql.Int, datos.NUM_PIS)
            .input('imagen', sql.VarChar(500), datos.IMG_URL_BUS || null)
            .input('estado', sql.VarChar(10), datos.EST_BUS)
            .query(`
                UPDATE dbo.BUSES
                SET NUM_BUS = @numero,
                    PLA_BUS = @placa,
                    ANIO_BUS = @anio,
                    NUM_PIS = @pisos,
                    IMG_URL_BUS = @imagen,
                    EST_BUS = @estado
                WHERE ID_BUS = @id
            `);

        if (configuraAsientos || cambiaPisos) {
            let piso1 = configuraAsientos ? datos.ASIENTOS_P1 : busActual.ASIENTOS_P1 ?? 20;
            let piso2 = datos.NUM_PIS === 2
                ? (configuraAsientos ? datos.ASIENTOS_P2 : (busActual.ASIENTOS_P2 || 16))
                : 0;
            if (piso2 === 0 && datos.NUM_PIS === 2) piso2 = 16;

            await new sql.Request(transaccion)
                .input('bus', sql.VarChar(5), id)
                .query('DELETE FROM dbo.ASIENTOS_BUS WHERE ID_BUS_PER = @bus');

            await crearAsientos(transaccion, id, piso1, piso2);
        }

        await transaccion.commit();

        return res.status(200).json({ success: true, message: 'Bus actualizado correctamente.' });
    } catch (error) {
        if (transaccion) {
            try { await transaccion.rollback(); } catch { /* la transacción ya cerró */ }
        }
        return manejarError(res, 'actualización de bus', error);
    }
}

async function cambiarEstadoBus(req, res) {
    const id = codigo(req.params.id);
    const estado = codigo(req.body?.EST_BUS ?? req.body?.estado);

    if (!CODIGO_RE.test(id) || !ESTADOS_BUS.includes(estado)) {
        return res.status(400).json({ success: false, message: 'Código o estado de bus inválido.' });
    }

    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('id', sql.VarChar(5), id)
            .input('estado', sql.VarChar(10), estado)
            .query(`
                UPDATE dbo.BUSES
                SET EST_BUS = @estado
                OUTPUT INSERTED.ID_BUS, INSERTED.NUM_BUS, INSERTED.EST_BUS
                WHERE ID_BUS = @id
            `);

        if (resultado.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Bus no encontrado.' });
        }

        return res.status(200).json({
            success: true,
            message: `Estado del bus actualizado a ${estado}.`,
            bus: resultado.recordset[0]
        });
    } catch (error) {
        return manejarError(res, 'cambio de estado del bus', error);
    }
}

async function desactivarBus(req, res) {
    req.body = { EST_BUS: 'INACTIVO' };
    return cambiarEstadoBus(req, res);
}

async function listarAsientos(req, res) {
    const id = codigo(req.params.id);
    if (!CODIGO_RE.test(id)) {
        return res.status(400).json({ success: false, message: 'Código de bus inválido.' });
    }

    try {
        const pool = await conectarBD();
        const bus = await pool.request()
            .input('id', sql.VarChar(5), id)
            .query('SELECT ID_BUS, NUM_BUS, PLA_BUS, NUM_PIS FROM dbo.BUSES WHERE ID_BUS = @id');

        if (bus.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Bus no encontrado.' });
        }

        const resultado = await pool.request()
            .input('id', sql.VarChar(5), id)
            .query(`
                SELECT A.ID_ASI, A.PIS_ASI, A.ID_TIP_PER,
                       T.NOM_TIP, T.PRE_TIP
                FROM dbo.ASIENTOS_BUS A
                INNER JOIN dbo.TIPOS_ASIENTOS T ON T.ID_TIP = A.ID_TIP_PER
                WHERE A.ID_BUS_PER = @id
                ORDER BY A.PIS_ASI, TRY_CAST(A.ID_ASI AS INT), A.ID_ASI
            `);

        let contadorPiso1 = 0;
        let contadorPiso2 = 0;
        const asientos = resultado.recordset.map((asiento) => {
            if (asiento.PIS_ASI === 2) contadorPiso2 += 1;
            else contadorPiso1 += 1;
            const numero = asiento.PIS_ASI === 2 ? contadorPiso2 : contadorPiso1;

            return {
                ...asiento,
                ETIQUETA: `${asiento.PIS_ASI}${String(numero).padStart(2, '0')}`,
                NUMERO: numero
            };
        });

        return res.status(200).json({
            success: true,
            bus: bus.recordset[0],
            pisos: [1, 2].map((piso) => ({
                piso,
                asientos: asientos.filter((asiento) => asiento.PIS_ASI === piso)
            })),
            asientos
        });
    } catch (error) {
        return manejarError(res, 'listado de asientos', error);
    }
}

async function cambiarTipoAsiento(req, res) {
    const id = codigo(req.params.id);
    const tipo = codigo(req.body?.ID_TIP_PER ?? req.body?.tipo);

    if (!CODIGO_RE.test(id) || !CODIGO_RE.test(tipo)) {
        return res.status(400).json({ success: false, message: 'Asiento o tipo de asiento inválido.' });
    }

    try {
        const pool = await conectarBD();
        const tipoExiste = await pool.request()
            .input('tipo', sql.VarChar(5), tipo)
            .query('SELECT 1 AS existe FROM dbo.TIPOS_ASIENTOS WHERE ID_TIP = @tipo');

        if (tipoExiste.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'El tipo de asiento indicado no existe.' });
        }

        const resultado = await pool.request()
            .input('id', sql.VarChar(5), id)
            .input('tipo', sql.VarChar(5), tipo)
            .query(`
                UPDATE dbo.ASIENTOS_BUS
                SET ID_TIP_PER = @tipo
                OUTPUT INSERTED.ID_ASI, INSERTED.PIS_ASI, INSERTED.ID_TIP_PER
                WHERE ID_ASI = @id
            `);

        if (resultado.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Asiento no encontrado.' });
        }

        return res.status(200).json({ success: true, message: 'Tipo de asiento actualizado.', asiento: resultado.recordset[0] });
    } catch (error) {
        return manejarError(res, 'cambio de tipo de asiento', error);
    }
}

async function listarTiposAsiento(req, res) {
    try {
        const pool = await conectarBD();
        const resultado = await pool.request().query('SELECT ID_TIP, NOM_TIP, PRE_TIP FROM dbo.TIPOS_ASIENTOS ORDER BY PRE_TIP, NOM_TIP');
        return res.status(200).json({ success: true, tipos: resultado.recordset });
    } catch (error) {
        return manejarError(res, 'listado de tipos de asiento', error);
    }
}

/* -------------------------------------------------------------------------- */
/*                             RESOLUCIONES ANT                                */
/* -------------------------------------------------------------------------- */

function normalizarResolucion(body, id = null) {
    const datos = body && typeof body === 'object' ? body : {};
    return {
        ID_RES: id === null ? codigo(datos.ID_RES) : codigo(id),
        FEC_EMI_RES: fecha(datos.FEC_EMI_RES) || hoyISO(),
        CUP_FRE_MAX: entero(datos.CUP_FRE_MAX),
        DOC_URL_RES: texto(datos.DOC_URL_RES),
        ID_COP_PER: codigo(datos.ID_COP_PER)
    };
}

function validarResolucion(datos) {
    if (datos.ID_RES && !CODIGO_RE.test(datos.ID_RES)) {
        return 'El código de la resolución debe tener máximo 5 caracteres.';
    }
    if (!datos.FEC_EMI_RES) {
        return 'La fecha de emisión no es válida.';
    }
    if (
        !Number.isInteger(datos.CUP_FRE_MAX)
        || datos.CUP_FRE_MAX < CUPO_FRECUENCIA_MIN
        || datos.CUP_FRE_MAX > CUPO_FRECUENCIA_MAX
    ) {
        return `El cupo máximo de frecuencias debe estar entre ${CUPO_FRECUENCIA_MIN} y ${CUPO_FRECUENCIA_MAX}.`;
    }
    if (datos.DOC_URL_RES.length > 500) {
        return 'La URL del documento debe tener máximo 500 caracteres.';
    }
    if (!CODIGO_RE.test(datos.ID_COP_PER)) {
        return 'Debes indicar la cooperativa de la resolución.';
    }
    return null;
}

async function listarResoluciones(req, res) {
    const cooperativa = cooperativaSolicitada(req);
    if (!cooperativa) {
        return res.status(400).json({ success: false, message: 'Debes indicar una cooperativa válida.' });
    }

    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('cooperativa', sql.VarChar(5), cooperativa)
            .query(`
                SELECT R.ID_RES, R.FEC_EMI_RES, R.CUP_FRE_MAX, R.DOC_URL_RES, R.ID_COP_PER,
                       C.NOM_COP,
                       (SELECT COUNT(*) FROM dbo.FRECUENCIAS F WHERE F.ID_RES_PER = R.ID_RES) AS TOTAL_FRECUENCIAS,
                       (SELECT COUNT(*) FROM dbo.FRECUENCIAS F WHERE F.ID_RES_PER = R.ID_RES AND F.EST_RES = '1') AS FRECUENCIAS_ACTIVAS
                FROM dbo.RESOLUCIONES_ANT R
                INNER JOIN dbo.COOPERATIVAS C ON C.ID_COP = R.ID_COP_PER
                WHERE R.ID_COP_PER = @cooperativa
                ORDER BY R.FEC_EMI_RES DESC, R.ID_RES DESC
            `);

        return res.status(200).json({ success: true, total: resultado.recordset.length, resoluciones: resultado.recordset });
    } catch (error) {
        return manejarError(res, 'listado de resoluciones', error);
    }
}

async function crearResolucion(req, res) {
    const datos = normalizarResolucion(req.body);
    const problema = validarResolucion(datos);
    if (problema) return res.status(400).json({ success: false, message: problema });

    try {
        const pool = await conectarBD();
        if (!(await cooperativaExiste(pool, datos.ID_COP_PER))) {
            return res.status(404).json({ success: false, message: 'La cooperativa indicada no existe.' });
        }

        const id = datos.ID_RES || await siguienteCodigo(pool.request(), 'RESOLUCIONES_ANT', 'ID_RES', 'R');

        if (datos.ID_RES) {
            const existente = await pool.request()
                .input('id', sql.VarChar(5), id)
                .query('SELECT 1 AS existe FROM dbo.RESOLUCIONES_ANT WHERE ID_RES = @id');
            if (existente.recordset.length > 0) {
                return res.status(409).json({ success: false, message: 'Ya existe una resolución con ese código.' });
            }
        }

        const resultado = await pool.request()
            .input('id', sql.VarChar(5), id)
            .input('fecha', sql.Date, datos.FEC_EMI_RES)
            .input('cupo', sql.Int, datos.CUP_FRE_MAX)
            .input('documento', sql.VarChar(500), datos.DOC_URL_RES || null)
            .input('cooperativa', sql.VarChar(5), datos.ID_COP_PER)
            .query(`
                INSERT INTO dbo.RESOLUCIONES_ANT (ID_RES, FEC_EMI_RES, CUP_FRE_MAX, DOC_URL_RES, ID_COP_PER)
                OUTPUT INSERTED.*
                VALUES (@id, @fecha, @cupo, @documento, @cooperativa)
            `);

        return res.status(201).json({
            success: true,
            message: 'Resolución ANT registrada correctamente.',
            resolucion: resultado.recordset[0]
        });
    } catch (error) {
        return manejarError(res, 'registro de resolución', error);
    }
}

async function actualizarResolucion(req, res) {
    const id = codigo(req.params.id);
    if (!CODIGO_RE.test(id)) {
        return res.status(400).json({ success: false, message: 'Código de resolución inválido.' });
    }

    const datos = normalizarResolucion(req.body, id);
    const problema = validarResolucion(datos);
    if (problema) return res.status(400).json({ success: false, message: problema });

    try {
        const pool = await conectarBD();
        const actual = await pool.request()
            .input('id', sql.VarChar(5), id)
            .query('SELECT * FROM dbo.RESOLUCIONES_ANT WHERE ID_RES = @id');

        if (actual.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Resolución no encontrada.' });
        }

        const asignadas = await contarFrecuenciasDeResolucion(pool, id);

        if (asignadas > datos.CUP_FRE_MAX) {
            return res.status(400).json({
                success: false,
                message: `La resolución ya tiene ${asignadas} frecuencias; el cupo no puede ser menor.`
            });
        }

        const resultado = await pool.request()
            .input('id', sql.VarChar(5), id)
            .input('fecha', sql.Date, datos.FEC_EMI_RES)
            .input('cupo', sql.Int, datos.CUP_FRE_MAX)
            .input('documento', sql.VarChar(500), datos.DOC_URL_RES || null)
            .query(`
                UPDATE dbo.RESOLUCIONES_ANT
                SET FEC_EMI_RES = @fecha,
                    CUP_FRE_MAX = @cupo,
                    DOC_URL_RES = @documento
                OUTPUT INSERTED.*
                WHERE ID_RES = @id
            `);

        return res.status(200).json({
            success: true,
            message: 'Resolución actualizada correctamente.',
            resolucion: resultado.recordset[0]
        });
    } catch (error) {
        return manejarError(res, 'actualización de resolución', error);
    }
}

async function eliminarResolucion(req, res) {
    const id = codigo(req.params.id);
    if (!CODIGO_RE.test(id)) {
        return res.status(400).json({ success: false, message: 'Código de resolución inválido.' });
    }

    try {
        const pool = await conectarBD();
        const asignadas = await contarFrecuenciasDeResolucion(pool, id);

        if (asignadas > 0) {
            return res.status(409).json({
                success: false,
                message: 'No se puede eliminar la resolución porque tiene frecuencias asociadas.'
            });
        }

        const resultado = await pool.request()
            .input('id', sql.VarChar(5), id)
            .query('DELETE FROM dbo.RESOLUCIONES_ANT OUTPUT DELETED.ID_RES WHERE ID_RES = @id');

        if (resultado.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Resolución no encontrada.' });
        }

        return res.status(200).json({ success: true, message: 'Resolución eliminada correctamente.' });
    } catch (error) {
        return manejarError(res, 'eliminación de resolución', error);
    }
}

/* -------------------------------------------------------------------------- */
/*                                FRECUENCIAS                                  */
/* -------------------------------------------------------------------------- */

function normalizarFrecuencia(body, id = null) {
    const datos = body && typeof body === 'object' ? body : {};
    return {
        ID_FRE: id === null ? codigo(datos.ID_FRE) : codigo(id),
        CIU_ORI_FRE: codigo(datos.CIU_ORI_FRE),
        CIU_DES_FRE: codigo(datos.CIU_DES_FRE),
        FEC_HOR_INI_FRE: fecha(datos.FEC_HOR_INI_FRE),
        FEC_HOR_FIN_FRE: fecha(datos.FEC_HOR_FIN_FRE),
        EST_RES: datos.EST_RES === undefined ? '1' : String(datos.EST_RES),
        ID_RES_PER: codigo(datos.ID_RES_PER)
    };
}

function validarFrecuencia(datos) {
    if (datos.ID_FRE && !CODIGO_RE.test(datos.ID_FRE)) {
        return 'El código de la frecuencia debe tener máximo 5 caracteres.';
    }
    if (!datos.CIU_ORI_FRE || datos.CIU_ORI_FRE.length > 15) {
        return 'La ciudad de origen es obligatoria y debe tener máximo 15 caracteres.';
    }
    if (!datos.CIU_DES_FRE || datos.CIU_DES_FRE.length > 15) {
        return 'La ciudad de destino es obligatoria y debe tener máximo 15 caracteres.';
    }
    if (datos.CIU_ORI_FRE === datos.CIU_DES_FRE) {
        return 'La ciudad de origen y destino deben ser diferentes.';
    }
    if (!datos.FEC_HOR_INI_FRE) {
        return 'La fecha de inicio de vigencia no es válida (formato esperado: AAAA-MM-DD).';
    }
    if (datos.FEC_HOR_FIN_FRE && datos.FEC_HOR_FIN_FRE < datos.FEC_HOR_INI_FRE) {
        return 'La fecha de fin de vigencia no puede ser anterior a la fecha de inicio.';
    }
    if (!ESTADOS_FRECUENCIA.includes(datos.EST_RES)) {
        return 'El estado de la frecuencia debe ser 1 (activa) o 0 (inactiva).';
    }
    if (!CODIGO_RE.test(datos.ID_RES_PER)) {
        return 'Debes indicar la resolución ANT de la frecuencia.';
    }
    return null;
}

async function obtenerResolucionDeCooperativa(pool, idResolucion, cooperativa) {
    const resultado = await pool.request()
        .input('resolucion', sql.VarChar(5), idResolucion)
        .input('cooperativa', sql.VarChar(5), cooperativa)
        .query(`
            SELECT ID_RES, CUP_FRE_MAX, ID_COP_PER
            FROM dbo.RESOLUCIONES_ANT
            WHERE ID_RES = @resolucion AND ID_COP_PER = @cooperativa
        `);
    return resultado.recordset[0] || null;
}

/**
 * Cuenta cuántas frecuencias tiene asignadas una resolución.
 * Permite excluir la frecuencia en edición para no contar el registro actual.
 */
async function contarFrecuenciasDeResolucion(pool, idResolucion, idExcluir = null) {
    const resultado = await pool.request()
        .input('resolucion', sql.VarChar(5), idResolucion)
        .input('idExcluir', sql.VarChar(5), idExcluir)
        .query(`
            SELECT COUNT(*) AS total
            FROM dbo.FRECUENCIAS
            WHERE ID_RES_PER = @resolucion
              AND (@idExcluir IS NULL OR ID_FRE <> @idExcluir)
        `);

    return resultado.recordset[0].total;
}

async function validarCupoResolucion(pool, resolucion, idActual = null) {
    const usadas = await contarFrecuenciasDeResolucion(pool, resolucion.ID_RES, idActual);
    if (usadas >= resolucion.CUP_FRE_MAX) {
        return `La resolución ${resolucion.ID_RES} alcanzó su cupo máximo de ${resolucion.CUP_FRE_MAX} frecuencias.`;
    }
    return null;
}

async function listarFrecuencias(req, res) {
    const cooperativa = cooperativaSolicitada(req);
    if (!cooperativa) {
        return res.status(400).json({ success: false, message: 'Debes indicar una cooperativa válida.' });
    }

    const origen = codigo(req.query.origen);
    const destino = codigo(req.query.destino);
    const estado = req.query.estado === undefined ? null : String(req.query.estado);

    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('cooperativa', sql.VarChar(5), cooperativa)
            .input('origen', sql.VarChar(15), origen || null)
            .input('destino', sql.VarChar(15), destino || null)
            .input('estado', sql.Char(1), estado)
            .query(`
                SELECT F.ID_FRE, F.CIU_ORI_FRE, F.CIU_DES_FRE, F.FEC_HOR_INI_FRE,
                       F.FEC_HOR_FIN_FRE, F.EST_RES, F.ID_RES_PER,
                       R.CUP_FRE_MAX,
                       DATEDIFF(DAY, F.FEC_HOR_INI_FRE, ISNULL(F.FEC_HOR_FIN_FRE, F.FEC_HOR_INI_FRE)) + 1 AS DIAS_VIGENCIA,
                       (SELECT COUNT(*) FROM dbo.HOJAS_RUTAS H WHERE H.ID_FRE_PER = F.ID_FRE) AS TOTAL_HOJAS
                FROM dbo.FRECUENCIAS F
                INNER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
                WHERE R.ID_COP_PER = @cooperativa
                  AND (@origen IS NULL OR F.CIU_ORI_FRE = @origen)
                  AND (@destino IS NULL OR F.CIU_DES_FRE = @destino)
                  AND (@estado IS NULL OR F.EST_RES = @estado)
                ORDER BY F.CIU_ORI_FRE, F.CIU_DES_FRE, F.FEC_HOR_INI_FRE
            `);

        return res.status(200).json({ success: true, total: resultado.recordset.length, frecuencias: resultado.recordset });
    } catch (error) {
        return manejarError(res, 'listado de frecuencias', error);
    }
}

async function crearFrecuencia(req, res) {
    const datos = normalizarFrecuencia(req.body);
    const problema = validarFrecuencia(datos);
    if (problema) return res.status(400).json({ success: false, message: problema });

    const cooperativa = cooperativaSolicitada(req) || datos.ID_RES_PER;

    try {
        const pool = await conectarBD();
        const resolucion = await obtenerResolucionDeCooperativa(pool, datos.ID_RES_PER, datos.ID_COP_PER || cooperativa);
        if (!resolucion) {
            return res.status(404).json({ success: false, message: 'La resolución indicada no existe o no pertenece a tu cooperativa.' });
        }

        const cupo = await validarCupoResolucion(pool, resolucion);
        if (cupo) return res.status(409).json({ success: false, message: cupo });

        const id = datos.ID_FRE || await siguienteCodigo(pool.request(), 'FRECUENCIAS', 'ID_FRE', 'F');

        if (datos.ID_FRE) {
            const existente = await pool.request()
                .input('id', sql.VarChar(5), id)
                .query('SELECT 1 AS existe FROM dbo.FRECUENCIAS WHERE ID_FRE = @id');
            if (existente.recordset.length > 0) {
                return res.status(409).json({ success: false, message: 'Ya existe una frecuencia con ese código.' });
            }
        }

        const resultado = await pool.request()
            .input('id', sql.VarChar(5), id)
            .input('origen', sql.VarChar(15), datos.CIU_ORI_FRE)
            .input('destino', sql.VarChar(15), datos.CIU_DES_FRE)
            .input('inicio', sql.Date, datos.FEC_HOR_INI_FRE)
            .input('fin', sql.Date, datos.FEC_HOR_FIN_FRE)
            .input('estado', sql.Char(1), datos.EST_RES)
            .input('resolucion', sql.VarChar(5), datos.ID_RES_PER)
            .query(`
                INSERT INTO dbo.FRECUENCIAS
                    (ID_FRE, CIU_ORI_FRE, CIU_DES_FRE, FEC_HOR_INI_FRE, FEC_HOR_FIN_FRE, EST_RES, ID_RES_PER)
                OUTPUT INSERTED.*
                VALUES (@id, @origen, @destino, @inicio, @fin, @estado, @resolucion)
            `);

        return res.status(201).json({ success: true, message: 'Frecuencia registrada correctamente.', frecuencia: resultado.recordset[0] });
    } catch (error) {
        return manejarError(res, 'registro de frecuencia', error);
    }
}

async function actualizarFrecuencia(req, res) {
    const id = codigo(req.params.id);
    if (!CODIGO_RE.test(id)) {
        return res.status(400).json({ success: false, message: 'Código de frecuencia inválido.' });
    }

    const datos = normalizarFrecuencia(req.body, id);
    const problema = validarFrecuencia(datos);
    if (problema) return res.status(400).json({ success: false, message: problema });

    try {
        const pool = await conectarBD();
        const actual = await pool.request()
            .input('id', sql.VarChar(5), id)
            .query(`
                SELECT F.*, R.ID_COP_PER
                FROM dbo.FRECUENCIAS F
                INNER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
                WHERE F.ID_FRE = @id
            `);

        if (actual.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Frecuencia no encontrada.' });
        }

        const resolucion = await obtenerResolucionDeCooperativa(pool, datos.ID_RES_PER, actual.recordset[0].ID_COP_PER);
        if (!resolucion) {
            return res.status(404).json({ success: false, message: 'La resolución indicada no pertenece a la cooperativa.' });
        }

        if (datos.ID_RES_PER !== actual.recordset[0].ID_RES_PER) {
            const cupo = await validarCupoResolucion(pool, resolucion, id);
            if (cupo) return res.status(409).json({ success: false, message: cupo });
        }

        const resultado = await pool.request()
            .input('id', sql.VarChar(5), id)
            .input('origen', sql.VarChar(15), datos.CIU_ORI_FRE)
            .input('destino', sql.VarChar(15), datos.CIU_DES_FRE)
            .input('inicio', sql.Date, datos.FEC_HOR_INI_FRE)
            .input('fin', sql.Date, datos.FEC_HOR_FIN_FRE)
            .input('estado', sql.Char(1), datos.EST_RES)
            .input('resolucion', sql.VarChar(5), datos.ID_RES_PER)
            .query(`
                UPDATE dbo.FRECUENCIAS
                SET CIU_ORI_FRE = @origen,
                    CIU_DES_FRE = @destino,
                    FEC_HOR_INI_FRE = @inicio,
                    FEC_HOR_FIN_FRE = @fin,
                    EST_RES = @estado,
                    ID_RES_PER = @resolucion
                OUTPUT INSERTED.*
                WHERE ID_FRE = @id
            `);

        return res.status(200).json({ success: true, message: 'Frecuencia actualizada correctamente.', frecuencia: resultado.recordset[0] });
    } catch (error) {
        return manejarError(res, 'actualización de frecuencia', error);
    }
}

async function cambiarEstadoFrecuencia(req, res) {
    const id = codigo(req.params.id);
    const estado = String(req.body?.EST_RES ?? req.body?.estado);

    if (!CODIGO_RE.test(id) || !ESTADOS_FRECUENCIA.includes(estado)) {
        return res.status(400).json({ success: false, message: 'Código o estado de frecuencia inválido.' });
    }

    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('id', sql.VarChar(5), id)
            .input('estado', sql.Char(1), estado)
            .query(`
                UPDATE dbo.FRECUENCIAS
                SET EST_RES = @estado
                OUTPUT INSERTED.*
                WHERE ID_FRE = @id
            `);

        if (resultado.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Frecuencia no encontrada.' });
        }

        return res.status(200).json({
            success: true,
            message: estado === '1' ? 'Frecuencia activada.' : 'Frecuencia desactivada.',
            frecuencia: resultado.recordset[0]
        });
    } catch (error) {
        return manejarError(res, 'cambio de estado de frecuencia', error);
    }
}

async function eliminarFrecuencia(req, res) {
    const id = codigo(req.params.id);
    if (!CODIGO_RE.test(id)) {
        return res.status(400).json({ success: false, message: 'Código de frecuencia inválido.' });
    }

    try {
        const pool = await conectarBD();
        const usadas = await pool.request()
            .input('id', sql.VarChar(5), id)
            .query('SELECT COUNT(*) AS total FROM dbo.HOJAS_RUTAS WHERE ID_FRE_PER = @id');

        if (usadas.recordset[0].total > 0) {
            return res.status(409).json({
                success: false,
                message: 'No se puede eliminar la frecuencia porque tiene hojas de ruta asociadas.'
            });
        }

        const resultado = await pool.request()
            .input('id', sql.VarChar(5), id)
            .query('DELETE FROM dbo.FRECUENCIAS OUTPUT DELETED.ID_FRE WHERE ID_FRE = @id');

        if (resultado.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Frecuencia no encontrada.' });
        }

        return res.status(200).json({ success: true, message: 'Frecuencia eliminada correctamente.' });
    } catch (error) {
        return manejarError(res, 'eliminación de frecuencia', error);
    }
}

/* -------------------------------------------------------------------------- */
/*                               HOJAS DE RUTA                                 */
/* -------------------------------------------------------------------------- */

function normalizarHoja(body, id = null) {
    const datos = body && typeof body === 'object' ? body : {};
    return {
        ID_HOJ: id === null ? codigo(datos.ID_HOJ) : codigo(id),
        FEC_PRO_HOJ: fecha(datos.FEC_PRO_HOJ),
        EST_VIA_HOJ: codigo(datos.EST_VIA_HOJ) || 'PROGRAMADA',
        OBS_HOJ: texto(datos.OBS_HOJ),
        ID_BUS_PER: codigo(datos.ID_BUS_PER),
        ID_FRE_PER: codigo(datos.ID_FRE_PER),
        ID_USU_CON: codigo(datos.ID_USU_CON)
    };
}

function validarHoja(datos) {
    if (datos.ID_HOJ && !CODIGO_RE.test(datos.ID_HOJ)) {
        return 'El código de la hoja de ruta debe tener máximo 5 caracteres.';
    }
    if (!datos.FEC_PRO_HOJ) {
        return 'La fecha de programación no es válida.';
    }
    if (!ESTADOS_VIAJE.includes(datos.EST_VIA_HOJ)) {
        return 'El estado del viaje no es válido.';
    }
    if (datos.OBS_HOJ.length > 50) {
        return 'La observación debe tener máximo 50 caracteres.';
    }
    if (!CODIGO_RE.test(datos.ID_BUS_PER)) {
        return 'Debes seleccionar un bus.';
    }
    if (!CODIGO_RE.test(datos.ID_FRE_PER)) {
        return 'Debes seleccionar una frecuencia.';
    }
    if (datos.ID_USU_CON && !CODIGO_RE.test(datos.ID_USU_CON)) {
        return 'El controlador seleccionado no es válido.';
    }
    return null;
}

async function listarHojasRuta(req, res) {
    const cooperativa = cooperativaSolicitada(req);
    if (!cooperativa) {
        return res.status(400).json({ success: false, message: 'Debes indicar una cooperativa válida.' });
    }

    const fechaFiltro = fecha(req.query.fecha);
    const estado = req.query.estado ? codigo(req.query.estado) : null;

    if (estado && !ESTADOS_VIAJE.includes(estado)) {
        return res.status(400).json({ success: false, message: 'Estado de viaje no válido.' });
    }

    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('cooperativa', sql.VarChar(5), cooperativa)
            .input('fecha', sql.Date, fechaFiltro)
            .input('estado', sql.VarChar(30), estado)
            .query(`
                SELECT H.ID_HOJ, H.FEC_PRO_HOJ, H.EST_VIA_HOJ, H.OBS_HOJ,
                       H.ID_BUS_PER, H.ID_FRE_PER, H.ID_USU_CON,
                       B.NUM_BUS, B.PLA_BUS, B.NUM_PIS,
                       F.CIU_ORI_FRE, F.CIU_DES_FRE, F.FEC_HOR_INI_FRE, F.FEC_HOR_FIN_FRE,
                       U.NOM_USU AS NOM_CONTROLADOR, U.APE_USU AS APE_CONTROLADOR,
                       (SELECT COUNT(*) FROM dbo.BOLETOS BO
                         WHERE BO.ID_HOJ_PER = H.ID_HOJ
                           AND BO.EST_BOL IN ('RESERVADO','EMITIDO','PAGADO','USADO')) AS BOLETOS_VENDIDOS,
                       (SELECT COUNT(*) FROM dbo.ASIENTOS_BUS A WHERE A.ID_BUS_PER = B.ID_BUS) AS TOTAL_ASIENTOS
                FROM dbo.HOJAS_RUTAS H
                INNER JOIN dbo.BUSES B ON B.ID_BUS = H.ID_BUS_PER
                INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                INNER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
                LEFT JOIN dbo.USUARIOS U ON U.ID_USU = H.ID_USU_CON
                WHERE R.ID_COP_PER = @cooperativa
                  AND (@fecha IS NULL OR H.FEC_PRO_HOJ = @fecha)
                  AND (@estado IS NULL OR H.EST_VIA_HOJ = @estado)
                ORDER BY H.FEC_PRO_HOJ DESC, F.CIU_ORI_FRE, F.CIU_DES_FRE
            `);

        return res.status(200).json({ success: true, total: resultado.recordset.length, hojas: resultado.recordset });
    } catch (error) {
        return manejarError(res, 'listado de hojas de ruta', error);
    }
}

async function validarRelacionesHoja(pool, datos, cooperativa) {
    const bus = await pool.request()
        .input('bus', sql.VarChar(5), datos.ID_BUS_PER)
        .input('cooperativa', sql.VarChar(5), cooperativa)
        .query('SELECT 1 AS existe FROM dbo.BUSES WHERE ID_BUS = @bus AND ID_COP_PER = @cooperativa');

    if (bus.recordset.length === 0) {
        return 'El bus seleccionado no pertenece a tu cooperativa.';
    }

    const frecuencia = await pool.request()
        .input('frecuencia', sql.VarChar(5), datos.ID_FRE_PER)
        .input('cooperativa', sql.VarChar(5), cooperativa)
        .query(`
            SELECT F.ID_FRE, F.EST_RES
            FROM dbo.FRECUENCIAS F
            INNER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
            WHERE F.ID_FRE = @frecuencia AND R.ID_COP_PER = @cooperativa
        `);

    if (frecuencia.recordset.length === 0) {
        return 'La frecuencia seleccionada no pertenece a tu cooperativa.';
    }
    if (frecuencia.recordset[0].EST_RES !== '1') {
        return 'La frecuencia seleccionada está inactiva.';
    }

    if (datos.ID_USU_CON) {
        const controlador = await pool.request()
            .input('usuario', sql.VarChar(10), datos.ID_USU_CON)
            .query(`
                SELECT U.ID_USU
                FROM dbo.USUARIOS U
                INNER JOIN dbo.ROLES R ON R.ID_ROL = U.ID_ROL_PER
                WHERE U.ID_USU = @usuario AND U.EST_USU = '1' AND R.ID_ROL = 'R004'
            `);

        if (controlador.recordset.length === 0) {
            return 'El controlador seleccionado no existe o está inactivo.';
        }
    }

    return null;
}

async function crearHojaRuta(req, res) {
    const datos = normalizarHoja(req.body);
    const problema = validarHoja(datos);
    if (problema) return res.status(400).json({ success: false, message: problema });

    const cooperativa = cooperativaSolicitada(req);
    if (!cooperativa) {
        return res.status(400).json({ success: false, message: 'Debes indicar una cooperativa válida.' });
    }

    try {
        const pool = await conectarBD();
        const relacion = await validarRelacionesHoja(pool, datos, cooperativa);
        if (relacion) return res.status(400).json({ success: false, message: relacion });

        const id = datos.ID_HOJ || await siguienteCodigo(pool.request(), 'HOJAS_RUTAS', 'ID_HOJ', 'H');

        if (datos.ID_HOJ) {
            const existente = await pool.request()
                .input('id', sql.VarChar(5), id)
                .query('SELECT 1 AS existe FROM dbo.HOJAS_RUTAS WHERE ID_HOJ = @id');
            if (existente.recordset.length > 0) {
                return res.status(409).json({ success: false, message: 'Ya existe una hoja de ruta con ese código.' });
            }
        }

        const resultado = await pool.request()
            .input('id', sql.VarChar(5), id)
            .input('fecha', sql.Date, datos.FEC_PRO_HOJ)
            .input('estado', sql.VarChar(30), datos.EST_VIA_HOJ)
            .input('observacion', sql.VarChar(50), datos.OBS_HOJ || null)
            .input('bus', sql.VarChar(5), datos.ID_BUS_PER)
            .input('frecuencia', sql.VarChar(5), datos.ID_FRE_PER)
            .input('controlador', sql.VarChar(10), datos.ID_USU_CON || null)
            .query(`
                INSERT INTO dbo.HOJAS_RUTAS
                    (ID_HOJ, FEC_PRO_HOJ, EST_VIA_HOJ, OBS_HOJ, ID_BUS_PER, ID_BUS_REE, ID_FRE_PER, ID_USU_CON)
                OUTPUT INSERTED.*
                VALUES (@id, @fecha, @estado, @observacion, @bus, NULL, @frecuencia, @controlador)
            `);

        return res.status(201).json({ success: true, message: 'Hoja de ruta creada correctamente.', hoja: resultado.recordset[0] });
    } catch (error) {
        return manejarError(res, 'registro de hoja de ruta', error);
    }
}

async function actualizarHojaRuta(req, res) {
    const id = codigo(req.params.id);
    if (!CODIGO_RE.test(id)) {
        return res.status(400).json({ success: false, message: 'Código de hoja de ruta inválido.' });
    }

    const datos = normalizarHoja(req.body, id);
    const problema = validarHoja(datos);
    if (problema) return res.status(400).json({ success: false, message: problema });

    const cooperativa = cooperativaSolicitada(req);
    if (!cooperativa) {
        return res.status(400).json({ success: false, message: 'Debes indicar una cooperativa válida.' });
    }

    try {
        const pool = await conectarBD();
        const actual = await pool.request()
            .input('id', sql.VarChar(5), id)
            .query('SELECT 1 AS existe FROM dbo.HOJAS_RUTAS WHERE ID_HOJ = @id');

        if (actual.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Hoja de ruta no encontrada.' });
        }

        const relacion = await validarRelacionesHoja(pool, datos, cooperativa);
        if (relacion) return res.status(400).json({ success: false, message: relacion });

        const resultado = await pool.request()
            .input('id', sql.VarChar(5), id)
            .input('fecha', sql.Date, datos.FEC_PRO_HOJ)
            .input('estado', sql.VarChar(30), datos.EST_VIA_HOJ)
            .input('observacion', sql.VarChar(50), datos.OBS_HOJ || null)
            .input('bus', sql.VarChar(5), datos.ID_BUS_PER)
            .input('frecuencia', sql.VarChar(5), datos.ID_FRE_PER)
            .input('controlador', sql.VarChar(10), datos.ID_USU_CON || null)
            .query(`
                UPDATE dbo.HOJAS_RUTAS
                SET FEC_PRO_HOJ = @fecha,
                    EST_VIA_HOJ = @estado,
                    OBS_HOJ = @observacion,
                    ID_BUS_PER = @bus,
                    ID_FRE_PER = @frecuencia,
                    ID_USU_CON = @controlador
                OUTPUT INSERTED.*
                WHERE ID_HOJ = @id
            `);

        return res.status(200).json({ success: true, message: 'Hoja de ruta actualizada correctamente.', hoja: resultado.recordset[0] });
    } catch (error) {
        return manejarError(res, 'actualización de hoja de ruta', error);
    }
}

async function cambiarEstadoHojaRuta(req, res) {
    const id = codigo(req.params.id);
    const estado = codigo(req.body?.EST_VIA_HOJ ?? req.body?.estado);

    if (!CODIGO_RE.test(id) || !ESTADOS_VIAJE.includes(estado)) {
        return res.status(400).json({ success: false, message: 'Código o estado de viaje inválido.' });
    }

    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('id', sql.VarChar(5), id)
            .input('estado', sql.VarChar(30), estado)
            .query(`
                UPDATE dbo.HOJAS_RUTAS
                SET EST_VIA_HOJ = @estado
                OUTPUT INSERTED.*
                WHERE ID_HOJ = @id
            `);

        if (resultado.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Hoja de ruta no encontrada.' });
        }

        return res.status(200).json({
            success: true,
            message: `Hoja de ruta marcada como ${estado}.`,
            hoja: resultado.recordset[0]
        });
    } catch (error) {
        return manejarError(res, 'cambio de estado de hoja de ruta', error);
    }
}

async function eliminarHojaRuta(req, res) {
    const id = codigo(req.params.id);
    if (!CODIGO_RE.test(id)) {
        return res.status(400).json({ success: false, message: 'Código de hoja de ruta inválido.' });
    }

    try {
        const pool = await conectarBD();
        const boletos = await pool.request()
            .input('id', sql.VarChar(5), id)
            .query('SELECT COUNT(*) AS total FROM dbo.BOLETOS WHERE ID_HOJ_PER = @id');

        if (boletos.recordset[0].total > 0) {
            return res.status(409).json({
                success: false,
                message: 'No se puede eliminar la hoja de ruta porque tiene boletos asociados.'
            });
        }

        const resultado = await pool.request()
            .input('id', sql.VarChar(5), id)
            .query('DELETE FROM dbo.HOJAS_RUTAS OUTPUT DELETED.ID_HOJ WHERE ID_HOJ = @id');

        if (resultado.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Hoja de ruta no encontrada.' });
        }

        return res.status(200).json({ success: true, message: 'Hoja de ruta eliminada correctamente.' });
    } catch (error) {
        return manejarError(res, 'eliminación de hoja de ruta', error);
    }
}

/* -------------------------------------------------------------------------- */
/*                                  DASHBOARD                                  */
/* -------------------------------------------------------------------------- */

async function resumenCooperativa(req, res) {
    const cooperativa = cooperativaSolicitada(req);
    if (!cooperativa) {
        return res.status(400).json({ success: false, message: 'Debes indicar una cooperativa válida.' });
    }

    try {
        const pool = await conectarBD();

        const datos = await pool.request()
            .input('cooperativa', sql.VarChar(5), cooperativa)
            .input('hoy', sql.Date, hoyISO())
            .query(`
                SELECT
                    (SELECT COUNT(*) FROM dbo.BUSES WHERE ID_COP_PER = @cooperativa) AS TOTAL_BUSES,
                    (SELECT COUNT(*) FROM dbo.BUSES WHERE ID_COP_PER = @cooperativa AND EST_BUS = 'ACTIVO') AS BUSES_ACTIVOS,
                    (SELECT COUNT(*) FROM dbo.RESOLUCIONES_ANT WHERE ID_COP_PER = @cooperativa) AS TOTAL_RESOLUCIONES,
                    (SELECT COUNT(*) FROM dbo.FRECUENCIAS F
                       INNER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
                       WHERE R.ID_COP_PER = @cooperativa AND F.EST_RES = '1') AS FRECUENCIAS_ACTIVAS,
                    (SELECT COUNT(*) FROM dbo.HOJAS_RUTAS H
                       INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                       INNER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
                       WHERE R.ID_COP_PER = @cooperativa AND H.FEC_PRO_HOJ = @hoy) AS HOJAS_HOY,
                    (SELECT COUNT(*) FROM dbo.BOLETOS B
                       INNER JOIN dbo.HOJAS_RUTAS H ON H.ID_HOJ = B.ID_HOJ_PER
                       INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                       INNER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
                       WHERE R.ID_COP_PER = @cooperativa AND B.FEC_COM_BOL = @hoy
                         AND B.EST_BOL IN ('EMITIDO','PAGADO','USADO')) AS BOLETOS_HOY,
                    (SELECT ISNULL(SUM(B.PRE_FIN_BOL), 0) FROM dbo.BOLETOS B
                       INNER JOIN dbo.HOJAS_RUTAS H ON H.ID_HOJ = B.ID_HOJ_PER
                       INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                       INNER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
                       WHERE R.ID_COP_PER = @cooperativa AND B.FEC_COM_BOL = @hoy
                         AND B.EST_BOL IN ('EMITIDO','PAGADO','USADO')) AS INGRESOS_HOY,
                    (SELECT COUNT(*) FROM dbo.BOLETOS B
                       INNER JOIN dbo.HOJAS_RUTAS H ON H.ID_HOJ = B.ID_HOJ_PER
                       INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                       INNER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
                       WHERE R.ID_COP_PER = @cooperativa AND B.EST_BOL = 'RESERVADO') AS RESERVAS_PENDIENTES
            `);

        const proximas = await pool.request()
            .input('cooperativa', sql.VarChar(5), cooperativa)
            .input('hoy', sql.Date, hoyISO())
            .query(`
                SELECT TOP (6)
                    H.ID_HOJ, H.FEC_PRO_HOJ, H.EST_VIA_HOJ,
                    B.NUM_BUS, B.PLA_BUS,
                    F.CIU_ORI_FRE, F.CIU_DES_FRE,
                    (SELECT COUNT(*) FROM dbo.BOLETOS BO
                      WHERE BO.ID_HOJ_PER = H.ID_HOJ
                        AND BO.EST_BOL IN ('RESERVADO','EMITIDO','PAGADO','USADO')) AS BOLETOS_VENDIDOS,
                    (SELECT COUNT(*) FROM dbo.ASIENTOS_BUS A WHERE A.ID_BUS_PER = B.ID_BUS) AS TOTAL_ASIENTOS
                FROM dbo.HOJAS_RUTAS H
                INNER JOIN dbo.BUSES B ON B.ID_BUS = H.ID_BUS_PER
                INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                INNER JOIN dbo.RESOLUCIONES_ANT R ON R.ID_RES = F.ID_RES_PER
                WHERE R.ID_COP_PER = @cooperativa
                  AND H.FEC_PRO_HOJ >= @hoy
                  AND H.EST_VIA_HOJ IN ('PROGRAMADA','EN CURSO')
                ORDER BY H.FEC_PRO_HOJ, F.CIU_ORI_FRE
            `);

        const cooperativaInfo = await pool.request()
            .input('cooperativa', sql.VarChar(5), cooperativa)
            .query('SELECT ID_COP, NOM_COP, LOG_URL_COP FROM dbo.COOPERATIVAS WHERE ID_COP = @cooperativa');

        if (cooperativaInfo.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Cooperativa no encontrada.' });
        }

        return res.status(200).json({
            success: true,
            cooperativa: cooperativaInfo.recordset[0],
            resumen: datos.recordset[0],
            proximasSalidas: proximas.recordset
        });
    } catch (error) {
        return manejarError(res, 'resumen de la cooperativa', error);
    }
}

module.exports = {
    listarBuses,
    obtenerBus,
    crearBus,
    actualizarBus,
    cambiarEstadoBus,
    desactivarBus,
    listarAsientos,
    cambiarTipoAsiento,
    listarTiposAsiento,
    listarResoluciones,
    crearResolucion,
    actualizarResolucion,
    eliminarResolucion,
    listarFrecuencias,
    crearFrecuencia,
    actualizarFrecuencia,
    cambiarEstadoFrecuencia,
    eliminarFrecuencia,
    listarHojasRuta,
    crearHojaRuta,
    actualizarHojaRuta,
    cambiarEstadoHojaRuta,
    eliminarHojaRuta,
    resumenCooperativa
};
