const { sql, conectarBD } = require('../config/db');

const columnas = `
    U.ID_USU, U.NOM_USU, U.APE_USU, U.COR_USU,
    U.TEL_USU, U.FEC_REG_USU, U.EST_USU,
    U.ID_ROL_PER, U.ID_COP_PER, C.NOM_COP
`;

const texto = (valor) => typeof valor === 'string' ? valor.trim() : '';
const codigo = (valor) => texto(valor).toUpperCase();

// Permitimos todos los roles excepto el Administrador (R001)
const rolesPermitidos = new Set(['R002', 'R003', 'R004', 'R005', 'R006']);

async function obtenerUsuarioGestionable(pool, id) {
    const resultado = await pool.request()
        .input('id', sql.VarChar(10), id)
        .query(`
            SELECT ${columnas}
            FROM dbo.USUARIOS U
            LEFT JOIN dbo.COOPERATIVAS C ON C.ID_COP = U.ID_COP_PER
            WHERE U.ID_USU = @id AND U.ID_ROL_PER IN ('R002', 'R003', 'R004', 'R005', 'R006')
        `);
    return resultado.recordset[0] ?? null;
}

function manejarError(res, error) {
    console.error('Error en gestión de usuarios:', error);
    const numero = error.number ?? error.originalError?.info?.number;
    if ([2601, 2627].includes(numero)) {
        return res.status(409).json({ success: false, message: 'Ya existe un registro con esos datos.' });
    }
    if (numero === 547) {
        return res.status(409).json({ success: false, message: 'No se puede asignar una cooperativa o un rol inexistente.' });
    }
    if (numero === 2628 || numero === 8152) {
        return res.status(500).json({
            success: false,
            message: 'Uno de los valores supera la longitud permitida en la base de datos.'
        });
    }
    return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
}

async function listarUsuarios(req, res) {
    const buscar = texto(req.query.buscar);
    const rol = req.query.rol === undefined ? null : codigo(req.query.rol);
    const estado = req.query.estado === undefined ? null : texto(req.query.estado);

    if (buscar.length > 100 || (rol !== null && !rolesPermitidos.has(rol)) ||
        (estado !== null && !['0', '1'].includes(estado))) {
        return res.status(400).json({ success: false, message: 'Filtros de búsqueda no válidos.' });
    }

    const escapado = buscar.replace(/[!%_\[]/g, (valor) => `!${valor}`);

    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('buscar', sql.VarChar(210), `%${escapado}%`)
            .input('rol', sql.VarChar(5), rol)
            .input('estado', sql.Char(1), estado)
            .query(`
                SELECT ${columnas}
                FROM dbo.USUARIOS U
                LEFT JOIN dbo.COOPERATIVAS C ON C.ID_COP = U.ID_COP_PER
                WHERE U.ID_ROL_PER IN ('R002', 'R003', 'R004', 'R005', 'R006')
                  AND (@rol IS NULL OR U.ID_ROL_PER = @rol)
                  AND (@estado IS NULL OR U.EST_USU = @estado)
                  AND (
                      U.ID_USU LIKE @buscar ESCAPE '!'
                      OR U.NOM_USU LIKE @buscar ESCAPE '!'
                      OR U.APE_USU LIKE @buscar ESCAPE '!'
                      OR U.COR_USU LIKE @buscar ESCAPE '!'
                      OR ISNULL(U.ID_COP_PER, '') LIKE @buscar ESCAPE '!'
                      OR ISNULL(C.NOM_COP, '') LIKE @buscar ESCAPE '!'
                  )
                ORDER BY U.NOM_USU, U.APE_USU, U.ID_USU
            `);

        if (await require('../security/permissions').installed(pool)) {
            const principals = (await pool.request().query('SELECT ID_USU FROM dbo.COOPERATIVA_RESPONSABLES')).recordset;
            for (const row of resultado.recordset) row.PRINCIPAL = principals.some((p) => p.ID_USU === row.ID_USU);
        }
        return res.status(200).json({
            success: true,
            total: resultado.recordset.length,
            usuarios: resultado.recordset
        });
    } catch (error) {
        return manejarError(res, error);
    }
}

async function consultarUsuario(req, res) {
    const id = codigo(req.params.id);
    if (!/^[A-Z0-9]{5,10}$/.test(id)) {
        return res.status(400).json({ success: false, message: 'Identificación inválida.' });
    }

    try {
        const pool = await conectarBD();
        const usuario = await obtenerUsuarioGestionable(pool, id);
        if (!usuario) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
        return res.status(200).json({ success: true, usuario });
    } catch (error) {
        return manejarError(res, error);
    }
}

const accounts = require('./accountController');
module.exports = { listarUsuarios, consultarUsuario, registrarUsuario: accounts.create, editarUsuario: accounts.edit, cambiarEstadoUsuario: accounts.state, desactivarUsuario: accounts.deactivate };
