// Rutas del módulo decisiones (por completar)
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => res.json({ modulo: 'decisiones', estado: 'pendiente' }));

module.exports = router;
