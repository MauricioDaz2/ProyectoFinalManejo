const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const authRoutes = require('./routes/authRoutes');
const adminRutasRoutes = require('./routes/adminRutasRoutes');
const adminParadaRoutes = require('./routes/adminParadaRoutes');
const adminCooperativaRoutes = require('./routes/adminCooperativaRoutes');
const adminUsuarioRoutes = require('./routes/adminUsuarioRoutes');
const coopBusRoutes = require('./routes/coopBusRoutes');
const userViajesRoutes = require('./routes/userViajesRoutes');
const userReservaRoutes = require('./routes/userReservaRoutes');
const oficinistaBoletoRoutes = require('./routes/oficinistaBoletoRoutes');
const controladorRoutes = require('./routes/controladorRoutes');
const app = express();
const { allowedOrigin, guardOrigin, requireSession, requireRole } = require('./middleware/session');
const PORT = process.env.PORT || 3000;


app.use(cors((req, callback) => callback(null, { origin: allowedOrigin(req, req.headers.origin), credentials: true, allowedHeaders: ['Content-Type', 'X-Transport-Client', 'Accept', 'x-cooperativa'] })));
app.use(express.json());
app.use('/api', guardOrigin);
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));


app.use('/api/auth', authRoutes);
app.use('/api/mi-perfil', require('./routes/userProfileRoutes'));
app.use('/api/admin', requireSession, requireRole('R001'));
app.use('/api/coop', requireSession, requireRole('R002'));
app.use('/api/oficinista', requireSession, requireRole('R001', 'R003'));
app.use('/api/controlador', requireSession, requireRole('R004'));
app.use('/api/usuario/reservas', (req, res, next) => {
    if (req.method === 'GET' && /^\/[A-Za-z0-9_-]{1,5}\/asientos\/?$/.test(req.path)) return next();
    requireSession(req, res, () => requireRole('R005')(req, res, next));
});
app.use('/api/public', require('./routes/publicRoutes'));
app.use('/api/admin/rutas', adminRutasRoutes);
app.use('/api/admin/parada', adminParadaRoutes);
app.use('/api/admin/cooperativas', adminCooperativaRoutes);
app.use('/api/admin/usuarios', adminUsuarioRoutes);
app.use('/api/coop/personal', require('./routes/personalRoutes'));
app.get('/api/coop/indicadores', require('./security/permissions').requirePermission('dashboard'), require('./controllers/coopIndicatorsController'));
app.get('/api/coop/resoluciones-opciones', require('./security/permissions').requirePermission('rutas'), require('./controllers/accountController').handle(async (req, res) => {
    const { sql, conectarBD } = require('./config/db');
    const pool = await conectarBD();
    const result = await pool.request().input('company', sql.VarChar(5), req.auth.cooperativaId).query('SELECT R.ID_RES,R.FEC_EMI_RES,R.CUP_FRE_MAX,(SELECT COUNT(*) FROM dbo.FRECUENCIAS F WHERE F.ID_RES_PER=R.ID_RES) AS TOTAL_FRECUENCIAS FROM dbo.RESOLUCIONES_ANT R WHERE R.ID_COP_PER=@company ORDER BY R.ID_RES');
    res.json({ success: true, resoluciones: result.recordset });
}));
app.use('/api/coop/perfil', require('./security/permissions').requirePermission('personalizacion'), require('./routes/cooperativaProfileRoutes'));
app.use('/api/coop', coopBusRoutes);
app.use('/api/usuario/viajes', userViajesRoutes);
app.use('/api/usuario/reservas', userReservaRoutes);
app.use('/api/oficinista', oficinistaBoletoRoutes);
app.use('/api/controlador', require('./routes/controladorRoutes'));

app.use(express.static(path.join(__dirname, '../../frontend')));

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Servidor corriendo en el puerto ${PORT}`);
    });
}

module.exports = app;
