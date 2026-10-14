// Rutas del módulo inventario (por completar)
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => res.json({ modulo: 'inventario', estado: 'pendiente' }));

module.exports = router;
