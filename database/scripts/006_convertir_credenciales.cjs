const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../../backend/.env'), quiet: true });
const { sql, conectarBD } = require('../../backend/src/config/db');
const bcrypt = require('bcrypt');
const passwords = require('../../backend/src/security/passwords');

async function run() {
    if (!process.argv.includes('--aplicar-autorizado')) throw new Error('Ejecutar solo tras autorizar 006 y la conversión: node database/scripts/006_convertir_credenciales.cjs --aplicar-autorizado');
    const pool = await conectarBD();
    await passwords.ready(pool);
    const tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
        const rows = (await new sql.Request(tx).query('SELECT ID_USU,CON_USU FROM dbo.USUARIOS WITH (UPDLOCK,HOLDLOCK)')).recordset;
        let count = 0;
        for (const row of rows) {
            if (passwords.isHash(row.CON_USU)) continue;
            if (Buffer.byteLength(row.CON_USU) > 72) throw new Error('Existe una contraseña incompatible con bcrypt; no se confirmó ningún cambio.');
            const hash = await bcrypt.hash(row.CON_USU, 12);
            await new sql.Request(tx).input('id', sql.VarChar(10), row.ID_USU).input('hash', sql.VarChar(255), hash).query('UPDATE dbo.USUARIOS SET CON_USU=@hash WHERE ID_USU=@id');
            row.CON_USU = null;
            count++;
        }
        await tx.commit();
        console.log(`Conversión confirmada: ${count} cuentas. Se conservan las contraseñas de acceso.`);
    } catch (error) { await tx.rollback().catch(() => {}); throw error; }
}
run().catch(() => { console.error('Conversión no completada. Verifica autorización, migración 006 y conexión. No se muestran datos de credenciales.'); process.exitCode = 1; }).finally(() => sql.close());
