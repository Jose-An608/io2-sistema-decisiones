// =====================================================
// Servidor Express: sirve el frontend y expone la API
// =====================================================
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { getPool } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Frontend estático
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Rutas de cada módulo
app.use('/api/pert', require('./routes/pert.routes'));
app.use('/api/inventario', require('./routes/inventario.routes'));
app.use('/api/decisiones', require('./routes/decisiones.routes'));

// Prueba de conexión con la base de datos
app.get('/api/health', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query('SELECT DB_NAME() AS baseDatos, @@VERSION AS version');
    res.json({ ok: true, ...r.recordset[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Manejo de errores general
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: err.message });
});

app.listen(PORT, () => {
  console.log(`Servidor listo en http://localhost:${PORT}`);
  console.log(`Prueba la base de datos en http://localhost:${PORT}/api/health`);
});
