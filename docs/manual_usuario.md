# Manual de usuario

Sistema de apoyo a la toma de decisiones · Investigación Operativa II

## 1. Primeros pasos

1. **Sistema en línea**: abrir **https://io2-sistema-decisiones.onrender.com**. Al usar el plan gratuito, el servicio se suspende tras 15 minutos sin uso y la primera visita puede tardar cerca de un minuto en cargar; esperar sin recargar la página.
2. **Instalación local** (opcional): tener el servidor en marcha (`npm start`) y la base de datos creada (ver `README.md`), y abrir **http://localhost:3000**.
3. El portal muestra tres tarjetas: **PERT/CPM**, **Inventarios** y **Teoría de decisiones**.
4. Cada módulo tiene su propia página; el enlace superior permite volver al portal.

**Convenciones generales**

- Los resultados se **recalculan solos** unos instantes después de cambiar un dato; no hay botón "Calcular".
- Se puede trabajar **sin guardar**: guardar solo es necesario para conservar el caso en la base de datos.
- **Imprimir informe** abre el diálogo de impresión con una versión limpia (sirve para "Guardar como PDF").
- Los mensajes en rojo indican datos inválidos (por ejemplo, probabilidades que no suman 1); corregirlos y el cálculo continúa.

---

## 2. Módulo Teoría de decisiones

Dos pestañas: **Matriz de pagos** y **Árbol de decisión**.

### 2.1 Matriz de pagos

![Matriz de pagos](img/dec_matriz.png)

1. **Problema**: escribir el nombre, elegir si se **maximizan beneficios** o se **minimizan costos**, y definir el coeficiente de optimismo **α** (0 a 1) para Hurwicz.
2. **Matriz de pagos**:
   - Cada **columna** es un estado de la naturaleza; indicar su **probabilidad** (deben sumar 1 para VME y VEIP).
   - Cada **fila** es una alternativa; pulsar **+ Alternativa** para añadir más y completar los pagos.
   - Se pueden agregar o quitar estados de la naturaleza con los controles de la cabecera.
3. **Resultados**: para cada criterio (Maximax, Maximin, Hurwicz, Laplace, VME) se marca la alternativa recomendada. También se muestran la **matriz de arrepentimiento (Savage)** y la **información perfecta** (VEcIP, VEIP).
4. **Guardar** para almacenar; **Nueva** para empezar de cero; **Eliminar** borra el caso cargado.

### 2.2 Árbol de decisión

![Árbol de decisión](img/dec_arbol.png)

Dos formas de usarlo:

- **Generar desde la matriz**: construye automáticamente un árbol de un nivel (decisión → azar → pagos) a partir de la matriz actual.
- **Construir a mano** en el panel **Estructura**: añadir nodos de **decisión** (cuadrado), de **azar** (círculo, con probabilidades de sus ramas que suman 1) y **finales** (pago). Admite **2, 3 o más ramas** por nodo, y costos en las ramas de decisión (por ejemplo, el costo del estudio).
- **Cargar ejemplo** carga el caso clásico *Thompson Lumber*.

**Evaluación**: muestra el valor esperado del árbol, la lista de **decisiones óptimas** y el diagrama: línea gruesa = rama óptima, línea punteada con doble corte `//` = alternativa descartada; el número bajo cada nodo es su valor esperado (roll-back).

---

## 3. Módulo Inventarios

Pestañas: **Alertas · Productos · Análisis EOQ · Clasificación ABC · Movimientos y pedidos · Proveedores**.

### 3.1 Proveedores
Registrar el nombre y el plazo de entrega habitual. Un proveedor con productos asociados no puede eliminarse.

### 3.2 Productos
1. **Nuevo producto**: código, nombre, proveedor, demanda anual **D**, costo de pedir **S**, costo unitario **c**, tasa de mantenimiento **i** (%) y costo fijo de almacenar **a**, plazo de entrega **L** (días), desviación estándar diaria **σd**, nivel de servicio (%), período de revisión **T** y días del año.
2. **Guardar producto**. En la tabla **Productos registrados** se puede editar o eliminar.
3. **Analizar estos datos** envía el producto a la pestaña de análisis.

### 3.3 Análisis EOQ

![Análisis EOQ](img/inv_analisis.png)

Muestra:
- **Resultados principales**: Q\*, número de pedidos N, tiempo entre pedidos T, costo total, stock de seguridad (SS) y punto de reorden (ROP).
- **Desarrollo de las fórmulas** paso a paso con los valores sustituidos (útil para el informe).
- **Costos anuales**: pedido, mantenimiento y compra.
- **Revisión continua (Q, R) frente a revisión periódica (T, M)**: costos totales y cuál política conviene.
- **Gráficos**: costo total según el tamaño de pedido (mínimo en Q\*) y nivel de inventario en diente de sierra.

También puede introducir datos sin guardar el producto y ver el resultado al instante.

### 3.4 Clasificación ABC

![Clasificación ABC](img/inv_abc.png)

Ordena los productos por **valor anual de consumo** (D × c) y los clasifica en A, B o C según los cortes acumulados (por defecto 80 % y 95 %, modificables). Incluye el gráfico de Pareto.

### 3.5 Movimientos y pedidos
- **Registrar movimiento**: entrada o salida de stock de un producto, con cantidad y nota. El stock actual es la suma de los movimientos.
- **Generar pedido al proveedor**: elegir producto y cantidad (se sugiere Q\*). El pedido queda **pendiente / en camino**.
- En **Pedidos**, pulsar **Recibir** cuando llegue la mercadería: se crea automáticamente el movimiento de entrada y el stock se actualiza.

### 3.6 Alertas

![Alertas](img/inv_alertas.png)

El estado de cada producto se calcula con su stock y su punto de reorden:

| Estado | Significado |
|---|---|
| **Agotado** | Stock 0 |
| **Riesgo** | El stock no cubre la demanda durante el plazo de entrega |
| **Pedir** | Stock ≤ ROP y no hay pedido en camino |
| **En camino** | Hay un pedido pendiente |
| **OK** | Stock suficiente |

---

## 4. Módulo PERT/CPM

Pestañas: **Planificación** y **Gantt y seguimiento**.

### 4.1 Planificación

![Resultados PERT](img/pert_resultados.png)

1. **Proyecto**: nombre, unidad de tiempo y, opcionalmente, **plazo** objetivo y **probabilidad** deseada.
2. **Actividades** (**+ Agregar actividad**): código, nombre, **predecesoras** (códigos separados por coma) y duración:
   - modo **CPM**: una duración determinística;
   - modo **PERT**: tiempos **optimista (o)**, **más probable (m)** y **pesimista (p)**.
3. Resultados automáticos:
   - **Probabilidad de cumplir el plazo (PERT)**: media, varianza, desviación y probabilidad de terminar en el plazo; también el plazo necesario para la probabilidad deseada.
   - **Tiempos, holguras y ruta crítica**: ES, EF, LS, LF, holgura total y libre; las actividades críticas se resaltan.
   - **Diagrama de red** (nodos de actividad):

     ![Red](img/pert_red.png)

4. Si hay un ciclo en las predecesoras o una predecesora inexistente, se muestra un error indicando la actividad.

### 4.2 Gantt y seguimiento

![Gantt](img/pert_gantt.png)

- **Diagrama de Gantt** con las actividades críticas resaltadas y una línea del **día actual**.
- **Registro del avance real**: indicar el % completado de cada actividad y **Guardar avance**.
- **Avance del proyecto**: compara el avance **real** con el **planificado** al día elegido (promedio ponderado por duración) y marca cada actividad como *completada, en plazo, adelantada, atrasada, sin iniciar o en curso* (tolerancia de 5 puntos).

---

## 5. Problemas frecuentes

| Problema | Solución |
|---|---|
| La página carga pero no hay datos | Verificar que el servidor está iniciado y abrir `/api/health` |
| `ok:false` con error de conexión | Revisar `.env` (servidor, base, autenticación) y que SQL Server esté en ejecución |
| Los gráficos no aparecen | Los gráficos usan Chart.js desde internet; comprobar la conexión (las tablas y cálculos funcionan igual) |
| "Las probabilidades deben sumar 1" | Ajustar las probabilidades de los estados o de las ramas del nodo de azar |
| No se puede eliminar un proveedor/producto | Tiene movimientos u órdenes asociados |
