// Rutas del módulo Inventarios  ->  /api/inventario
const express = require('express');
const c = require('../controllers/inventario.controller');

const router = express.Router();

// ----- Proveedores -----
router.get('/proveedores', c.listarProveedores);
router.post('/proveedores', c.crearProveedor);
router.put('/proveedores/:id', c.actualizarProveedor);
router.delete('/proveedores/:id', c.eliminarProveedor);

// ----- Productos -----
router.get('/productos', c.listarProductos);               // con stock actual y estado de alerta
router.post('/productos', c.crearProducto);
router.get('/productos/:id', c.obtenerProducto);
router.get('/productos/:id/analisis', c.analizarGuardado); // EOQ, ROP, revisión, curvas, diente de sierra
router.put('/productos/:id', c.actualizarProducto);
router.delete('/productos/:id', c.eliminarProducto);

// ----- Cálculo, ABC y alertas -----
router.post('/calcular', c.calcular);                      // análisis sin guardar
router.get('/abc', c.abc);                                 // ?corteA=80&corteB=95
router.get('/alertas', c.alertas);

// ----- Movimientos de stock -----
router.get('/movimientos', c.listarMovimientos);           // ?idProducto=
router.post('/movimientos', c.crearMovimiento);
router.delete('/movimientos/:id', c.eliminarMovimiento);

// ----- Órdenes de pedido -----
router.get('/ordenes', c.listarOrdenes);
router.post('/ordenes', c.crearOrden);
router.post('/ordenes/:id/recibir', c.recibirOrden);
router.delete('/ordenes/:id', c.eliminarOrden);

module.exports = router;
