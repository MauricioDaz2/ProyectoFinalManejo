const bcrypt = require('bcrypt');
const { sql, conectarBD } = require('../config/db');

const columnas = `
    U.ID_USU, U.NOM_USU, U.APE_USU, U.COR_USU,
    U.TEL_USU, U.FEC_REG_USU, U.EST_USU,
    U.ID_ROL_PER, U.ID_COP_PER, C.NOM_COP
`;

const texto = (valor) => typeof valor === 'string' ? valor.trim() : '';
const codigo = (valor) => texto(valor).toUpperCase();
const rolesPermitidos = new Set(['R003', 'R004']);

function datosUsuario(body, id = null) {
    const datos = body && typeof body === 'object' && !Array.isArray(body) ? body : {};

    return {
        ID_USU: id === null ? codigo(datos.ID_USU) : codigo(id),
        NOM_USU: texto(datos.NOM_USU),
        APE_USU: texto(datos.APE_USU),
        COR_USU: texto(datos.COR_USU).toLowerCase(),
        TEL_USU: texto(datos.TEL_USU),
        EST_USU: datos.EST_USU === undefined ? '1' : texto(datos.EST_USU),
        ID_ROL_PER: codigo(datos.ID_ROL_PER),
        ID_COP_PER: codigo(datos.ID_COP_PER),
        password: datos.password
    };
}

function validarUsuario(datos, creando = false) {
    if (!/^[A-Z0-9]{5,10}$/.test(datos.ID_USU)) {
        return 'La identificación debe tener entre 5 y 10 caracteres alfanuméricos.';
    }
    if (!datos.NOM_USU || datos.NOM_USU.length > 15) {
        return 'Los nombres son obligatorios y deben tener máximo 15 caracteres.';
    }
    if (!datos.APE_USU || datos.APE_USU.length > 15) {
        return 'Los apellidos son obligatorios y deben tener máximo 15 caracteres.';
    }
    if (datos.COR_USU.length > 40 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.COR_USU)) {
        return 'Ingresa un correo electrónico válido de máximo 40 caracteres.';
    }
    if (!/^\d{7,10}$/.test(datos.TEL_USU)) {
        return 'El teléfono debe contener entre 7 y 10 dígitos.';
    }
    if (!rolesPermitidos.has(datos.ID_ROL_PER)) {
        return 'Solo pueden gestionarse oficinistas (R003) y controladores (R004).';
    }
    if (!/^[A-Z0-9]{1,5}$/.test(datos.ID_COP_PER)) {
        return 'El código de cooperativa debe contener entre 1 y 5 letras o números.';
    }
    if (!['0', '1'].includes(datos.EST_USU)) {
        return 'El estado debe ser 1 (activo) o 0 (inactivo).';
    }
    if (creando && (typeof datos.password !== 'string' ||
        datos.password.length < 8 || Buffer.byteLength(datos.password, 'utf8') > 72)) {
        return 'La contraseña debe tener al menos 8 caracteres y no superar 72 bytes.';
    }
    return null;
}

function entradasUsuario(request, datos) {
    return request
        .input('id', sql.VarChar(10), datos.ID_USU)
        .input('nombre', sql.VarChar(15), datos.NOM_USU)
        .input('apellido', sql.VarChar(15), datos.APE_USU)
        .input('correo', sql.VarChar(40), datos.COR_USU)
        .input('telefono', sql.VarChar(20), datos.TEL_USU)
        .input('estado', sql.Char(1), datos.EST_USU)
        .input('rol', sql.VarChar(5), datos.ID_ROL_PER)
        .input('cooperativa', sql.VarChar(5), datos.ID_COP_PER);
}

async function obtenerOperativo(pool, id) {
    const resultado = await pool.request()
        .input('id', sql.VarChar(10), id)
        .query(`
            SELECT ${columnas}
            FROM dbo.USUARIOS U
            LEFT JOIN dbo.COOPERATIVAS C ON C.ID_COP = U.ID_COP_PER
            WHERE U.ID_USU = @id AND U.ID_ROL_PER IN ('R003', 'R004')
        `);
    return resultado.recordset[0] ?? null;
}

async function validarCooperativa(pool, id, exigirActiva) {
    const resultado = await pool.request()
        .input('id', sql.VarChar(5), id)
        .query('SELECT EST_COP FROM dbo.COOPERATIVAS WHERE ID_COP = @id');
    const cooperativa = resultado.recordset[0];
    if (!cooperativa) return 'La cooperativa seleccionada no existe.';
    if (exigirActiva && cooperativa.EST_COP !== '1') {
        return 'No se puede asignar personal a una cooperativa inactiva.';
    }
    return null;
}

async function validarDuplicado(pool, datos, idActual = null) {
    const resultado = await pool.request()
        .input('id', sql.VarChar(10), datos.ID_USU)
        .input('correo', sql.VarChar(40), datos.COR_USU)
        .input('idActual', sql.VarChar(10), idActual)
        .query(`
            SELECT TOP (1) ID_USU, COR_USU
            FROM dbo.USUARIOS
            WHERE (ID_USU = @id OR LOWER(COR_USU) = LOWER(@correo))
              AND (@idActual IS NULL OR ID_USU <> @idActual)
        `);

    const usuario = resultado.recordset[0];
    if (!usuario) return null;
    return usuario.ID_USU === datos.ID_USU
        ? 'Ya existe un usuario con esa identificación.'
        : 'Ya existe un usuario con ese correo electrónico.';
}

function manejarError(res, error) {
    console.error('Error en gestión de personal operativo:', error);
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
            message: 'El esquema de USUARIOS debe actualizarse para almacenar contraseñas protegidas.'
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
                WHERE U.ID_ROL_PER IN ('R003', 'R004')
                  AND (@rol IS NULL OR U.ID_ROL_PER = @rol)
                  AND (@estado IS NULL OR U.EST_USU = @estado)
                  AND (
                      U.ID_USU LIKE @buscar ESCAPE '!'
                      OR U.NOM_USU LIKE @buscar ESCAPE '!'
                      OR U.APE_USU LIKE @buscar ESCAPE '!'
                      OR U.COR_USU LIKE @buscar ESCAPE '!'
                      OR U.ID_COP_PER LIKE @buscar ESCAPE '!'
                      OR C.NOM_COP LIKE @buscar ESCAPE '!'
                  )
                ORDER BY U.NOM_USU, U.APE_USU, U.ID_USU
            `);

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
        const usuario = await obtenerOperativo(pool, id);
        if (!usuario) return res.status(404).json({ success: false, message: 'Usuario operativo no encontrado.' });
        return res.status(200).json({ success: true, usuario });
    } catch (error) {
        return manejarError(res, error);
    }
}

async function registrarUsuario(req, res) {
    const datos = datosUsuario(req.body);
    const error = validarUsuario(datos, true);
    if (error) return res.status(400).json({ success: false, message: error });

    try {
        const pool = await conectarBD();
        const problemaCooperativa = await validarCooperativa(pool, datos.ID_COP_PER, true);
        if (problemaCooperativa) return res.status(400).json({ success: false, message: problemaCooperativa });
        const duplicado = await validarDuplicado(pool, datos);
        if (duplicado) return res.status(409).json({ success: false, message: duplicado });

        const hash = await bcrypt.hash(datos.password, 12);
        const resultado = await entradasUsuario(pool.request(), datos)
            .input('hash', sql.VarChar(255), hash)
            .query(`
                INSERT INTO dbo.USUARIOS
                    (ID_USU, NOM_USU, APE_USU, COR_USU, CON_USU, TEL_USU,
                     FEC_REG_USU, EST_USU, ID_ROL_PER, ID_COP_PER)
                OUTPUT INSERTED.ID_USU, INSERTED.NOM_USU, INSERTED.APE_USU,
                       INSERTED.COR_USU, INSERTED.TEL_USU, INSERTED.FEC_REG_USU,
                       INSERTED.EST_USU, INSERTED.ID_ROL_PER, INSERTED.ID_COP_PER
                VALUES (@id, @nombre, @apellido, @correo, @hash, @telefono,
                        GETDATE(), @estado, @rol, @cooperativa)
            `);

        return res.status(201).json({
            success: true,
            message: 'Usuario operativo registrado correctamente.',
            usuario: resultado.recordset[0]
        });
    } catch (error) {
        return manejarError(res, error);
    }
}

async function editarUsuario(req, res) {
    const id = codigo(req.params.id);
    if (req.body?.ID_USU !== undefined && codigo(req.body.ID_USU) !== id) {
        return res.status(400).json({ success: false, message: 'No se puede modificar la identificación.' });
    }

    const datos = datosUsuario(req.body, id);
    const error = validarUsuario(datos);
    if (error) return res.status(400).json({ success: false, message: error });

    try {
        const pool = await conectarBD();
        const actual = await obtenerOperativo(pool, id);
        if (!actual) return res.status(404).json({ success: false, message: 'Usuario operativo no encontrado.' });

        const problemaCooperativa = await validarCooperativa(
            pool, datos.ID_COP_PER, actual.ID_COP_PER !== datos.ID_COP_PER
        );
        if (problemaCooperativa) return res.status(400).json({ success: false, message: problemaCooperativa });
        const duplicado = await validarDuplicado(pool, datos, id);
        if (duplicado) return res.status(409).json({ success: false, message: duplicado });

        const resultado = await entradasUsuario(pool.request(), datos).query(`
            UPDATE dbo.USUARIOS
            SET NOM_USU = @nombre,
                APE_USU = @apellido,
                COR_USU = @correo,
                TEL_USU = @telefono,
                EST_USU = @estado,
                ID_ROL_PER = @rol,
                ID_COP_PER = @cooperativa
            OUTPUT INSERTED.ID_USU, INSERTED.NOM_USU, INSERTED.APE_USU,
                   INSERTED.COR_USU, INSERTED.TEL_USU, INSERTED.FEC_REG_USU,
                   INSERTED.EST_USU, INSERTED.ID_ROL_PER, INSERTED.ID_COP_PER
            WHERE ID_USU = @id AND ID_ROL_PER IN ('R003', 'R004')
        `);
        if (!resultado.recordset.length) return res.status(404).json({ success: false, message: 'Usuario operativo no encontrado.' });

        return res.status(200).json({
            success: true,
            message: 'Usuario operativo actualizado correctamente.',
            usuario: resultado.recordset[0]
        });
    } catch (error) {
        return manejarError(res, error);
    }
}

async function cambiarEstadoUsuario(req, res) {
    const id = codigo(req.params.id);
    const estado = req.body?.EST_USU ?? req.body?.estado;
    if (!/^[A-Z0-9]{5,10}$/.test(id) || !['0', '1'].includes(estado)) {
        return res.status(400).json({ success: false, message: 'Identificación o estado inválidos.' });
    }

    try {
        const pool = await conectarBD();
        const resultado = await pool.request()
            .input('id', sql.VarChar(10), id)
            .input('estado', sql.Char(1), estado)
            .query(`
                UPDATE dbo.USUARIOS
                SET EST_USU = @estado
                OUTPUT INSERTED.ID_USU, INSERTED.NOM_USU, INSERTED.APE_USU,
                       INSERTED.COR_USU, INSERTED.TEL_USU, INSERTED.FEC_REG_USU,
                       INSERTED.EST_USU, INSERTED.ID_ROL_PER, INSERTED.ID_COP_PER
                WHERE ID_USU = @id AND ID_ROL_PER IN ('R003', 'R004')
            `);
        if (!resultado.recordset.length) return res.status(404).json({ success: false, message: 'Usuario operativo no encontrado.' });

        return res.status(200).json({
            success: true,
            message: estado === '1' ? 'Usuario activado correctamente.' : 'Usuario desactivado correctamente.',
            usuario: resultado.recordset[0]
        });
    } catch (error) {
        return manejarError(res, error);
    }
}

async function desactivarUsuario(req, res) {
    req.body = { EST_USU: '0' };
    return cambiarEstadoUsuario(req, res);
}

module.exports = {
    listarUsuarios,
    consultarUsuario,
    registrarUsuario,
    editarUsuario,
    cambiarEstadoUsuario,
    desactivarUsuario
};
