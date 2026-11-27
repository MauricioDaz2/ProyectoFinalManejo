const {createHash}=require('node:crypto');
const {sql,conectarBD}=require('../config/db');
const trips=require('./tripOperations');
const cc=require('./frequencyControl');
const {requireEnabled}=require('./routeCategories');

const error=(message,status=422)=>cc.fail(status,'PROGRAMACION_GRUPOS',message);
const tables={
    BUS:{members:'GRUPO_BUSES',resource:'BUSES',id:'ID_BUS'},
    FRECUENCIA:{members:'GRUPO_FRECUENCIAS',resource:'FRECUENCIAS',id:'ID_FRE'}
};
const query=(db,user)=>new sql.Request(db).input('empresa',sql.VarChar(5),user.cooperativaId);
const dayMs=86400000;
const groupId=id=>{
    const number=Number(id);
    if(!Number.isInteger(number)||number<1||number>2147483647)throw error('Grupo inválido.');
    return number;
};

async function list(user){
    requireEnabled();
    trips.canAssign(user);
    const db=await conectarBD();
    const {recordsets:[groups,buses,frequencies]}=await query(db,user).query(`
        SELECT ID_GRU,TIPO,NOMBRE FROM dbo.GRUPOS_PROGRAMACION WHERE ID_COP=@empresa ORDER BY NOMBRE;
        SELECT b.ID_BUS id,g.ID_GRU FROM dbo.GRUPO_BUSES b JOIN dbo.GRUPOS_PROGRAMACION g ON g.ID_GRU=b.ID_GRU
        WHERE g.ID_COP=@empresa ORDER BY b.ORDEN;
        SELECT f.ID_FRE id,g.ID_GRU FROM dbo.GRUPO_FRECUENCIAS f JOIN dbo.GRUPOS_PROGRAMACION g ON g.ID_GRU=f.ID_GRU
        WHERE g.ID_COP=@empresa ORDER BY f.ORDEN;`);
    return {grupos:groups.map(g=>({...g,miembros:(g.TIPO==='BUS'?buses:frequencies).filter(m=>m.ID_GRU===g.ID_GRU).map(m=>m.id)}))};
}

async function edit(user,body){
    requireEnabled();
    return trips.transaction(async db=>{
        await cc.lock(db);
        await trips.verifyScheduler(db,user);
        const id=body.id==null?null:groupId(body.id);
        const prior=id?(await query(db,user).input('id',sql.Int,id)
            .query('SELECT TIPO FROM dbo.GRUPOS_PROGRAMACION WHERE ID_GRU=@id AND ID_COP=@empresa')).recordset[0]:null;
        if(id&&!prior)throw error('Grupo no disponible.',404);
        if(body.eliminar===true){
            if(!prior)throw error('Selecciona un grupo.');
            await query(db,user).input('id',sql.Int,id).query('DELETE dbo.GRUPOS_PROGRAMACION WHERE ID_GRU=@id AND ID_COP=@empresa');
            return {};
        }
        const {tipo,miembros}=body;
        const name=typeof body.nombre==='string'?body.nombre.trim():'';
        if(!Object.hasOwn(tables,tipo)||!name||name.length>80||(prior&&prior.TIPO!==tipo)
            ||!Array.isArray(miembros)||!miembros.length||miembros.length>100
            ||miembros.some(i=>typeof i!=='string'||!/^[A-Z0-9_-]{1,5}$/.test(i))
            ||new Set(miembros).size!==miembros.length)throw error('Indica un nombre y miembros válidos.');
        const {members,resource,id:column}=tables[tipo];
        const scoped=()=>query(db,user).input('id',sql.Int,id).input('name',sql.NVarChar(80),name)
            .input('tipo',sql.VarChar(12),tipo).input('json',sql.NVarChar(sql.MAX),JSON.stringify(miembros));
        const {recordset:[result]}=await scoped().query(`
            IF (SELECT COUNT(*) FROM OPENJSON(@json) j JOIN dbo.${resource} r ON r.${column}=j.value AND r.ID_COP_PER=@empresa)
                <> (SELECT COUNT(*) FROM OPENJSON(@json))
                THROW 51801,'Un miembro no pertenece a tu cooperativa.',1;
            ${tipo==='BUS'?`IF EXISTS (SELECT 1 FROM dbo.GRUPO_BUSES b JOIN OPENJSON(@json) j ON j.value=b.ID_BUS WHERE @id IS NULL OR b.ID_GRU<>@id)
                THROW 51801,'Un bus ya pertenece a otro grupo.',1;`:''}
            IF @id IS NULL
            BEGIN
                INSERT dbo.GRUPOS_PROGRAMACION(ID_COP,TIPO,NOMBRE) VALUES(@empresa,@tipo,@name);
                SET @id=CONVERT(int,SCOPE_IDENTITY());
            END
            ELSE
                UPDATE dbo.GRUPOS_PROGRAMACION SET NOMBRE=@name WHERE ID_GRU=@id AND ID_COP=@empresa;
            DELETE dbo.${members} WHERE ID_GRU=@id;
            INSERT dbo.${members}(ID_GRU,${column},ORDEN) SELECT @id,value,CONVERT(int,[key]) FROM OPENJSON(@json);
            SELECT @id id;`);
        return result;
    });
}

function calendar(body){
    const first=cc.date(body.desde), last=cc.date(body.hasta);
    const minutes=Number(body.duracion);
    const start=Date.parse(first), finish=Date.parse(last);
    const days=(finish-start)/dayMs+1;
    if(!first||!last||days<1||days>31||!Number.isInteger(minutes)||minutes<1||minutes>1440)
        throw error('Indica un rango de hasta 31 días y una duración de 1 a 1440 minutos.');
    return {first:start,days,minutes};
}

function plan(range,buses,frequencies,crew){
    if(!buses.length||!frequencies.length||range.days*frequencies.length>100)
        throw error('Selecciona grupos con miembros y un rango de hasta 100 salidas.');
    const rows=[];
    for(let day=0;day<range.days;day++){
        const dayNumber=(+range.first/dayMs)+day;
        const date=new Date(dayNumber*dayMs).toISOString().slice(0,10);
        for(const [index,f] of frequencies.entries()){
            if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(f.HORA_SAL_FRE||''))throw error(`La frecuencia ${f.ID_FRE} necesita una hora de salida.`);
            const bus=buses[((dayNumber+index)%buses.length+buses.length)%buses.length];
            const pair=crew[bus.ID_BUS]||{};
            const salida=new Date(`${date}T${f.HORA_SAL_FRE}:00-05:00`);
            rows.push({idBus:bus.ID_BUS,idFre:f.ID_FRE,idUsuCho:pair.chofer||bus.ID_CHO_1||bus.ID_CHO_2,
                idUsuCon:pair.controlador||bus.ID_CON_DEF,salida:salida.toISOString(),
                llegada:new Date(+salida+range.minutes*60000).toISOString()});
        }
    }
    return rows;
}

async function generate(user,body){
    requireEnabled();
    const range=calendar(body);
    const busGroup=groupId(body.grupoBus), frequencyGroup=groupId(body.grupoFrecuencia);
    const token=body.idLote;
    if(typeof token!=='string'||!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(token))throw error('Identificador de lote inválido.');
    const crew=body.tripulacion||{};
    if(typeof crew!=='object'||Array.isArray(crew))throw error('Tripulación inválida.');
    const hash=createHash('sha256').update(JSON.stringify([busGroup,frequencyGroup,body.desde,body.hasta,range.minutes,
        Object.keys(crew).sort().map(id=>[id,crew[id]?.chofer,crew[id]?.controlador])])).digest();
    return trips.transaction(async db=>{
        await cc.lock(db);
        await trips.verifyScheduler(db,user);
        const lot=()=>query(db,user).input('lote',sql.UniqueIdentifier,token);
        const prior=(await lot().query('SELECT HUELLA FROM dbo.LOTES_HOJAS_RUTA WHERE ID_COP=@empresa AND ID_LOTE=@lote')).recordset[0];
        if(prior){
            if(!hash.equals(prior.HUELLA))throw error('El identificador ya corresponde a otro lote.',409);
            const result=await lot().query('SELECT ID_HOJ idHoja FROM dbo.LOTE_HOJAS_DETALLE WHERE ID_COP=@empresa AND ID_LOTE=@lote ORDER BY FILA');
            return {hojas:result.recordset,repetido:true};
        }
        const {recordsets:[buses,frequencies]}=await query(db,user).input('bus',sql.Int,busGroup).input('fre',sql.Int,frequencyGroup).query(`
            SELECT b.* FROM dbo.GRUPO_BUSES m JOIN dbo.GRUPOS_PROGRAMACION g ON g.ID_GRU=m.ID_GRU
            JOIN dbo.BUSES b ON b.ID_BUS=m.ID_BUS AND b.ID_COP_PER=g.ID_COP
            WHERE g.ID_COP=@empresa AND g.ID_GRU=@bus AND g.TIPO='BUS' ORDER BY m.ORDEN;
            SELECT f.ID_FRE,f.HORA_SAL_FRE FROM dbo.GRUPO_FRECUENCIAS m JOIN dbo.GRUPOS_PROGRAMACION g ON g.ID_GRU=m.ID_GRU
            JOIN dbo.FRECUENCIAS f ON f.ID_FRE=m.ID_FRE AND f.ID_COP_PER=g.ID_COP
            WHERE g.ID_COP=@empresa AND g.ID_GRU=@fre AND g.TIPO='FRECUENCIA' ORDER BY m.ORDEN;`);
        const rows=plan(range,buses,frequencies,crew);
        const sheets=[];
        for(const row of rows){
            try{
                await cc.checkSchedule(db,row.idFre,trips.localDay(new Date(row.salida)),trips.localDay(new Date(+new Date(row.llegada)-1)));
                sheets.push(await trips.assignInTransaction(db,user,row));
            }catch(e){if(e.status)e.message=`${row.salida.slice(0,10)} · ${row.idFre} · ${row.idBus}: ${e.message}`;throw e;}
        }
        await lot().input('hash',sql.Binary(32),hash).input('actor',sql.VarChar(10),user.id)
            .input('json',sql.NVarChar(sql.MAX),JSON.stringify(sheets.map(s=>s.idHoja))).query(`
                INSERT dbo.LOTES_HOJAS_RUTA(ID_COP,ID_LOTE,HUELLA,ID_ACTOR) VALUES(@empresa,@lote,@hash,@actor);
                INSERT dbo.LOTE_HOJAS_DETALLE(ID_COP,ID_LOTE,FILA,ID_HOJ)
                SELECT @empresa,@lote,CONVERT(int,[key])+1,value FROM OPENJSON(@json);`);
        return {hojas:sheets};
    });
}
const handle=fn=>async(req,res)=>{
    try{res.json({success:true,...await fn(req.auth,req.body)});}
    catch(e){
        if(cc.respond(res,e))return;
        const conflict=[2601,2627].includes(e.number);
        res.status(e.status||(e.number===51801?422:conflict?409:503)).json({success:false,message:e.status||e.number===51801
            ?e.message:conflict?'Ya existe un grupo con ese nombre o algún bus ya está agrupado.':'No se pudo confirmar la programación.'});
    }
};
module.exports={list,edit,generate,handle,calendar,plan};
