const { sql, conectarBD } = require('../config/db');
const registration=require('../services/companyRegistration');
const access=require('../security/permissions');
const management=require('../services/companyAdministration');
const featured=require('../services/featuredFrequencies');

const columnas = `
    ID_COP, NOM_COP, RUC_COP, DIR_COP,
    TEL_COP, LOG_URL_COP, EST_COP
`;

const texto = (valor) => typeof valor === 'string' ? valor.trim() : '';
const codigo = (valor) => texto(valor).toUpperCase();

function manejarError(res, error) {
    if(error.status)return res.status(error.status).json({success:false,message:error.message,fields:error.fields,dependencias:error.dependencias,limite:error.limite,usadas:error.usadas,code:error.code});
    const numero = error.number ?? error.originalError?.info?.number;

    if (numero === 2627 || numero === 2601) {
        return res.status(409).json({ success: false, message: 'Ya existe un registro con esos datos.' });
    }

    return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
}

async function readColumns(pool) {
    const expanded=await registration.installed(pool);
    const principal=await access.installed(pool);
    const destacadas=await featured.installed(pool);
    return { expanded, columns:columnas+(destacadas?', LIM_DES_COP, (SELECT COUNT(*) FROM dbo.FRECUENCIAS F WHERE F.ID_COP_PER=COOPERATIVAS.ID_COP AND F.ES_DESTACADA=1) AS DES_USADAS':'')+(expanded?', NOM_COM_COP,TIP_ORG_COP,PROVINCIA_COP,CIUDAD_COP,COR_INS_COP,SIT_WEB_COP':', NULL AS CIUDAD_COP')+(principal?", (SELECT U.NOM_USU+' '+U.APE_USU FROM dbo.COOPERATIVA_RESPONSABLES R JOIN dbo.USUARIOS U ON U.ID_USU=R.ID_USU WHERE R.ID_COP=COOPERATIVAS.ID_COP) AS RESPONSABLE":', NULL AS RESPONSABLE') };
}
async function listarCooperativas(req, res) {
    const buscar = texto(req.query.buscar);
    const estado = req.query.estado === undefined ? null : texto(req.query.estado);

    if (buscar.length > 100 || (estado !== null && !['0', '1','S'].includes(estado))) {
        return res.status(400).json({ success: false, message: 'Filtros de búsqueda no válidos.' });
    }

    const escapado = buscar.replace(/[!%_\[]/g, (valor) => `!${valor}`);

    try {
        const pool = await conectarBD();
        const schema=await readColumns(pool);
        const resultado = await pool.request()
            .input('buscar', sql.VarChar(210), `%${escapado}%`)
            .input('estado', sql.Char(1), estado)
            .query(`
                SELECT ${schema.columns}
                FROM dbo.COOPERATIVAS
                WHERE (@estado IS NULL OR EST_COP = @estado)
                  AND (
                      ID_COP LIKE @buscar ESCAPE '!'
                      OR NOM_COP LIKE @buscar ESCAPE '!'
                      OR RUC_COP LIKE @buscar ESCAPE '!'
                      ${schema.expanded?"OR CIUDAD_COP LIKE @buscar ESCAPE '!' OR NOM_COM_COP LIKE @buscar ESCAPE '!'":''}
                  )
                ORDER BY NOM_COP, ID_COP
            `);

        return res.status(200).json({
            success: true,
            registroDisponible: schema.expanded,
            estadosDisponibles: await management.capabilities(pool),
            permisos: access.catalog,
            total: resultado.recordset.length,
            cooperativas: resultado.recordset
        });
    } catch (error) {
        return manejarError(res, error);
    }
}

async function obtenerCooperativa(req,res) {
    try {res.set('Cache-Control','no-store');return res.json({success:true,...await management.detail(req.auth,codigo(req.params.id))});}
    catch(error){return manejarError(res,error);}
}
async function guardarCooperativa(req,res,id=null) {
    try { const cooperativa=await registration.save(req.auth,req.body,id); return res.status(id?200:201).json({success:true,cooperativa,message:'Cooperativa guardada correctamente.'}); }
    catch(error) { return manejarError(res,error); }
}
async function crearCooperativa(req,res) { return guardarCooperativa(req,res); }
async function actualizarCooperativa(req,res) { return guardarCooperativa(req,res,codigo(req.params.id)); }
async function cambiarEstadoCooperativa(req,res) {
 try{return res.json({success:true,...await management.changeState(req.auth,codigo(req.params.id),req.body),message:'Estado actualizado.'});}catch(error){return manejarError(res,error);}
}
async function eliminarCooperativa(req,res) {
 try{return res.json({success:true,...await management.remove(req.auth,codigo(req.params.id),req.body),message:'Cooperativa eliminada.'});}catch(error){return manejarError(res,error);}
}
const personal=action=>async(req,res)=>{
 try {return res.status(action==='create'?201:200).json({success:true,usuario:await management.peopleChange(req.auth,codigo(req.params.id),action,req.params.usuario,req.body),message:'Cuenta actualizada.'});}
 catch(error){return manejarError(res,error);}
};
// RFC-000085: límite de frecuencias destacadas contratadas por cooperativa.
async function obtenerDestacadas(req,res) {
 try{const pool=await conectarBD();return res.json({success:true,...await featured.summary(pool,codigo(req.params.id))});}catch(error){return manejarError(res,error);}
}
async function actualizarDestacadas(req,res) {
 try{const pool=await conectarBD();const resultado=await featured.setLimit(pool,codigo(req.params.id),req.body?.limite);return res.json({success:true,...resultado,message:`Límite de frecuencias destacadas actualizado a ${resultado.limite}.`});}catch(error){return manejarError(res,error);}
}
module.exports={obtenerDestacadas,actualizarDestacadas,listarCooperativas,obtenerCooperativa,crearCooperativa,actualizarCooperativa,cambiarEstadoCooperativa,eliminarCooperativa,personal};
