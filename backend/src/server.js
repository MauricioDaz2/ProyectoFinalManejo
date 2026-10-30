const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const adminRutasRoutes = require('./routes/adminRutasRoutes');
const adminParadaRoutes = require('./routes/adminParadaRoutes');
const adminCooperativaRoutes = require('./routes/adminCooperativaRoutes');
const adminUsuarioRoutes = require('./routes/adminUsuarioRoutes');
const coopBusRoutes = require('./routes/coopBusRoutes');
const userViajesRoutes = require('./routes/userViajesRoutes');
const userReservaRoutes = require('./routes/userReservaRoutes');
const oficinistaBoletoRoutes = require('./routes/oficinistaBoletoRoutes');

const app = express();
const PORT = process.env.PORT || 3000;


app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));


app.use('/api/auth', authRoutes);
app.use('/api/admin/rutas', adminRutasRoutes);
app.use('/api/admin/parada', adminParadaRoutes);
app.use('/api/admin/cooperativas', adminCooperativaRoutes);
app.use('/api/admin/usuarios', adminUsuarioRoutes);
app.use('/api/coop', coopBusRoutes);
app.use('/api/usuario/viajes', userViajesRoutes);
app.use('/api/usuario/reservas', userReservaRoutes);
app.use('/api/oficinista', oficinistaBoletoRoutes);

app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});