const { sql, conectarBD } = require('../config/db');
const cc = require('../services/frequencyControl');
const categories = require('../services/routeCategories');

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
const ESTADOS_BOLETO_VALIDOS_VENTA = ['RESERVADO', 'EMITIDO', 'PAGADO', 'USADO'];
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
    const valor = req.auth?.cooperativaId;
    const id = codigo(valor);
    return CODIGO_RE.test(id) ? id : null;
}

function manejarError(res, contexto, error) {
    if (error.status || error.number === 51701) return res.status(error.status || 400).json({ success: false, message: error.message });
    const control = cc.respond(res, error);
    if (control) return control;
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

async function asegurarTiposAsiento(gestor) {
    await new sql.Request(gestor).query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.TIPOS_ASIENTOS WHERE ID_TIP = 'TIP01')
            INSERT INTO dbo.TIPOS_ASIENTOS (ID_TIP, NOM_TIP, PRE_TIP) VALUES ('TIP01', 'NORMAL', 0);
        IF NOT EXISTS (SELECT 1 FROM dbo.TIPOS_ASIENTOS WHERE ID_TIP = 'TIP02')
            INSERT INTO dbo.TIPOS_ASIENTOS (ID_TIP, NOM_TIP, PRE_TIP) VALUES ('TIP02', 'VIP', 3);
        IF NOT EXISTS (SELECT 1 FROM dbo.TIPOS_ASIENTOS WHERE ID_TIP = 'TIP03')
            INSERT INTO dbo.TIPOS_ASIENTOS (ID_TIP, NOM_TIP, PRE_TIP) VALUES ('TIP03', 'DISCAPACIDAD', 0);
    `);
}

async function columnasEsquemaExtendidas(gestor) {
    try {
        const { recordset: [row] } = await new sql.Request(gestor).query(`
            SELECT
                CASE WHEN COL_LENGTH('dbo.BUSES','PLANTILLA_JSON') IS NOT NULL THEN 1 ELSE 0 END AS BUS_PLANTILLA,
                CASE WHEN COL_LENGTH('dbo.ASIENTOS_BUS','FIL_ASI') IS NOT NULL THEN 1 ELSE 0 END AS ASI_ESPACIAL,
                CASE WHEN COL_LENGTH('dbo.FRECUENCIAS','HORA_SAL_FRE') IS NOT NULL THEN 1 ELSE 0 END AS FRE_HORA_TARIFA,
                CASE WHEN COL_LENGTH('dbo.FRECUENCIAS','HORA_LLE_FRE') IS NOT NULL AND COL_LENGTH('dbo.FRECUENCIAS','ES_DIRECTA') IS NOT NULL THEN 1 ELSE 0 END AS FRE_LLEGADA_PARADAS,
                CASE WHEN OBJECT_ID('dbo.FRECUENCIA_PARADAS','U') IS NOT NULL THEN 1 ELSE 0 END AS TABLA_FRE_PARADAS
        `);
        return row || { BUS_PLANTILLA: 0, ASI_ESPACIAL: 0, FRE_HORA_TARIFA: 0, FRE_LLEGADA_PARADAS: 0, TABLA_FRE_PARADAS: 0 };
    } catch {
        return { BUS_PLANTILLA: 0, ASI_ESPACIAL: 0, FRE_HORA_TARIFA: 0, FRE_LLEGADA_PARADAS: 0, TABLA_FRE_PARADAS: 0 };
    }
}

function ubicacionPorColumna(col) {
    if (col === 0 || col === 4) return 'VENTANA';
    if (col === 1 || col === 3) return 'PASILLO';
    return 'CENTRO';
}

/**
 * Crea los asientos de un bus a partir de una plantilla espacial (o por conteo P1/P2).
 * El ID_ASI es la clave global de 5 caracteres.
 */
async function crearAsientos(gestor, idBus, piso1, piso2, plantilla = null) {
    await asegurarTiposAsiento(gestor);
    const esquema = await columnasEsquemaExtendidas(gestor);
    const base = await siguienteAsiento(new sql.Request(gestor));
    let consecutivo = base;

    const asientos = [];
    if (plantilla && Array.isArray(plantilla.pisos) && plantilla.pisos.length > 0) {
        for (const p of plantilla.pisos) {
            const numPiso = Number(p.piso) === 2 ? 2 : 1;
            const celdas = Array.isArray(p.celdas) ? p.celdas : [];
            for (const celda of celdas) {
                const tipoCelda = codigo(celda.tipoCelda || celda.rol);
                if (['ASIENTO', 'NORMAL', 'VIP', 'DISCAPACIDAD'].includes(tipoCelda)) {
                    let idTipo = codigo(celda.idTipo);
                    if (!idTipo) {
                        if (tipoCelda === 'VIP') idTipo = 'TIP02';
                        else if (tipoCelda === 'DISCAPACIDAD') idTipo = 'TIP03';
                        else idTipo = TIPO_ASIENTO_NORMAL;
                    }
                    const fila = Number.isInteger(Number(celda.fila)) ? Number(celda.fila) : null;
                    const col = Number.isInteger(Number(celda.col)) ? Number(celda.col) : null;
                    const ubicacion = texto(celda.ubicacion).toUpperCase() || (col !== null ? ubicacionPorColumna(col) : 'VENTANA');
                    asientos.push({ piso: numPiso, idTipo, fila, col, ubicacion });
                }
            }
        }
    } else {
        for (let i = 0; i < piso1; i += 1) {
            const fila = Math.floor(i / 4) + 1;
            const idxCol = i % 4;
            const col = idxCol < 2 ? idxCol : idxCol + 1;
            asientos.push({ piso: 1, idTipo: TIPO_ASIENTO_NORMAL, fila, col, ubicacion: ubicacionPorColumna(col) });
        }
        for (let i = 0; i < piso2; i += 1) {
            const fila = Math.floor(i / 4) + 1;
            const idxCol = i % 4;
            const col = idxCol < 2 ? idxCol : idxCol + 1;
            asientos.push({ piso: 2, idTipo: TIPO_ASIENTO_NORMAL, fila, col, ubicacion: ubicacionPorColumna(col) });
        }
    }

    for (const asiento of asientos) {
        const id = String(consecutivo).padStart(5, '0');
        consecutivo += 1;

        const req = new sql.Request(gestor)
            .input('id', sql.VarChar(5), id)
            .input('piso', sql.Int, asiento.piso)
            .input('bus', sql.VarChar(5), idBus)
            .input('tipo', sql.VarChar(5), asiento.idTipo || TIPO_ASIENTO_NORMAL);

        if (esquema.ASI_ESPACIAL) {
            req.input('fila', sql.Int, asiento.fila)
               .input('col', sql.Int, asiento.col)
               .input('ubi', sql.VarChar(15), asiento.ubicacion || null);
            await req.query(`
                INSERT INTO dbo.ASIENTOS_BUS (ID_ASI, PIS_ASI, ID_BUS_PER, ID_TIP_PER, FIL_ASI, COL_ASI, UBI_ASI)
                VALUES (@id, @piso, @bus, @tipo, @fila, @col, @ubi)
            `);
        } else {
            await req.query(`
                INSERT INTO dbo.ASIENTOS_BUS (ID_ASI, PIS_ASI, ID_BUS_PER, ID_TIP_PER)
                VALUES (@id, @piso, @bus, @tipo)
            `);
        }
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

function normalizarPlantilla(raw) {
    if (!raw) return null;
    let obj = raw;
    if (typeof raw === 'string') {
        try { obj = JSON.parse(raw); } catch { return null; }
    }
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.pisos)) return null;
    return obj;
}

function contarAsientosDePlantilla(plantilla) {
    if (!plantilla || !Array.isArray(plantilla.pisos)) return { p1: 0, p2: 0 };
    let p1 = 0;
    let p2 = 0;
    for (const p of plantilla.pisos) {
        const numPiso = Number(p.piso) === 2 ? 2 : 1;
        const celdas = Array.isArray(p.celdas) ? p.celdas : [];
        const totalPiso = celdas.filter((c) => ['ASIENTO', 'NORMAL', 'VIP', 'DISCAPACIDAD'].includes(codigo(c.tipoCelda || c.rol))).length;
        if (numPiso === 2) p2 += totalPiso;
        else p1 += totalPiso;
    }
    return { p1, p2 };
}

function normalizarBus(body, id = null) {
    const datos = body && typeof body === 'object' ? body : {};
    const pisos = entero(datos.NUM_PIS ?? 1);
    const plantilla = normalizarPlantilla(datos.PLANTILLA ?? datos.PLANTILLA_JSON);
    const conteoPlantilla = plantilla ? contarAsientosDePlantilla(plantilla) : null;

    return {
        ID_BUS: id === null ? codigo(datos.ID_BUS) : codigo(id),
        NUM_BUS: texto(datos.NUM_BUS),
        PLA_BUS: codigo(datos.PLA_BUS),
        ANIO_BUS: entero(datos.ANIO_BUS),
        NUM_PIS: Number.isInteger(pisos) ? pisos : 1,
        IMG_URL_BUS: texto(datos.IMG_URL_BUS),
        EST_BUS: datos.EST_BUS === undefined ? 'ACTIVO' : codigo(datos.EST_BUS),
        ID_COP_PER: codigo(datos.ID_COP_PER),
        MOD_PLA_BUS: texto(datos.MOD_PLA_BUS || plantilla?.modelo || '').slice(0, 30) || null,
        PLANTILLA: plantilla,
        PLANTILLA_JSON: plantilla ? JSON.stringify(plantilla) : null,
        ASIENTOS_P1: conteoPlantilla && conteoPlantilla.p1 > 0 ? conteoPlantilla.p1 : entero(datos.ASIENTOS_P1 ?? 20),
        ASIENTOS_P2: conteoPlantilla && (Number.isInteger(pisos) ? pisos : 1) === 2 && conteoPlantilla.p2 > 0
            ? conteoPlantilla.p2
            : entero(datos.ASIENTOS_P2 ?? 0)
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
                    B.*,
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

        const esquema = await columnasEsquemaExtendidas(transaccion);
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

        const insertReq = new sql.Request(transaccion)
            .input('id', sql.VarChar(5), idBus)
            .input('numero', sql.VarChar(5), datos.NUM_BUS)
            .input('placa', sql.VarChar(10), datos.PLA_BUS)
            .input('anio', sql.Int, datos.ANIO_BUS)
            .input('pisos', sql.Int, datos.NUM_PIS)
            .input('imagen', sql.VarChar(500), datos.IMG_URL_BUS || null)
            .input('estado', sql.VarChar(10), datos.EST_BUS)
            .input('cooperativa', sql.VarChar(5), datos.ID_COP_PER);

        if (esquema.BUS_PLANTILLA) {
            insertReq.input('modelo', sql.VarChar(30), datos.MOD_PLA_BUS)
                     .input('plantilla', sql.NVarChar(sql.MAX), datos.PLANTILLA_JSON);
            await insertReq.query(`
                INSERT INTO dbo.BUSES
                    (ID_BUS, NUM_BUS, PLA_BUS, ANIO_BUS, NUM_PIS, IMG_URL_BUS, EST_BUS, ID_COP_PER, MOD_PLA_BUS, PLANTILLA_JSON)
                VALUES (@id, @numero, @placa, @anio, @pisos, @imagen, @estado, @cooperativa, @modelo, @plantilla)
            `);
        } else {
            await insertReq.query(`
                INSERT INTO dbo.BUSES
                    (ID_BUS, NUM_BUS, PLA_BUS, ANIO_BUS, NUM_PIS, IMG_URL_BUS, EST_BUS, ID_COP_PER)
                VALUES (@id, @numero, @placa, @anio, @pisos, @imagen, @estado, @cooperativa)
            `);
        }

        await require('../services/busTemplates').updateCrew(transaccion, idBus, datos.ID_COP_PER, req.body);
        const totalAsientos = await crearAsientos(transaccion, idBus, datos.ASIENTOS_P1, datos.ASIENTOS_P2, datos.PLANTILLA);
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
                MOD_PLA_BUS: datos.MOD_PLA_BUS,
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

        const configuraAsientos = req.body?.ASIENTOS_P1 !== undefined || req.body?.ASIENTOS_P2 !== undefined || Boolean(datos.PLANTILLA);
        const cambiaPisos = datos.NUM_PIS !== busActual.NUM_PIS;

        if ((configuraAsientos || cambiaPisos) && (await contarBoletosDelBus(pool, id)) > 0) {
            return res.status(409).json({
                success: false,
                codigo: 'ASIENTOS_BLOQUEADOS',
                message: 'No se pueden redistribuir los asientos porque el bus ya tiene boletos asociados.'
            });
        }

        transaccion = new sql.Transaction(pool);
        await transaccion.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const esquema = await columnasEsquemaExtendidas(transaccion);

        const updateReq = new sql.Request(transaccion)
            .input('id', sql.VarChar(5), id)
            .input('numero', sql.VarChar(5), datos.NUM_BUS)
            .input('placa', sql.VarChar(10), datos.PLA_BUS)
            .input('anio', sql.Int, datos.ANIO_BUS)
            .input('pisos', sql.Int, datos.NUM_PIS)
            .input('imagen', sql.VarChar(500), datos.IMG_URL_BUS || null)
            .input('estado', sql.VarChar(10), datos.EST_BUS);

        if (esquema.BUS_PLANTILLA && datos.PLANTILLA_JSON !== null) {
            updateReq.input('modelo', sql.VarChar(30), datos.MOD_PLA_BUS)
                     .input('plantilla', sql.NVarChar(sql.MAX), datos.PLANTILLA_JSON);
            await updateReq.query(`
                UPDATE dbo.BUSES
                SET NUM_BUS = @numero,
                    PLA_BUS = @placa,
                    ANIO_BUS = @anio,
                    NUM_PIS = @pisos,
                    IMG_URL_BUS = @imagen,
                    EST_BUS = @estado,
                    MOD_PLA_BUS = @modelo,
                    PLANTILLA_JSON = @plantilla
                WHERE ID_BUS = @id
            `);
        } else {
            await updateReq.query(`
                UPDATE dbo.BUSES
                SET NUM_BUS = @numero,
                    PLA_BUS = @placa,
                    ANIO_BUS = @anio,
                    NUM_PIS = @pisos,
                    IMG_URL_BUS = @imagen,
                    EST_BUS = @estado
                WHERE ID_BUS = @id
            `);
        }

        await require('../services/busTemplates').updateCrew(transaccion, id, datos.ID_COP_PER, req.body);
        if (configuraAsientos || cambiaPisos) {
            let piso1 = configuraAsientos ? datos.ASIENTOS_P1 : busActual.ASIENTOS_P1 ?? 20;
            let piso2 = datos.NUM_PIS === 2
                ? (configuraAsientos ? datos.ASIENTOS_P2 : (busActual.ASIENTOS_P2 || 16))
                : 0;
            if (piso2 === 0 && datos.NUM_PIS === 2) piso2 = 16;

            await new sql.Request(transaccion)
                .input('bus', sql.VarChar(5), id)
                .query('DELETE FROM dbo.ASIENTOS_BUS WHERE ID_BUS_PER = @bus');

            await crearAsientos(transaccion, id, piso1, piso2, datos.PLANTILLA);
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
            .query('SELECT B.* FROM dbo.BUSES B WHERE B.ID_BUS = @id');

        if (bus.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Bus no encontrado.' });
        }

        const resultado = await pool.request()
            .input('id', sql.VarChar(5), id)
            .query(`
                SELECT A.*,
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

        const datosBus = bus.recordset[0];
        const plantilla = normalizarPlantilla(datosBus.PLANTILLA_JSON);

        return res.status(200).json({
            success: true,
            bus: datosBus,
            plantilla,
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

async function guardarPlantillaAsientos(req, res) {
    const id = codigo(req.params.id);
    if (!CODIGO_RE.test(id)) {
        return res.status(400).json({ success: false, message: 'Código de bus inválido.' });
    }

    const plantilla = normalizarPlantilla(req.body?.PLANTILLA ?? req.body?.plantilla);
    const modelo = texto(req.body?.MOD_PLA_BUS || plantilla?.modelo || 'PERSONALIZADA').slice(0, 30);
    if (!plantilla) {
        return res.status(400).json({ success: false, message: 'La plantilla de estructura de asientos no es válida.' });
    }

    const conteo = contarAsientosDePlantilla(plantilla);
    if (conteo.p1 < 4 || conteo.p1 > 60) {
        return res.status(400).json({ success: false, message: 'El piso 1 de la plantilla debe tener entre 4 y 60 asientos.' });
    }

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
        if (Number(busActual.NUM_PIS) === 2 && (conteo.p2 < 4 || conteo.p2 > 60)) {
            return res.status(400).json({ success: false, message: 'El piso 2 de la plantilla debe tener entre 4 y 60 asientos.' });
        }

        if ((await contarBoletosDelBus(pool, id)) > 0) {
            return res.status(409).json({
                success: false,
                codigo: 'ASIENTOS_BLOQUEADOS',
                message: 'No se puede regenerar la estructura de asientos porque el bus ya tiene boletos emitidos.'
            });
        }

        transaccion = new sql.Transaction(pool);
        await transaccion.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const esquema = await columnasEsquemaExtendidas(transaccion);

        if (esquema.BUS_PLANTILLA) {
            await new sql.Request(transaccion)
                .input('id', sql.VarChar(5), id)
                .input('modelo', sql.VarChar(30), modelo)
                .input('plantilla', sql.NVarChar(sql.MAX), JSON.stringify({ ...plantilla, modelo }))
                .query(`
                    UPDATE dbo.BUSES
                    SET MOD_PLA_BUS = @modelo,
                        PLANTILLA_JSON = @plantilla
                    WHERE ID_BUS = @id
                `);
        }

        await new sql.Request(transaccion)
            .input('bus', sql.VarChar(5), id)
            .query('DELETE FROM dbo.ASIENTOS_BUS WHERE ID_BUS_PER = @bus');

        const total = await crearAsientos(transaccion, id, conteo.p1, Number(busActual.NUM_PIS) === 2 ? conteo.p2 : 0, plantilla);
        await transaccion.commit();

        return res.status(200).json({
            success: true,
            message: `Plantilla de asientos guardada correctamente (${total} asientos configurados).`,
            totalAsientos: total
        });
    } catch (error) {
        if (transaccion) {
            try { await transaccion.rollback(); } catch { /* cerrada */ }
        }
        return manejarError(res, 'guardado de plantilla de asientos', error);
    }
}

async function subirImagenBus(req, res) {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Selecciona una imagen desde tu dispositivo (JPG, PNG o WebP).' });
    }
    const url = `/uploads/${req.file.filename}`;
    return res.status(201).json({
        success: true,
        message: 'Fotografía del bus cargada correctamente.',
        url
    });
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
/*                     RESOLUCIONES ANT (SIMPLIFICADO RFC-000078)             */
/* -------------------------------------------------------------------------- */

function resolucionesDeprecado(req, res) {
    return res.status(410).json({
        success: false,
        code: 'MODULO_RESOLUCIONES_ELIMINADO',
        message: 'El módulo independiente de Resoluciones ANT y los cupos máximos fueron eliminados. Registra el número de resolución directamente en cada frecuencia.'
    });
}

const listarResoluciones = resolucionesDeprecado;
const crearResolucion = resolucionesDeprecado;
const actualizarResolucion = resolucionesDeprecado;
const eliminarResolucion = resolucionesDeprecado;

/* -------------------------------------------------------------------------- */
/*                                FRECUENCIAS                                  */
/* -------------------------------------------------------------------------- */

function normalizarHora(valor) {
    const limpio = texto(valor);
    if (!limpio) return null;
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(limpio) ? limpio : '';
}

function normalizarTarifa(valor) {
    if (valor === undefined || valor === null || valor === '') return null;
    const num = Number(valor);
    return Number.isFinite(num) && num > 0 && num <= 9999 ? Math.round(num * 100) / 100 : NaN;
}

function normalizarParadasIntermedias(raw) {
    if (raw === undefined || raw === null) return null;
    const lista = Array.isArray(raw)
        ? raw
        : (typeof raw === 'string' && raw.trim()
            ? raw.split(',').map((item) => item.trim()).filter(Boolean)
            : []);
    return lista.map((item, indice) => {
        if (typeof item === 'string') {
            return { ORDEN: indice + 1, NOMBRE: codigo(item), COMERCIAL: true };
        }
        const obj = item && typeof item === 'object' ? item : {};
        const nombre = codigo(obj.NOMBRE ?? obj.nombre ?? obj.ciudad ?? '');
        const comercial = obj.COMERCIAL === undefined && obj.comercial === undefined
            ? true
            : !(obj.COMERCIAL === false || obj.COMERCIAL === 0 || obj.COMERCIAL === '0' || obj.comercial === false || obj.comercial === 0 || obj.comercial === '0');
        return { ORDEN: indice + 1, NOMBRE: nombre, COMERCIAL: comercial };
    }).filter((p) => p.NOMBRE);
}

function normalizarFrecuencia(body, id = null) {
    const datos = body && typeof body === 'object' ? body : {};
    const tieneCampoParadas = datos.PARADAS !== undefined || datos.paradas !== undefined;
    const rawDirecta = datos.ES_DIRECTA ?? datos.esDirecta ?? datos.TIPO_TRAYECTO ?? datos.tipoTrayecto;
    const tieneCampoDirecta = rawDirecta !== undefined && rawDirecta !== null && rawDirecta !== '';
    const paradasNormalizadas = normalizarParadasIntermedias(datos.PARADAS ?? datos.paradas);

    let modoDirecto = true;
    if (tieneCampoDirecta) {
        const val = String(rawDirecta).trim().toUpperCase();
        modoDirecto = val === '1' || val === 'TRUE' || val === 'DIRECTO' || val === 'DIRECTA';
    } else if (Array.isArray(paradasNormalizadas)) {
        modoDirecto = paradasNormalizadas.length === 0;
    }

    const paradas = (tieneCampoDirecta && modoDirecto && (!Array.isArray(paradasNormalizadas) || paradasNormalizadas.length === 0))
        ? []
        : (tieneCampoDirecta && modoDirecto ? [] : (paradasNormalizadas || []));

    return {
        ID_FRE: id === null ? codigo(datos.ID_FRE) : codigo(id),
        CIU_ORI_FRE: codigo(datos.CIU_ORI_FRE),
        CIU_DES_FRE: codigo(datos.CIU_DES_FRE),
        FEC_HOR_INI_FRE: fecha(datos.FEC_HOR_INI_FRE),
        FEC_HOR_FIN_FRE: fecha(datos.FEC_HOR_FIN_FRE),
        HORA_SAL_FRE: normalizarHora(datos.HORA_SAL_FRE ?? datos.hora),
        HORA_LLE_FRE: normalizarHora(datos.HORA_LLE_FRE ?? datos.horaLlegada),
        TAR_BAS_FRE: normalizarTarifa(datos.TAR_BAS_FRE ?? datos.tarifaBase),
        ES_DIRECTA: paradas.length === 0 && modoDirecto,
        MODO_EXPLICITO_PARADAS: tieneCampoDirecta && !modoDirecto,
        ACTUALIZAR_PARADAS: tieneCampoParadas || tieneCampoDirecta,
        PARADAS: paradas,
        EST_RES: datos.EST_RES === undefined ? '1' : String(datos.EST_RES),
        NUM_RES_FRE: texto(datos.NUM_RES_FRE)
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
    if (datos.HORA_SAL_FRE === '') {
        return 'La hora de salida debe tener el formato HH:MM (ej. 08:30).';
    }
    if (datos.HORA_LLE_FRE === '') {
        return 'La hora estimada de llegada debe tener el formato HH:MM (ej. 10:30).';
    }
    if (Number.isNaN(datos.TAR_BAS_FRE)) {
        return 'La tarifa base debe ser un valor mayor a $0.00.';
    }
    if (datos.MODO_EXPLICITO_PARADAS && (!Array.isArray(datos.PARADAS) || datos.PARADAS.length === 0)) {
        return 'Debes agregar al menos una parada intermedia o seleccionar modalidad Directo.';
    }
    if (Array.isArray(datos.PARADAS) && datos.PARADAS.length > 0) {
        if (datos.PARADAS.length > 15) {
            return 'Una frecuencia puede tener máximo 15 paradas intermedias.';
        }
        for (const parada of datos.PARADAS) {
            if (!parada.NOMBRE || parada.NOMBRE.length > 20) {
                return 'Cada parada intermedia debe tener un nombre válido de máximo 20 caracteres.';
            }
            if (parada.NOMBRE === datos.CIU_ORI_FRE || parada.NOMBRE === datos.CIU_DES_FRE) {
                return 'Las paradas intermedias no pueden coincidir con la ciudad de origen ni con la de destino.';
            }
        }
        const unicas = new Set(datos.PARADAS.map((p) => p.NOMBRE));
        if (unicas.size !== datos.PARADAS.length) {
            return 'No se permiten paradas intermedias duplicadas en la misma frecuencia.';
        }
    }
    if (!ESTADOS_FRECUENCIA.includes(datos.EST_RES)) {
        return 'El estado de la frecuencia debe ser 1 (activa) o 0 (inactiva).';
    }
    if (!datos.NUM_RES_FRE || datos.NUM_RES_FRE.length > 50) {
        return 'El número de resolución ANT es obligatorio y debe tener máximo 50 caracteres.';
    }
    return null;
}

function extraerParadasIntermedias(filas, origen, destino) {
    if (!Array.isArray(filas) || filas.length === 0) return [];
    const ori = codigo(origen);
    const des = codigo(destino);
    const ordenadas = [...filas].sort((a, b) => Number(a.ORDEN) - Number(b.ORDEN));
    const intermedias = ordenadas.filter((fila, idx) => {
        const nom = codigo(fila.NOMBRE);
        if (idx === 0 && Number(fila.ORDEN) === 0 && nom === ori) return false;
        if (idx === ordenadas.length - 1 && nom === des && ordenadas.length >= 2) return false;
        return nom !== ori && nom !== des;
    });
    return intermedias.map((fila, idx) => ({
        ORDEN: idx + 1,
        NOMBRE: codigo(fila.NOMBRE),
        COMERCIAL: !(fila.COMERCIAL === false || fila.COMERCIAL === 0 || fila.COMERCIAL === '0')
    }));
}

async function adjuntarParadasAFrecuencias(gestor, frecuencias, cooperativa, esquema) {
    if (!Array.isArray(frecuencias) || frecuencias.length === 0) return [];
    let porFrecuencia = new Map();
    if (esquema?.TABLA_FRE_PARADAS) {
        try {
            const req = new sql.Request(gestor);
            let resParadas;
            if (cooperativa) {
                resParadas = await req
                    .input('cooperativa', sql.VarChar(5), cooperativa)
                    .query(`
                        SELECT FP.ID_FRE, FP.ORDEN, FP.NOMBRE, FP.COMERCIAL
                        FROM dbo.FRECUENCIA_PARADAS FP
                        INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = FP.ID_FRE
                        WHERE F.ID_COP_PER = @cooperativa
                        ORDER BY FP.ID_FRE, FP.ORDEN
                    `);
            } else {
                resParadas = await req
                    .input('idFre', sql.VarChar(5), frecuencias[0].ID_FRE)
                    .query(`
                        SELECT ID_FRE, ORDEN, NOMBRE, COMERCIAL
                        FROM dbo.FRECUENCIA_PARADAS
                        WHERE ID_FRE = @idFre
                        ORDER BY ORDEN
                    `);
            }
            for (const row of resParadas.recordset || []) {
                if (!porFrecuencia.has(row.ID_FRE)) porFrecuencia.set(row.ID_FRE, []);
                porFrecuencia.get(row.ID_FRE).push(row);
            }
        } catch {
            porFrecuencia = new Map();
        }
    }

    return frecuencias.map((f) => {
        const filas = porFrecuencia.get(f.ID_FRE) || [];
        const intermedias = extraerParadasIntermedias(filas, f.CIU_ORI_FRE, f.CIU_DES_FRE);
        const esDirecta = intermedias.length > 0
            ? false
            : (f.ES_DIRECTA === undefined || f.ES_DIRECTA === null ? true : Boolean(f.ES_DIRECTA));
        return {
            ...f,
            ES_DIRECTA: esDirecta,
            PARADAS: intermedias,
            TOTAL_PARADAS: intermedias.length
        };
    });
}

async function sincronizarParadasFrecuencia(gestor, idFrecuencia, origen, destino, paradas, esquema) {
    if (!esquema?.TABLA_FRE_PARADAS) return;
    await new sql.Request(gestor)
        .input('id', sql.VarChar(5), idFrecuencia)
        .query('DELETE FROM dbo.FRECUENCIA_PARADAS WHERE ID_FRE = @id');

    if (!Array.isArray(paradas) || paradas.length === 0) return;

    const secuencia = [
        { ORDEN: 0, NOMBRE: codigo(origen).slice(0, 20), COMERCIAL: true },
        ...paradas.map((p, idx) => ({
            ORDEN: idx + 1,
            NOMBRE: codigo(p.NOMBRE).slice(0, 20),
            COMERCIAL: p.COMERCIAL !== false
        })),
        { ORDEN: paradas.length + 1, NOMBRE: codigo(destino).slice(0, 20), COMERCIAL: true }
    ];

    for (const item of secuencia) {
        await new sql.Request(gestor)
            .input('idFre', sql.VarChar(5), idFrecuencia)
            .input('orden', sql.Int, item.ORDEN)
            .input('nombre', sql.VarChar(20), item.NOMBRE)
            .input('comercial', sql.Bit, item.COMERCIAL ? 1 : 0)
            .query(`
                INSERT INTO dbo.FRECUENCIA_PARADAS (ID_FRE, ORDEN, NOMBRE, COMERCIAL)
                VALUES (@idFre, @orden, @nombre, @comercial)
            `);
    }
}

function catalogoTerritorial(req, res) {
    return res.status(410).json({
        success: false,
        code: 'CONTROL_CUPOS_ELIMINADO',
        message: 'El catálogo restringido de CC-01 fue reemplazado por el selector nacional de provincias y cantones.'
    });
}

function disponibilidadFrecuencia(req, res) {
    return res.status(410).json({
        success: false,
        code: 'CONTROL_CUPOS_ELIMINADO',
        message: 'Los cupos diarios de frecuencias fueron eliminados en RFC-000078.'
    });
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
        const esquema = await columnasEsquemaExtendidas(pool);
        const resultado = await pool.request()
            .input('cooperativa', sql.VarChar(5), cooperativa)
            .input('origen', sql.VarChar(15), origen || null)
            .input('destino', sql.VarChar(15), destino || null)
            .input('estado', sql.Char(1), estado)
            .query(`
                SELECT F.ID_FRE, F.CIU_ORI_FRE, F.CIU_DES_FRE, F.FEC_HOR_INI_FRE,
                       F.FEC_HOR_FIN_FRE, F.EST_RES, F.ID_COP_PER, F.NUM_RES_FRE,
                       ${esquema.FRE_HORA_TARIFA ? 'F.HORA_SAL_FRE, F.TAR_BAS_FRE,' : ''}
                       ${esquema.FRE_LLEGADA_PARADAS ? 'F.HORA_LLE_FRE, F.ES_DIRECTA,' : ''}
                       ${categories.enabled() ? 'F.ID_CAT_OP,CAT.NOM_CAT,' : ''}
                       CASE
                           WHEN ISNULL(F.EST_RES, '0') <> '1' THEN 'INACTIVA'
                           WHEN F.FEC_HOR_INI_FRE > ${cc.today} THEN 'PENDIENTE'
                           WHEN F.FEC_HOR_FIN_FRE IS NOT NULL AND F.FEC_HOR_FIN_FRE < ${cc.today} THEN 'VENCIDA'
                           ELSE 'VIGENTE'
                       END AS EST_VIGENCIA,
                       DATEDIFF(DAY, F.FEC_HOR_INI_FRE, ISNULL(F.FEC_HOR_FIN_FRE, F.FEC_HOR_INI_FRE)) + 1 AS DIAS_VIGENCIA,
                       (SELECT COUNT(*) FROM dbo.HOJAS_RUTAS H WHERE H.ID_FRE_PER = F.ID_FRE) AS TOTAL_HOJAS
                FROM dbo.FRECUENCIAS F
                ${categories.enabled() ? 'LEFT JOIN dbo.CATEGORIAS_OPERATIVAS CAT ON CAT.ID_CAT=F.ID_CAT_OP' : ''}
                WHERE F.ID_COP_PER = @cooperativa
                  AND (@origen IS NULL OR F.CIU_ORI_FRE = @origen)
                  AND (@destino IS NULL OR F.CIU_DES_FRE = @destino)
                  AND (@estado IS NULL OR F.EST_RES = @estado)
                ORDER BY F.CIU_ORI_FRE, F.CIU_DES_FRE, F.FEC_HOR_INI_FRE
            `);

        const frecuencias = await adjuntarParadasAFrecuencias(pool, resultado.recordset, cooperativa, esquema);
        return res.status(200).json({ success: true, total: frecuencias.length, frecuencias });
    } catch (error) {
        return manejarError(res, 'listado de frecuencias', error);
    }
}

async function guardarFrecuencia(req, res, editar) {
    const id = editar ? codigo(req.params.id) : null;
    if (editar && !CODIGO_RE.test(id)) return res.status(400).json({ success: false, message: 'Código de frecuencia inválido.' });
    const datos = normalizarFrecuencia(req.body, id);
    const empresa = cooperativaSolicitada(req);
    if (!empresa) return res.status(403).json({ success: false, message: 'Cooperativa no disponible.' });
    const problema = validarFrecuencia(datos);
    if (problema) return res.status(400).json({ success: false, code: 'FRECUENCIA_INVALIDA', message: problema });

    try {
        const db = await conectarBD();
        if (editar) {
            const actual = (await db.request().input('id', sql.VarChar(5), id).input('empresa', sql.VarChar(5), empresa).query(`
                SELECT ID_FRE FROM dbo.FRECUENCIAS WHERE ID_FRE=@id AND ID_COP_PER=@empresa`)).recordset[0];
            if (!actual) return res.status(404).json({ success: false, code: 'FRECUENCIA_NO_ENCONTRADA', message: 'Frecuencia no encontrada.' });
        }
        const identificador = datos.ID_FRE || await siguienteCodigo(db.request(), 'FRECUENCIAS', 'ID_FRE', 'F');
        const esquema = await columnasEsquemaExtendidas(db);
        const conHora = Boolean(esquema.FRE_HORA_TARIFA);
        const conLlegadaParadas = Boolean(esquema.FRE_LLEGADA_PARADAS);
        const solicitud = db.request()
            .input('id', sql.VarChar(5), identificador)
            .input('origen', sql.VarChar(15), datos.CIU_ORI_FRE)
            .input('destino', sql.VarChar(15), datos.CIU_DES_FRE)
            .input('inicio', sql.Date, datos.FEC_HOR_INI_FRE)
            .input('fin', sql.Date, datos.FEC_HOR_FIN_FRE)
            .input('estado', sql.Char(1), datos.EST_RES)
            .input('empresa', sql.VarChar(5), empresa)
            .input('numRes', sql.NVarChar(50), datos.NUM_RES_FRE);
        if (conHora) {
            solicitud
                .input('hora', sql.VarChar(5), datos.HORA_SAL_FRE || '08:00')
                .input('tarifa', sql.Decimal(10, 2), datos.TAR_BAS_FRE ?? 5.00);
        }
        if (conLlegadaParadas) {
            solicitud
                .input('horaLlegada', sql.VarChar(5), datos.HORA_LLE_FRE || null)
                .input('esDirecta', sql.Bit, datos.ES_DIRECTA ? 1 : 0);
        }
        const resultado = await solicitud
            .query(`
                DECLARE @cambios TABLE (ID_FRE varchar(5));
                ${editar ? `
                    UPDATE dbo.FRECUENCIAS
                    SET CIU_ORI_FRE=@origen, CIU_DES_FRE=@destino,
                        FEC_HOR_INI_FRE=@inicio, FEC_HOR_FIN_FRE=@fin,
                        EST_RES=@estado, NUM_RES_FRE=@numRes
                        ${conHora ? ', HORA_SAL_FRE=@hora, TAR_BAS_FRE=@tarifa' : ''}
                        ${conLlegadaParadas ? ', HORA_LLE_FRE=@horaLlegada, ES_DIRECTA=@esDirecta' : ''}
                    OUTPUT INSERTED.ID_FRE INTO @cambios
                    WHERE ID_FRE=@id AND ID_COP_PER=@empresa;
                ` : `
                    INSERT dbo.FRECUENCIAS (ID_FRE, CIU_ORI_FRE, CIU_DES_FRE, FEC_HOR_INI_FRE, FEC_HOR_FIN_FRE, EST_RES, ID_COP_PER, NUM_RES_FRE${conHora ? ', HORA_SAL_FRE, TAR_BAS_FRE' : ''}${conLlegadaParadas ? ', HORA_LLE_FRE, ES_DIRECTA' : ''})
                    OUTPUT INSERTED.ID_FRE INTO @cambios
                    VALUES (@id, @origen, @destino, @inicio, @fin, @estado, @empresa, @numRes${conHora ? ', @hora, @tarifa' : ''}${conLlegadaParadas ? ', @horaLlegada, @esDirecta' : ''});
                `}
                SELECT f.* FROM dbo.FRECUENCIAS f JOIN @cambios a ON a.ID_FRE=f.ID_FRE;
            `);

        if (!editar || datos.ACTUALIZAR_PARADAS) {
            await sincronizarParadasFrecuencia(db, identificador, datos.CIU_ORI_FRE, datos.CIU_DES_FRE, datos.ES_DIRECTA ? [] : datos.PARADAS, esquema);
        }

        const [frecuenciaEnriquecida] = await adjuntarParadasAFrecuencias(db, resultado.recordset, null, esquema);
        return res.status(editar ? 200 : 201).json({
            success: true,
            message: editar ? 'Frecuencia actualizada correctamente.' : 'Frecuencia registrada correctamente.',
            frecuencia: frecuenciaEnriquecida || resultado.recordset[0]
        });
    } catch (error) {
        return manejarError(res, 'guardado de frecuencia', error);
    }
}

const crearFrecuencia = (req, res) => guardarFrecuencia(req, res, false);
const actualizarFrecuencia = (req, res) => guardarFrecuencia(req, res, true);

async function obtenerParadasFrecuencia(req, res) {
    const id = codigo(req.params.id);
    const empresa = cooperativaSolicitada(req);
    if (!CODIGO_RE.test(id)) {
        return res.status(400).json({ success: false, message: 'Código de frecuencia inválido.' });
    }
    try {
        const pool = await conectarBD();
        const esquema = await columnasEsquemaExtendidas(pool);
        const frec = await pool.request()
            .input('id', sql.VarChar(5), id)
            .input('empresa', sql.VarChar(5), empresa)
            .query(`
                SELECT ID_FRE, CIU_ORI_FRE, CIU_DES_FRE
                       ${esquema.FRE_LLEGADA_PARADAS ? ', HORA_LLE_FRE, ES_DIRECTA' : ''}
                FROM dbo.FRECUENCIAS
                WHERE ID_FRE = @id AND (@empresa IS NULL OR ID_COP_PER = @empresa)
            `);
        if (!frec.recordset[0]) {
            return res.status(404).json({ success: false, message: 'Frecuencia no encontrada.' });
        }
        const [detalle] = await adjuntarParadasAFrecuencias(pool, frec.recordset, null, esquema);
        return res.status(200).json({
            success: true,
            idFrecuencia: detalle.ID_FRE,
            esDirecta: detalle.ES_DIRECTA,
            paradas: detalle.PARADAS
        });
    } catch (error) {
        return manejarError(res, 'consulta de paradas de frecuencia', error);
    }
}

async function actualizarParadasFrecuencia(req, res) {
    const id = codigo(req.params.id);
    const empresa = cooperativaSolicitada(req);
    if (!CODIGO_RE.test(id)) {
        return res.status(400).json({ success: false, message: 'Código de frecuencia inválido.' });
    }
    if (!empresa) {
        return res.status(403).json({ success: false, message: 'Cooperativa no disponible.' });
    }
    try {
        const pool = await conectarBD();
        const esquema = await columnasEsquemaExtendidas(pool);
        const frec = await pool.request()
            .input('id', sql.VarChar(5), id)
            .input('empresa', sql.VarChar(5), empresa)
            .query('SELECT ID_FRE, CIU_ORI_FRE, CIU_DES_FRE FROM dbo.FRECUENCIAS WHERE ID_FRE = @id AND ID_COP_PER = @empresa');
        const actual = frec.recordset[0];
        if (!actual) {
            return res.status(404).json({ success: false, message: 'Frecuencia no encontrada.' });
        }
        const paradas = normalizarParadasIntermedias(req.body?.PARADAS ?? req.body?.paradas) || [];
        const rawDirecta = req.body?.ES_DIRECTA ?? req.body?.esDirecta;
        const esDirecta = rawDirecta !== undefined
            ? (String(rawDirecta).trim().toUpperCase() === '1' || String(rawDirecta).trim().toUpperCase() === 'TRUE')
            : paradas.length === 0;
        const listaFinal = esDirecta ? [] : paradas;

        if (!esDirecta && listaFinal.length === 0) {
            return res.status(400).json({ success: false, message: 'Debes agregar al menos una parada intermedia o marcar la frecuencia como Directo.' });
        }
        for (const p of listaFinal) {
            if (!p.NOMBRE || p.NOMBRE.length > 20) {
                return res.status(400).json({ success: false, message: 'Cada parada intermedia debe tener máximo 20 caracteres.' });
            }
            if (p.NOMBRE === actual.CIU_ORI_FRE || p.NOMBRE === actual.CIU_DES_FRE) {
                return res.status(400).json({ success: false, message: 'Las paradas intermedias no pueden repetir origen ni destino.' });
            }
        }
        if (new Set(listaFinal.map((p) => p.NOMBRE)).size !== listaFinal.length) {
            return res.status(400).json({ success: false, message: 'No se permiten paradas intermedias duplicadas.' });
        }

        if (esquema.FRE_LLEGADA_PARADAS) {
            await pool.request()
                .input('id', sql.VarChar(5), id)
                .input('esDirecta', sql.Bit, esDirecta ? 1 : 0)
                .query('UPDATE dbo.FRECUENCIAS SET ES_DIRECTA = @esDirecta WHERE ID_FRE = @id');
        }
        await sincronizarParadasFrecuencia(pool, id, actual.CIU_ORI_FRE, actual.CIU_DES_FRE, listaFinal, esquema);
        const [detalle] = await adjuntarParadasAFrecuencias(pool, [actual], null, esquema);
        return res.status(200).json({
            success: true,
            message: 'Paradas de la frecuencia actualizadas correctamente.',
            esDirecta: detalle.ES_DIRECTA,
            paradas: detalle.PARADAS
        });
    } catch (error) {
        return manejarError(res, 'actualización de paradas de frecuencia', error);
    }
}

async function cambiarEstadoFrecuencia(req, res) {
    const id = codigo(req.params.id);
    const estado = String(req.body?.EST_RES ?? req.body?.estado);

    if (!CODIGO_RE.test(id) || !ESTADOS_FRECUENCIA.includes(estado)) {
        return res.status(400).json({ success: false, message: 'Código o estado de frecuencia inválido. Usa 1 o 0.' });
    }

    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('id', sql.VarChar(5), id)
            .input('estado', sql.Char(1), estado)
            .query(`
                DECLARE @cambios TABLE (ID_FRE varchar(5));
                UPDATE dbo.FRECUENCIAS
                SET EST_RES = @estado
                OUTPUT INSERTED.ID_FRE INTO @cambios
                WHERE ID_FRE = @id;
                SELECT f.* FROM dbo.FRECUENCIAS f JOIN @cambios a ON a.ID_FRE=f.ID_FRE;
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

async function contarHojasDeFrecuencia(pool, idFrecuencia) {
    const resultado = await pool.request()
        .input('id', sql.VarChar(5), idFrecuencia)
        .query('SELECT COUNT(*) AS total FROM dbo.HOJAS_RUTAS WHERE ID_FRE_PER = @id');
    return resultado.recordset[0].total;
}

async function eliminarFrecuencia(req, res) {
    const id = codigo(req.params.id);
    if (!CODIGO_RE.test(id)) {
        return res.status(400).json({ success: false, message: 'Código de frecuencia inválido.' });
    }

    try {
        const pool = await conectarBD();
        const usadas = await contarHojasDeFrecuencia(pool, id);

        if (usadas > 0) {
            return res.status(409).json({
                success: false,
                message: 'No se puede eliminar la frecuencia porque tiene hojas de ruta asociadas.'
            });
        }

        const esquema = await columnasEsquemaExtendidas(pool);
        if (esquema.TABLA_FRE_PARADAS) {
            await pool.request()
                .input('id', sql.VarChar(5), id)
                .query('DELETE FROM dbo.FRECUENCIA_PARADAS WHERE ID_FRE = @id');
        }

        const resultado = await pool.request()
            .input('id', sql.VarChar(5), id)
            .query('DELETE FROM dbo.FRECUENCIAS OUTPUT DELETED.ID_FRE WHERE ID_FRE = @id');

        if (resultado.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Frecuencia no encontrada.' });
        }

        return res.status(200).json({
            success: true,
            message: 'Frecuencia eliminada correctamente.'
        });
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
        return 'El estado del viaje debe ser PROGRAMADA, EN CURSO, FINALIZADA o CANCELADA.';
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
        const cols = await pool.request().query(`
            SELECT CASE WHEN COL_LENGTH('dbo.HOJAS_RUTAS', 'SALIDA_PLAN_UTC') IS NOT NULL
                         AND COL_LENGTH('dbo.HOJAS_RUTAS', 'ID_USU_CHO') IS NOT NULL
                        THEN 1 ELSE 0 END AS tieneHorario
        `);
        const tieneHorario = Number(cols.recordset?.[0]?.tieneHorario) === 1;
        const camposHorario = tieneHorario
            ? 'H.SALIDA_PLAN_UTC, H.LLEGADA_PLAN_UTC, H.ID_USU_CHO, CHO.NOM_USU AS NOM_CHOFER, CHO.APE_USU AS APE_CHOFER,'
            : 'CAST(NULL AS DATETIME2) AS SALIDA_PLAN_UTC, CAST(NULL AS DATETIME2) AS LLEGADA_PLAN_UTC, CAST(NULL AS VARCHAR(10)) AS ID_USU_CHO, CAST(NULL AS VARCHAR(40)) AS NOM_CHOFER, CAST(NULL AS VARCHAR(40)) AS APE_CHOFER,';
        const joinChofer = tieneHorario
            ? 'LEFT JOIN dbo.USUARIOS CHO ON CHO.ID_USU = H.ID_USU_CHO'
            : '';
        const resultado = await pool.request()
            .input('cooperativa', sql.VarChar(5), cooperativa)
            .input('fecha', sql.Date, fechaFiltro)
            .input('estado', sql.VarChar(30), estado)
            .query(`
                SELECT H.ID_HOJ, H.FEC_PRO_HOJ, H.EST_VIA_HOJ, H.OBS_HOJ,
                       H.ID_BUS_PER, H.ID_FRE_PER, H.ID_USU_CON,
                       ${camposHorario}
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
                LEFT JOIN dbo.USUARIOS U ON U.ID_USU = H.ID_USU_CON
                ${joinChofer}
                WHERE F.ID_COP_PER = @cooperativa
                  AND (@fecha IS NULL OR H.FEC_PRO_HOJ = @fecha)
                  AND (@estado IS NULL OR H.EST_VIA_HOJ = @estado)
                ORDER BY H.FEC_PRO_HOJ DESC, H.ID_HOJ DESC, F.CIU_ORI_FRE, F.CIU_DES_FRE
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
        .query('SELECT EST_BUS FROM dbo.BUSES WHERE ID_BUS = @bus AND ID_COP_PER = @cooperativa');

    if (bus.recordset.length === 0) {
        return 'El bus seleccionado no pertenece a tu cooperativa.';
    }
    if (bus.recordset[0].EST_BUS === 'INACTIVO') {
        return 'El bus seleccionado se encuentra inactivo y no puede asignarse a una hoja de ruta.';
    }

    const frecuencia = await pool.request()
        .input('frecuencia', sql.VarChar(5), datos.ID_FRE_PER)
        .input('cooperativa', sql.VarChar(5), cooperativa)
        .query(`
            SELECT F.ID_FRE, F.EST_RES, F.FEC_HOR_INI_FRE, F.FEC_HOR_FIN_FRE
            FROM dbo.FRECUENCIAS F
            WHERE F.ID_FRE = @frecuencia AND F.ID_COP_PER = @cooperativa
        `);

    if (frecuencia.recordset.length === 0) {
        return 'La frecuencia seleccionada no pertenece a tu cooperativa.';
    }
    if (frecuencia.recordset[0].EST_RES !== '1') {
        return 'La frecuencia seleccionada está inactiva.';
    }
    if (datos.FEC_PRO_HOJ < frecuencia.recordset[0].FEC_HOR_INI_FRE) {
        return 'La fecha de programación debe ser mayor o igual a la fecha de inicio de vigencia de la frecuencia.';
    }
    if (frecuencia.recordset[0].FEC_HOR_FIN_FRE && datos.FEC_PRO_HOJ > frecuencia.recordset[0].FEC_HOR_FIN_FRE) {
        return 'La fecha de programación debe be menor o igual a la fecha de fin de vigencia de la frecuencia.';
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
    try {
        const b=req.body||{};
        const result=await require('../services/tripOperations').assign(req.auth,{
            idBus:b.idBus||b.ID_BUS_PER,idFre:b.idFre||b.ID_FRE_PER,idUsuCho:b.idUsuCho||b.ID_USU_CHO,idUsuCon:b.idUsuCon||b.ID_USU_CON,
            salida:b.salida||b.SALIDA_PLAN_UTC,llegada:b.llegada||b.LLEGADA_PLAN_UTC,obs:b.obs??b.OBS_HOJ
        });
        res.status(201).json({success:true,...result,hoja:{ID_HOJ:result.idHoja}});
    }catch(error){return cc.respond(res,error)||(error.status?res.status(error.status).json({success:false,message:error.message}):manejarError(res,'registro de hoja de ruta',error));}
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
        if (cc.enabled() && datos.EST_VIA_HOJ !== 'CANCELADA') {
            const dia = cc.date(req.body?.FEC_PRO_HOJ);
            if (!dia) throw cc.fail(422, 'FECHA_INVALIDA', 'Indica una fecha de programación válida.');
            await cc.scheduled(pool, datos.ID_FRE_PER, dia, dia);
        }
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
                DECLARE @cambios TABLE (ID_HOJ varchar(5));
                UPDATE dbo.HOJAS_RUTAS
                SET FEC_PRO_HOJ = @fecha,
                    EST_VIA_HOJ = @estado,
                    OBS_HOJ = @observacion,
                    ID_BUS_PER = @bus,
                    ID_FRE_PER = @frecuencia,
                    ID_USU_CON = @controlador
                OUTPUT INSERTED.ID_HOJ INTO @cambios
                WHERE ID_HOJ = @id;
                SELECT h.* FROM dbo.HOJAS_RUTAS h JOIN @cambios a ON a.ID_HOJ=h.ID_HOJ;
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
        if (cc.enabled() && estado !== 'CANCELADA') {
            const { recordset } = await pool.request().input('id', sql.VarChar(5), id)
                .query('SELECT ID_HOJ FROM dbo.fn_CC_HojaVigente(@id,NULL)');
            if (!recordset.length) throw cc.fail(409, 'FRECUENCIA_NO_VIGENTE', 'La frecuencia no está habilitada para esta salida.');
        }
        const resultado = await pool.request()
            .input('id', sql.VarChar(5), id)
            .input('estado', sql.VarChar(30), estado)
            .query(`
                DECLARE @cambios TABLE (ID_HOJ varchar(5));
                UPDATE dbo.HOJAS_RUTAS
                SET EST_VIA_HOJ = @estado
                OUTPUT INSERTED.ID_HOJ INTO @cambios
                WHERE ID_HOJ = @id;
                SELECT h.* FROM dbo.HOJAS_RUTAS h JOIN @cambios a ON a.ID_HOJ=h.ID_HOJ;
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
            .query("SELECT COUNT(*) AS total FROM dbo.BOLETOS WHERE ID_HOJ_PER = @id AND EST_BOL IN ('RESERVADO','EMITIDO','PAGADO','USADO')");

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

        return res.status(200).json({
            success: true,
            message: 'Hoja de ruta eliminada correctamente.'
        });
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
        const fechaHoy = hoyISO();

        const datos = await pool.request()
            .input('cooperativa', sql.VarChar(5), cooperativa)
            .input('hoy', sql.Date, fechaHoy)
            .query(`
                SELECT
                    (SELECT COUNT(*) FROM dbo.BUSES WHERE ID_COP_PER = @cooperativa) AS TOTAL_BUSES,
                    (SELECT COUNT(*) FROM dbo.BUSES WHERE ID_COP_PER = @cooperativa AND EST_BUS = 'ACTIVO') AS BUSES_ACTIVOS,
                    (SELECT COUNT(DISTINCT NUM_RES_FRE) FROM dbo.FRECUENCIAS WHERE ID_COP_PER = @cooperativa AND NULLIF(LTRIM(RTRIM(NUM_RES_FRE)), '') IS NOT NULL) AS TOTAL_RESOLUCIONES,
                    (SELECT COUNT(*) FROM dbo.FRECUENCIAS F
                       WHERE F.ID_COP_PER = @cooperativa AND F.EST_RES = '1') AS FRECUENCIAS_ACTIVAS,
                    (SELECT COUNT(*) FROM dbo.HOJAS_RUTAS H
                       INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                       WHERE F.ID_COP_PER = @cooperativa AND H.FEC_PRO_HOJ = @hoy) AS HOJAS_HOY,
                    (SELECT COUNT(*) FROM dbo.BOLETOS B
                       INNER JOIN dbo.HOJAS_RUTAS H ON H.ID_HOJ = B.ID_HOJ_PER
                       INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                       WHERE F.ID_COP_PER = @cooperativa AND B.FEC_COM_BOL = @hoy
                         AND B.EST_BOL IN ('EMITIDO','PAGADO','USADO')) AS BOLETOS_HOY,
                    (SELECT ISNULL(SUM(B.PRE_FIN_BOL), 0) FROM dbo.BOLETOS B
                       INNER JOIN dbo.HOJAS_RUTAS H ON H.ID_HOJ = B.ID_HOJ_PER
                       INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                       WHERE F.ID_COP_PER = @cooperativa AND B.FEC_COM_BOL = @hoy
                         AND B.EST_BOL IN ('EMITIDO','PAGADO','USADO')) AS INGRESOS_HOY,
                    (SELECT COUNT(*) FROM dbo.BOLETOS B
                       INNER JOIN dbo.HOJAS_RUTAS H ON H.ID_HOJ = B.ID_HOJ_PER
                       INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                       WHERE F.ID_COP_PER = @cooperativa AND B.EST_BOL = 'RESERVADO') AS RESERVAS_PENDIENTES
            `);

        const proximas = await pool.request()
            .input('cooperativa', sql.VarChar(5), cooperativa)
            .input('hoy', sql.Date, fechaHoy)
            .query(`
                SELECT TOP (6)
                    H.ID_HOJ, H.FEC_PRO_HOJ, H.EST_VIA_HOJ,
                    B.NUM_BUS, B.PLA_BUS, B.NUM_PIS,
                    F.CIU_ORI_FRE, F.CIU_DES_FRE,
                    (SELECT COUNT(*) FROM dbo.BOLETOS BO
                      WHERE BO.ID_HOJ_PER = H.ID_HOJ
                        AND BO.EST_BOL IN ('RESERVADO','EMITIDO','PAGADO','USADO')) AS BOLETOS_VENDIDOS,
                    (SELECT COUNT(*) FROM dbo.ASIENTOS_BUS A WHERE A.ID_BUS_PER = B.ID_BUS) AS TOTAL_ASIENTOS
                FROM dbo.HOJAS_RUTAS H
                INNER JOIN dbo.BUSES B ON B.ID_BUS = H.ID_BUS_PER
                INNER JOIN dbo.FRECUENCIAS F ON F.ID_FRE = H.ID_FRE_PER
                WHERE F.ID_COP_PER = @cooperativa
                  AND H.FEC_PRO_HOJ >= @hoy
                  AND H.EST_VIA_HOJ IN ('PROGRAMADA','PROGRAMADO','EN CURSO')
                ORDER BY H.FEC_PRO_HOJ, F.CIU_ORI_FRE, H.ID_HOJ
            `);

        const cooperativaInfo = await pool.request()
            .input('cooperativa', sql.VarChar(5), cooperativa)
            .query('SELECT ID_COP, NOM_COP, LOG_URL_COP FROM dbo.COOPERATIVAS WHERE ID_COP = @cooperativa');

        if (cooperativaInfo.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Cooperativa no encontrada.' });
        }

        const resumen = datos.recordset[0];
        const boletosHoy = Number(resumen.BOLETOS_HOY) || 0;
        const ingresosHoy = Number(resumen.INGRESOS_HOY) || 0;
        const hojasHoy = Number(resumen.HOJAS_HOY) || 0;
        const reservasPendientes = Number(resumen.RESERVAS_PENDIENTES) || 0;

        return res.status(200).json({
            success: true,
            cooperativa: cooperativaInfo.recordset[0],
            resumen: {
                ...resumen,
                BOLETOS_HOY: boletosHoy,
                INGRESOS_HOY: ingresosHoy,
                HOJAS_HOY: hojasHoy,
                RESERVAS_PENDIENTES: reservasPendientes,
                PROMEDIO_BOLETO_HOY: boletosHoy > 0 ? Math.round(ingresosHoy / boletosHoy) : 0
            },
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
    guardarPlantillaAsientos,
    subirImagenBus,
    cambiarTipoAsiento,
    listarTiposAsiento,
    listarResoluciones,
    crearResolucion,
    actualizarResolucion,
    eliminarResolucion,
    listarFrecuencias,
    catalogoTerritorial,
    disponibilidadFrecuencia,
    crearFrecuencia,
    actualizarFrecuencia,
    obtenerParadasFrecuencia,
    actualizarParadasFrecuencia,
    cambiarEstadoFrecuencia,
    eliminarFrecuencia,
    listarHojasRuta,
    crearHojaRuta,
    actualizarHojaRuta,
    cambiarEstadoHojaRuta,
    eliminarHojaRuta,
    resumenCooperativa
};
