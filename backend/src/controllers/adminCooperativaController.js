const { sql, conectarBD } = require('../config/db');

const columnas = `
    ID_COP, NOM_COP, RUC_COP, DIR_COP,
    TEL_COP, LOG_URL_COP, EST_COP
`;

const texto = (valor) => typeof valor === 'string' ? valor.trim() : '';
const codigo = (valor) => texto(valor).toUpperCase();

function normalizarCooperativa(body, id = null) {
    const datos = body && typeof body === 'object' && !Array.isArray(body) ? body : {};

    return {
        ID_COP: id === null ? codigo(datos.ID_COP) : codigo(id),
        NOM_COP: texto(datos.NOM_COP),
        RUC_COP: texto(datos.RUC_COP),
        DIR_COP: texto(datos.DIR_COP),
        TEL_COP: texto(datos.TEL_COP),
        LOG_URL_COP: texto(datos.LOG_URL_COP),
        EST_COP: datos.EST_COP === undefined ? '1' : texto(datos.EST_COP)
    };
}

function validarCooperativa(datos) {
    if (!/^[A-Z0-9_-]{1,5}$/.test(datos.ID_COP)) {
        return 'El código debe tener entre 1 y 5 caracteres, usando letras, números, guion o guion bajo.';
    }

    if (!datos.NOM_COP || datos.NOM_COP.length > 20) {
        return 'El nombre es obligatorio y debe tener máximo 20 caracteres.';
    }

    if (!/^\d{13}$/.test(datos.RUC_COP)) {
        return 'El RUC debe contener exactamente 13 dígitos.';
    }

    if (!datos.DIR_COP || datos.DIR_COP.length > 20) {
        return 'La dirección es obligatoria y debe tener máximo 20 caracteres.';
    }

    if (!/^\d{7,10}$/.test(datos.TEL_COP)) {
        return 'El teléfono debe contener entre 7 y 10 dígitos.';
    }

    if (!datos.LOG_URL_COP || datos.LOG_URL_COP.length > 500) {
        return 'La URL del logotipo es obligatoria y debe tener máximo 500 caracteres.';
    }

    try {
        const url = new URL(datos.LOG_URL_COP);
        if (!['http:', 'https:'].includes(url.protocol)) {
            return 'La URL del logotipo debe comenzar con http:// o https://.';
        }
    } catch {
        return 'Ingresa una URL válida para el logotipo.';
    }

    if (!['0', '1'].includes(datos.EST_COP)) {
        return 'El estado debe ser 1 (activa) o 0 (inactiva).';
    }

    return null;
}

function entradasCooperativa(request, datos) {
    return request
        .input('id', sql.VarChar(5), datos.ID_COP)
        .input('nombre', sql.VarChar(20), datos.NOM_COP)
        .input('ruc', sql.VarChar(13), datos.RUC_COP)
        .input('direccion', sql.VarChar(20), datos.DIR_COP)
        .input('telefono', sql.VarChar(10), datos.TEL_COP)
        .input('logo', sql.VarChar(500), datos.LOG_URL_COP)
        .input('estado', sql.Char(1), datos.EST_COP);
}

async function buscarDuplicado(pool, datos, idActual = null) {
    const resultado = await pool.request()
        .input('id', sql.VarChar(5), datos.ID_COP)
        .input('ruc', sql.VarChar(13), datos.RUC_COP)
        .input('idActual', sql.VarChar(5), idActual)
        .query(`
            SELECT TOP (1) ID_COP, RUC_COP
            FROM dbo.COOPERATIVAS
            WHERE (ID_COP = @id OR RUC_COP = @ruc)
              AND (@idActual IS NULL OR ID_COP <> @idActual)
        `);

    const encontrado = resultado.recordset[0];
    if (!encontrado) return null;

    return encontrado.ID_COP === datos.ID_COP
        ? 'Ya existe una cooperativa con ese código.'
        : 'Ya existe una cooperativa con ese RUC.';
}

function manejarError(res, error) {
    console.error('Error en gestión de cooperativas:', error);
    const numero = error.number ?? error.originalError?.info?.number;

    if (numero === 2627 || numero === 2601) {
        return res.status(409).json({ success: false, message: 'Ya existe un registro con esos datos.' });
    }

    return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
}

async function listarCooperativas(req, res) {
    const buscar = texto(req.query.buscar);
    const estado = req.query.estado === undefined ? null : texto(req.query.estado);

    if (buscar.length > 100 || (estado !== null && !['0', '1'].includes(estado))) {
        return res.status(400).json({ success: false, message: 'Filtros de búsqueda no válidos.' });
    }

    const escapado = buscar.replace(/[!%_\[]/g, (valor) => `!${valor}`);

    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('buscar', sql.VarChar(210), `%${escapado}%`)
            .input('estado', sql.Char(1), estado)
            .query(`
                SELECT ${columnas}
                FROM dbo.COOPERATIVAS
                WHERE (@estado IS NULL OR EST_COP = @estado)
                  AND (
                      ID_COP LIKE @buscar ESCAPE '!'
                      OR NOM_COP LIKE @buscar ESCAPE '!'
                      OR RUC_COP LIKE @buscar ESCAPE '!'
                  )
                ORDER BY NOM_COP, ID_COP
            `);

        return res.status(200).json({
            success: true,
            total: resultado.recordset.length,
            cooperativas: resultado.recordset
        });
    } catch (error) {
        return manejarError(res, error);
    }
}

async function obtenerCooperativa(req, res) {
    const id = codigo(req.params.id);
    if (!/^[A-Z0-9_-]{1,5}$/.test(id)) {
        return res.status(400).json({ success: false, message: 'Código de cooperativa inválido.' });
    }

    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('id', sql.VarChar(5), id)
            .query(`SELECT ${columnas} FROM dbo.COOPERATIVAS WHERE ID_COP = @id`);

        if (resultado.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Cooperativa no encontrada.' });
        }

        return res.status(200).json({ success: true, cooperativa: resultado.recordset[0] });
    } catch (error) {
        return manejarError(res, error);
    }
}

async function crearCooperativa(req, res) {
    const datos = normalizarCooperativa(req.body);
    const problema = validarCooperativa(datos);
    if (problema) return res.status(400).json({ success: false, message: problema });

    try {
        const pool = await conectarBD();
        const duplicado = await buscarDuplicado(pool, datos);
        if (duplicado) return res.status(409).json({ success: false, message: duplicado });

        const resultado = await entradasCooperativa(pool.request(), datos).query(`
            INSERT INTO dbo.COOPERATIVAS
                (ID_COP, NOM_COP, RUC_COP, DIR_COP, TEL_COP, LOG_URL_COP, EST_COP)
            OUTPUT INSERTED.ID_COP, INSERTED.NOM_COP, INSERTED.RUC_COP,
                   INSERTED.DIR_COP, INSERTED.TEL_COP, INSERTED.LOG_URL_COP, INSERTED.EST_COP
            VALUES (@id, @nombre, @ruc, @direccion, @telefono, @logo, @estado)
        `);

        return res.status(201).json({
            success: true,
            message: 'Cooperativa registrada correctamente.',
            cooperativa: resultado.recordset[0]
        });
    } catch (error) {
        return manejarError(res, error);
    }
}

async function actualizarCooperativa(req, res) {
    const id = codigo(req.params.id);
    const idEnviada = req.body?.ID_COP;

    if (idEnviada !== undefined && codigo(idEnviada) !== id) {
        return res.status(400).json({ success: false, message: 'No se puede modificar el código de una cooperativa.' });
    }

    const datos = normalizarCooperativa(req.body, id);
    const problema = validarCooperativa(datos);
    if (problema) return res.status(400).json({ success: false, message: problema });

    try {
        const pool = await conectarBD();
        const duplicado = await buscarDuplicado(pool, datos, id);
        if (duplicado) return res.status(409).json({ success: false, message: duplicado });

        const resultado = await entradasCooperativa(pool.request(), datos).query(`
            UPDATE dbo.COOPERATIVAS
            SET NOM_COP = @nombre,
                RUC_COP = @ruc,
                DIR_COP = @direccion,
                TEL_COP = @telefono,
                LOG_URL_COP = @logo,
                EST_COP = @estado
            OUTPUT INSERTED.ID_COP, INSERTED.NOM_COP, INSERTED.RUC_COP,
                   INSERTED.DIR_COP, INSERTED.TEL_COP, INSERTED.LOG_URL_COP, INSERTED.EST_COP
            WHERE ID_COP = @id
        `);

        if (resultado.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Cooperativa no encontrada.' });
        }

        return res.status(200).json({
            success: true,
            message: 'Cooperativa actualizada correctamente.',
            cooperativa: resultado.recordset[0]
        });
    } catch (error) {
        return manejarError(res, error);
    }
}

async function cambiarEstadoCooperativa(req, res) {
    const id = codigo(req.params.id);
    const nuevoEstado = req.body?.EST_COP ?? req.body?.estado;

    if (!/^[A-Z0-9_-]{1,5}$/.test(id) || !['0', '1'].includes(nuevoEstado)) {
        return res.status(400).json({ success: false, message: 'Código o estado inválido.' });
    }

    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('id', sql.VarChar(5), id)
            .input('estado', sql.Char(1), nuevoEstado)
            .query(`
                UPDATE dbo.COOPERATIVAS
                SET EST_COP = @estado
                OUTPUT INSERTED.ID_COP, INSERTED.NOM_COP, INSERTED.RUC_COP,
                       INSERTED.DIR_COP, INSERTED.TEL_COP, INSERTED.LOG_URL_COP, INSERTED.EST_COP
                WHERE ID_COP = @id
            `);

        if (resultado.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'Cooperativa no encontrada.' });
        }

        return res.status(200).json({
            success: true,
            message: nuevoEstado === '1' ? 'Cooperativa activada.' : 'Cooperativa desactivada.',
            cooperativa: resultado.recordset[0]
        });
    } catch (error) {
        return manejarError(res, error);
    }
}

async function desactivarCooperativa(req, res) {
    req.body = { EST_COP: '0' };
    return cambiarEstadoCooperativa(req, res);
}

module.exports = {
    listarCooperativas,
    obtenerCooperativa,
    crearCooperativa,
    actualizarCooperativa,
    cambiarEstadoCooperativa,
    desactivarCooperativa
};
