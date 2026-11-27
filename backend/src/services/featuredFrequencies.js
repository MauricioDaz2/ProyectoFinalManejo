// RFC-000085 · Frecuencias destacadas / publicidad patrocinada con cupo por cooperativa.
const { sql } = require('../config/db');

const ID_RE = /^[A-Z0-9_-]{1,5}$/;
const LIMITE_MAXIMO = 50;

function fail(status, message, extra = {}) {
    return Object.assign(new Error(message), { status, ...extra });
}

const id = (valor) => String(valor ?? '').trim().toUpperCase();

function validarLimite(valor) {
    const texto = String(valor ?? '').trim();
    if (!/^\d{1,3}$/.test(texto)) return null;
    const numero = Number(texto);
    return numero <= LIMITE_MAXIMO ? numero : null;
}

function leerDestacada(valor) {
    if (valor === true || valor === 1 || valor === '1' || valor === 'true') return true;
    if (valor === false || valor === 0 || valor === '0' || valor === 'false') return false;
    return null;
}

// Regla de cupo pura (también la aplica el trigger TR_RFC085_CupoDestacadas en BD).
function evaluarCupo({ limite, usadas, yaDestacada, destacar }) {
    if (!destacar || yaDestacada) return { permitido: true };
    if (usadas >= limite) {
        return {
            permitido: false,
            message: limite === 0
                ? 'Tu cooperativa no tiene frecuencias destacadas contratadas. Solicita el cupo al Administrador.'
                : `Ya usas ${usadas} de ${limite} frecuencias destacadas contratadas. Desmarca una para destacar otra.`
        };
    }
    return { permitido: true };
}

async function installed(pool) {
    try {
        const { recordset: [row] } = await pool.request().query(`
            SELECT CASE WHEN COL_LENGTH('dbo.COOPERATIVAS','LIM_DES_COP') IS NOT NULL
                         AND COL_LENGTH('dbo.FRECUENCIAS','ES_DESTACADA') IS NOT NULL THEN 1 ELSE 0 END AS DESTACADAS_INSTALADAS
        `);
        return Boolean(row?.DESTACADAS_INSTALADAS);
    } catch {
        return false;
    }
}

async function requireInstalled(pool) {
    if (!await installed(pool)) throw fail(409, 'El módulo de frecuencias destacadas no está instalado. Aplica la migración 019.', { code: 'DESTACADAS_NO_INSTALADAS' });
}

async function summary(pool, cooperativa) {
    const coop = id(cooperativa);
    if (!ID_RE.test(coop) || !await installed(pool)) return { disponible: false, limite: 0, usadas: 0 };
    const { recordset: [row] } = await pool.request()
        .input('cooperativa', sql.VarChar(5), coop)
        .query(`
            SELECT C.LIM_DES_COP AS limite,
                   (SELECT COUNT(*) FROM dbo.FRECUENCIAS F WHERE F.ID_COP_PER = C.ID_COP AND F.ES_DESTACADA = 1) AS usadas
            FROM dbo.COOPERATIVAS C WHERE C.ID_COP = @cooperativa
        `);
    return { disponible: true, limite: Number(row?.limite) || 0, usadas: Number(row?.usadas) || 0 };
}

async function setLimit(pool, cooperativa, valor) {
    const coop = id(cooperativa);
    if (!ID_RE.test(coop)) throw fail(400, 'Cooperativa no válida.');
    const limite = validarLimite(valor);
    if (limite === null) throw fail(400, `El límite debe ser un número entero entre 0 y ${LIMITE_MAXIMO}.`);
    await requireInstalled(pool);

    const tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
        const { recordset: [row] } = await new sql.Request(tx)
            .input('cooperativa', sql.VarChar(5), coop)
            .query(`
                SELECT C.ID_COP,
                       (SELECT COUNT(*) FROM dbo.FRECUENCIAS F WITH (UPDLOCK, HOLDLOCK)
                        WHERE F.ID_COP_PER = C.ID_COP AND F.ES_DESTACADA = 1) AS usadas
                FROM dbo.COOPERATIVAS C WITH (UPDLOCK, HOLDLOCK) WHERE C.ID_COP = @cooperativa
            `);
        if (!row) throw fail(404, 'Cooperativa no encontrada.');
        const usadas = Number(row.usadas) || 0;
        if (limite < usadas) {
            throw fail(409, `La cooperativa tiene ${usadas} frecuencias destacadas. Deben desmarcarse antes de bajar el límite a ${limite}.`, { limite, usadas });
        }
        await new sql.Request(tx)
            .input('cooperativa', sql.VarChar(5), coop)
            .input('limite', sql.Int, limite)
            .query('UPDATE dbo.COOPERATIVAS SET LIM_DES_COP = @limite WHERE ID_COP = @cooperativa');
        await tx.commit();
        return { limite, usadas };
    } catch (error) {
        await tx.rollback().catch(() => {});
        throw error;
    }
}

async function toggle(pool, cooperativa, frecuencia, valor) {
    const coop = id(cooperativa);
    const fre = id(frecuencia);
    const destacar = leerDestacada(valor);
    if (!ID_RE.test(coop) || !ID_RE.test(fre)) throw fail(400, 'Frecuencia o cooperativa no válida.');
    if (destacar === null) throw fail(400, 'Indica destacada: true o false.');
    await requireInstalled(pool);

    const tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
        const { recordset: [row] } = await new sql.Request(tx)
            .input('cooperativa', sql.VarChar(5), coop)
            .input('frecuencia', sql.VarChar(5), fre)
            .query(`
                SELECT C.LIM_DES_COP AS limite,
                       (SELECT COUNT(*) FROM dbo.FRECUENCIAS X WITH (UPDLOCK, HOLDLOCK)
                        WHERE X.ID_COP_PER = C.ID_COP AND X.ES_DESTACADA = 1) AS usadas,
                       F.ES_DESTACADA AS actual
                FROM dbo.COOPERATIVAS C WITH (UPDLOCK, HOLDLOCK)
                JOIN dbo.FRECUENCIAS F WITH (UPDLOCK, HOLDLOCK) ON F.ID_COP_PER = C.ID_COP AND F.ID_FRE = @frecuencia
                WHERE C.ID_COP = @cooperativa
            `);
        if (!row) throw fail(404, 'Frecuencia no disponible en tu cooperativa.');
        const limite = Number(row.limite) || 0;
        let usadas = Number(row.usadas) || 0;
        const yaDestacada = row.actual === true || row.actual === 1;
        const cupo = evaluarCupo({ limite, usadas, yaDestacada, destacar });
        if (!cupo.permitido) throw fail(409, cupo.message, { limite, usadas, code: 'CUPO_DESTACADAS_EXCEDIDO' });

        if (yaDestacada !== destacar) {
            await new sql.Request(tx)
                .input('cooperativa', sql.VarChar(5), coop)
                .input('frecuencia', sql.VarChar(5), fre)
                .input('destacada', sql.Bit, destacar)
                .query('UPDATE dbo.FRECUENCIAS SET ES_DESTACADA = @destacada WHERE ID_FRE = @frecuencia AND ID_COP_PER = @cooperativa');
            usadas += destacar ? 1 : -1;
        }
        await tx.commit();
        return { frecuencia: fre, destacada: destacar, limite, usadas };
    } catch (error) {
        await tx.rollback().catch(() => {});
        if (!error.status && /CUPO_DESTACADAS_EXCEDIDO/.test(String(error.message))) {
            throw fail(409, 'Se alcanzó el límite de frecuencias destacadas contratadas.', { code: 'CUPO_DESTACADAS_EXCEDIDO' });
        }
        throw error;
    }
}

async function publicList(pool, limite = 8) {
    if (!await installed(pool)) return [];
    const { recordset: [schema] } = await pool.request().query(
        "SELECT CASE WHEN COL_LENGTH('dbo.FRECUENCIAS','HORA_SAL_FRE') IS NOT NULL THEN 1 ELSE 0 END AS HORA_TARIFA"
    );
    const horaTarifa = schema?.HORA_TARIFA ? 'F.HORA_SAL_FRE, F.TAR_BAS_FRE,' : 'NULL AS HORA_SAL_FRE, NULL AS TAR_BAS_FRE,';
    const { recordset } = await pool.request()
        .input('top', sql.Int, Math.min(Math.max(Number(limite) || 8, 1), 20))
        .query(`
            SELECT TOP (@top) F.ID_FRE, F.CIU_ORI_FRE, F.CIU_DES_FRE, ${horaTarifa}
                   C.ID_COP, C.NOM_COP
            FROM dbo.FRECUENCIAS F
            JOIN dbo.COOPERATIVAS C ON C.ID_COP = F.ID_COP_PER
            WHERE F.ES_DESTACADA = 1
              AND C.EST_COP = '1'
              AND ISNULL(F.EST_RES, '1') = '1'
              AND (F.FEC_HOR_FIN_FRE IS NULL OR F.FEC_HOR_FIN_FRE >= CAST(SYSDATETIME() AS date))
            ORDER BY C.NOM_COP, F.CIU_ORI_FRE, F.CIU_DES_FRE
        `);
    return recordset;
}

module.exports = { LIMITE_MAXIMO, validarLimite, leerDestacada, evaluarCupo, installed, summary, setLimit, toggle, publicList };
