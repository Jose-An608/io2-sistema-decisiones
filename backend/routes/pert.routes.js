// Rutas del módulo PERT/CPM  ->  /api/pert
const express = require('express');
const c = require('../controllers/pert.controller');

const router = express.Router();

router.get('/', c.listar);                       // proyectos guardados
router.post('/calcular', c.calcular);            // calcula sin guardar
router.post('/', c.crear);                       // guarda un proyecto nuevo
router.get('/:id', c.obtener);                   // proyecto con sus actividades
router.get('/:id/analisis', c.analizarGuardado); // ruta crítica, holguras, fechas y probabilidad (?plazo= &probabilidad=)
router.put('/:id/seguimiento', c.actualizarSeguimiento); // registra el avance real de las actividades
router.put('/:id', c.actualizar);                // reemplaza un proyecto (conserva el avance real)
router.delete('/:id', c.eliminar);               // elimina un proyecto

module.exports = router;
