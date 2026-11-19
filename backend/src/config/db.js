const sql = require('mssql');
const path = require('path');
require('dotenv').config({
    path: [path.join(__dirname, '../../.env'), path.join(__dirname, '../.env')],
    quiet: true
});

const dbConfig = {
    server: process.env.DB_SERVER,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    options: {
        encrypt: false, 
        trustServerCertificate: true
    }
};

const conectarBD = async () => {
    const required = ['DB_SERVER', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
    const missing = required.filter(name => !process.env[name]?.trim());
    if (missing.length) {
        throw new Error(`Configura ${missing.join(', ')} en backend/.env o en el entorno del proceso.`);
    }
    if (!Number.isInteger(dbConfig.port) || dbConfig.port < 1 || dbConfig.port > 65535) {
        throw new Error('Configura DB_PORT con un puerto entre 1 y 65535 en backend/.env o en el entorno del proceso.');
    }
    try {
        let pool = await sql.connect(dbConfig);
        console.log("¡Conectado exitosamente a la Base de Datos en Docker!");
        return pool;
    } catch (err) {
        console.error("Error al conectar a la Base de Datos:", err);
        throw err; 
    }
};

module.exports = { sql, conectarBD };
