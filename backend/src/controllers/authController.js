const { sql, conectarBD } = require('../config/db');

const login = async (req, res) => {
    const { correo, password } = req.body;

    try {
        const pool = await conectarBD();
        
        
        const resultado = await pool.request()
            .input('correo', sql.VarChar, correo)
            .query(`
                SELECT U.ID_USU, U.NOM_USU, U.APE_USU, U.COR_USU, U.CON_USU, U.EST_USU, 
                       R.ID_ROL, R.NOM_ROL, U.ID_COP_PER
                FROM USUARIOS U
                INNER JOIN ROLES R ON U.ID_ROL_PER = R.ID_ROL
                WHERE U.COR_USU = @correo
            `);

        if (resultado.recordset.length === 0) {
            return res.status(404.json({ success: false, message: "Usuario no encontrado." }));
        }

        const usuario = resultado.recordset[0];

        
        if (usuario.EST_USU !== '1') {
            return res.status(403).json({ success: false, message: "La cuenta se encuentra inactiva." });
        }

        
        if (usuario.CON_USU !== password) {
            return res.status(401).json({ success: false, message: "Contraseña incorrecta." });
        }

        
        res.status(200).json({
            success: true,
            message: "Inicio de sesión exitoso.",
            usuario: {
                id: usuario.ID_USU,
                nombre: `${usuario.NOM_USU} ${usuario.APE_USU}`,
                correo: usuario.COR_USU,
                rolId: usuario.ID_ROL,
                rolNombre: usuario.NOM_ROL,
                cooperativaId: usuario.ID_COP_PER
            }
        });

    } catch (error) {
        console.error("Error en el servidor durante el login:", error);
        res.status(500).json({ success: false, message: "Error interno del servidor." });
    }
};

module.exports = { login };