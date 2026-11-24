const express = require('express');
const cors = require('cors');
const path = require('path');

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
app.get('/api/health', (req, res) => {
    res.set('Cache-Control', 'no-store').json({ application: 'ProyectoFinalManejo', frontend: '/src/views/public/index.html' });
});


app.use('/api/auth', authRoutes);
app.use('/api/operacion', require('./routes/tripOperationRoutes'));
app.use('/api/mi-perfil', require('./routes/userProfileRoutes'));
app.use('/api/admin', requireSession, requireRole('R001'));
app.use('/api/coop', requireSession, requireRole('R002'));
app.use('/api/oficinista', requireSession, requireRole('R001', 'R003'));
app.use('/api/controlador', requireSession, requireRole('R004'));
app.use('/api/usuario/reservas', (req, res, next) => {
    if (req.method === 'GET' && /^\/[A-Za-z0-9_-]{1,5}\/asientos\/?$/.test(req.path)) return next();
    requireSession(req, res, () => requireRole('R005','R004','R006')(req, res, next));
});
app.use('/api/public', require('./routes/publicRoutes'));
app.use('/api/admin/rutas', adminRutasRoutes);
app.use('/api/admin/parada', adminParadaRoutes);
app.use('/api/admin/cooperativas', adminCooperativaRoutes);
app.use('/api/admin/usuarios', adminUsuarioRoutes);
app.use('/api/coop/personal', require('./routes/personalRoutes'));
app.get('/api/coop/indicadores', require('./security/permissions').requirePermission('dashboard'), require('./controllers/coopIndicatorsController'));
app.get('/api/coop/resoluciones-opciones', require('./security/permissions').requirePermission('rutas'), (req, res) => {
    res.status(410).json({ success: false, code: 'MODULO_RESOLUCIONES_ELIMINADO', message: 'El módulo independiente de Resoluciones ANT fue eliminado en RFC-000078.' });
});
app.use('/api/coop/perfil', require('./security/permissions').requirePermission('personalizacion'), require('./routes/cooperativaProfileRoutes'));
app.use('/api/coop', coopBusRoutes);
app.use('/api/usuario/viajes', userViajesRoutes);
app.use('/api/usuario/reservas', userReservaRoutes);
app.use('/api/oficinista', oficinistaBoletoRoutes);
app.use('/api/controlador', require('./routes/controladorRoutes'));

app.get('/src/views/admin/hojas_ruta.html', (req, res) => {
    res.redirect(302, '/src/views/admin/dashboard.html');
});

app.use(express.static(path.join(__dirname, '../../frontend')));

if (require.main === module) {
    const server = app.listen(PORT, () => {
        console.log(`ProyectoFinalManejo disponible en http://localhost:${PORT}/`);
        console.log('Abre ese enlace para ingresar. SQL Server debe estar iniciado para consultar datos.');
    });
    server.on('error', error => {
        if (error.code === 'EADDRINUSE') console.error(`El puerto ${PORT} ya está ocupado. Si el proyecto está iniciado, abre http://localhost:${PORT}/; de lo contrario, detén el proceso anterior antes de volver a iniciar.`);
        else console.error('No se pudo iniciar Express:', error.message);
        process.exitCode = 1;
    });
}

module.exports = app;
