// Rutas del módulo pert (por completar)
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => res.json({ modulo: 'pert', estado: 'pendiente' }));

module.exports = router;
