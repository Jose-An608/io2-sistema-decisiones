// Rutas del módulo Teoría de decisiones  ->  /api/decisiones
const express = require('express');
const c = require('../controllers/decisiones.controller');

const router = express.Router();

router.get('/', c.listar);                     // lista de decisiones guardadas
router.post('/calcular', c.calcular);          // calcula sin guardar (antes de /:id)
router.post('/', c.crear);                     // guarda una nueva decisión
router.get('/:id', c.obtener);                 // decisión con su matriz
router.get('/:id/analisis', c.analizarGuardada); // aplica los criterios a una guardada
router.put('/:id', c.actualizar);              // reemplaza una decisión
router.delete('/:id', c.eliminar);             // elimina una decisión

module.exports = router;
