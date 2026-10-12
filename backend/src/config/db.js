const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
    server: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    options: {
        encrypt: false, 
        trustServerCertificate: true
    }
};

const conectarBD = async () => {
    try {
        let pool = await sql.connect(dbConfig);
        console.log("¡Conectado exitosamente a la Base de Datos en Docker!");
        return pool;
    } catch (err) {
        console.error("Error al conectar a la Base de Datos:", err);
    }
};

module.exports = { sql, conectarBD };