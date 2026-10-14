// Rutas del módulo Teoría de decisiones  ->  /api/decisiones
const express = require('express');
const c = require('../controllers/decisiones.controller');

const router = express.Router();

// ----- Árboles de decisión (van primero para no confundirse con /:id) -----
router.get('/arboles', c.listarArboles);             // lista de árboles guardados
router.get('/arboles/ejemplo', c.ejemploArbol);      // árbol de ejemplo resuelto a mano
router.post('/arboles/calcular', c.calcularArbol);   // evalúa sin guardar
router.post('/arboles', c.crearArbol);               // guarda un árbol nuevo
router.get('/arboles/:id', c.obtenerArbol);          // un árbol con toda su estructura
router.put('/arboles/:id', c.actualizarArbol);       // reemplaza un árbol
router.delete('/arboles/:id', c.eliminarArbol);      // elimina un árbol

// ----- Matriz de pagos -----
router.get('/', c.listar);                       // lista de decisiones guardadas
router.post('/calcular', c.calcular);            // calcula sin guardar
router.post('/', c.crear);                       // guarda una nueva decisión
router.get('/:id', c.obtener);                   // decisión con su matriz
router.get('/:id/analisis', c.analizarGuardada); // aplica los criterios a una guardada
router.put('/:id', c.actualizar);                // reemplaza una decisión
router.delete('/:id', c.eliminar);               // elimina una decisión

module.exports = router;
