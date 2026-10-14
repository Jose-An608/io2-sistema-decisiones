# Evidencias de validación

Contraste de los resultados del sistema con **cálculos manuales** y con **pruebas automáticas** (`npm test`, 116 pruebas). La columna *POM-QM* está para completarla con capturas propias (ver sección 5).

## 1. Teoría de decisiones

### 1.1 Matriz de pagos (maximizar beneficios, α = 0.8, probabilidades 0.5 / 0.5)

| Alternativa | Favorable | Desfavorable |
|---|---:|---:|
| Planta grande | 200,000 | −180,000 |
| Planta pequeña | 100,000 | −20,000 |
| No hacer nada | 0 | 0 |

| Criterio | Cálculo manual | Resultado del sistema | Decisión |
|---|---|---|---|
| Maximax | máx{200000, 100000, 0} | 200,000 | Planta grande |
| Maximin | máx{−180000, −20000, 0} | 0 | No hacer nada |
| Hurwicz (α=0.8) | grande: 0.8·200000 + 0.2·(−180000) = 124,000; pequeña: 0.8·100000 + 0.2·(−20000) = 76,000 | 124,000 | Planta grande |
| Laplace / VME | grande 0.5·200000 + 0.5·(−180000) = 10,000; pequeña 0.5·100000 + 0.5·(−20000) = 40,000 | 40,000 | Planta pequeña |
| Savage | arrepentimiento máximo: grande 180,000 · pequeña 100,000 · nada 200,000 → mín = 100,000 | 100,000 | Planta pequeña |

### 1.2 Árbol de decisión (Thompson Lumber)

| Dato | Manual | Sistema |
|---|---:|---:|
| P(resultado positivo) | 0.45 | 0.45 |
| VE nodo "positivo" (planta grande) | 0.78·200000 + 0.22·(−180000) = 116,400 | 116,400 |
| VE nodo "negativo" (planta pequeña) | 0.27·100000 + 0.73·(−20000) = 12,400 | 12,400 |
| VE "Realizar estudio" | 0.45·116400 + 0.55·12400 − 10000 = 59,200 − 10,000 = **49,200** | 49,200 |
| VE "No realizar estudio" | máx{10,000; 40,000; 0} = **40,000** | 40,000 |
| Decisión | Realizar estudio (49,200 > 40,000) | Realizar estudio |

Captura: `docs/img/dec_arbol.png`.

## 2. Inventarios

### 2.1 EOQ — D=1000, S=10, c=20, i=10 %, a=0.5

| Magnitud | Manual | Sistema |
|---|---:|---:|
| H = i·c + a | 0.10·20 + 0.5 = 2.5 | 2.5 |
| Q\* = √(2·1000·10/2.5) | 89.4427 | 89.4427 |
| N = D/Q\* | 11.1803 | 11.1803 |
| T = 365/N | 32.6466 días | 32.6466 |
| Costo de pedir = (D/Q)·S | 111.803 | 111.803 |
| Costo de mantener = (Q/2)·H | 111.803 | 111.803 |
| Costo total = D·c + pedir + mantener | 20,223.607 | 20,223.607 |

Punto de reorden (L=5, σd=1.5, nivel de servicio 95 %):

| Magnitud | Manual | Sistema |
|---|---:|---:|
| d = D/365 | 2.7397 | 2.7397 |
| d·L | 13.6986 | 13.6986 |
| σL = σd·√L | 3.3541 | 3.3541 |
| z (95 %) | 1.6449 | 1.6449 |
| SS = z·σL | 5.517 | 5.517 |
| ROP = d·L + SS | 19.2156 | 19.2156 |

### 2.2 Revisión continua vs. periódica — D=3650, S=50, c=10, i=20 %, L=5, T=30, σd=2, 95 %

| Magnitud | Manual | Sistema |
|---|---:|---:|
| H | 2 | 2 |
| Q\* (continua) | √(2·3650·50/2) = 427.2002 | 427.2002 |
| SS (continua) | 1.6449·2·√5 = 7.356 | 7.356 |
| R | 10·5 + 7.356 = 57.356 | 57.356 |
| Costo total continua | 37,369.112 | 37,369.112 |
| M (periódica) | 10·35 + 1.6449·2·√35 = 369.4622 | 369.4622 |
| SS (periódica) | 19.4622 | 19.4622 |
| Costo total periódica | 37,447.257 | 37,447.257 |
| Política más barata | Continua, por 78.145 | Continua |

### 2.3 ABC — valores anuales 50k, 20k, 10k, 8k, 7k, 5k (total 100k)

Acumulado: 50 %, 70 %, 80 %, 88 %, 95 %, 100 %. Con cortes 80/95 → **A = 3 productos, B = 2, C = 1**. Con cortes 70/90 → A, A, B, B, C, C. El sistema coincide en ambos casos.

### 2.4 Diente de sierra — Q=100, d=10/día, ROP=20, L=2, stock inicial 100

Día 8: stock 20 (se emite pedido) · día 9: 10 · día 10: llega el pedido y el stock vuelve a 100. Coincide con la simulación.

### 2.5 Alertas (datos de ejemplo, `99_seed_data.sql`)

| Producto | Stock | Estado esperado | Estado del sistema |
|---|---:|---|---|
| INV-001 | 60 (ROP 25.7) | OK | OK |
| INV-002 | 13 (ROP 15.4) | Pedir | Pedir |
| INV-003 | 8 (d·L 13.7) | Riesgo | Riesgo |
| INV-004 | 0 | Agotado | Agotado |
| INV-005 | 6 + 78 en pedido | En camino | En camino |
| INV-006 | 20 | OK | OK |

## 3. PERT/CPM

### 3.1 CPM determinístico — A(3), B(2), C(4←A), D(5←A,B), E(2←C,D)

| Magnitud | Manual | Sistema |
|---|---|---|
| Duración del proyecto | A→D→E = 3+5+2 = 10 | 10 |
| Ruta crítica | A-D-E | A-D-E |
| Holgura B / C | 1 / 1 | 1 / 1 |

### 3.2 PERT — A(1,4,7) → B(2,3,10)

| Magnitud | Manual | Sistema |
|---|---:|---:|
| te A = (1+16+7)/6 = 4; te B = (2+12+10)/6 = 4 → Te | 8 | 8 |
| σ² = ((7−1)/6)² + ((10−2)/6)² = 1 + 1.7778 | 2.7778 | 2.7778 |
| σ | 1.6667 | 1.6667 |
| P(T ≤ 10): z = (10−8)/1.6667 = 1.2 → Φ(1.2) | 0.8849 | 0.8849 |

### 3.3 Proyecto de ejemplo (8 actividades, `99_seed_data.sql`)

| Magnitud | Manual | Sistema |
|---|---:|---:|
| Duración esperada | 18 días | 18 |
| Ruta crítica | A-B-D-F-H | A-B-D-F-H |
| σ² (suma en ruta crítica) | 31/9 = 3.4444 | 3.4444 |
| σ | 1.8559 | 1.8559 |
| P(T ≤ 20) | Φ(1.0777) ≈ 85.94 % | 85.94 % |
| Plazo para 95 % | 18 + 1.6449·1.8559 = 21.05 | 21.05 |

### 3.4 Seguimiento — día 7, avance real A=B=C=100 %, E=20 %

Avance ponderado planificado = real = **39.3 %** (estado "en plazo"). Cubierto por `seguimiento.test.js`.

## 4. Trazabilidad con las pruebas automáticas

| Archivo de prueba | Qué valida |
|---|---|
| `criterios.test.js` | Maximax, Maximin, Hurwicz, Laplace, Savage, VME, VEIP |
| `arbolDecision.test.js` | Roll-back, Thompson Lumber (49,200 vs 40,000), validaciones |
| `decisiones.controller.test.js` | Rutas y códigos 400/404/500 del módulo |
| `inventario.test.js` (22) | EOQ, SS, ROP, políticas, ABC, diente de sierra, alertas |
| `inventario.controller.test.js` | CRUD, movimientos, recepción de órdenes |
| `cpm.test.js` | Ruta crítica, holguras, PERT, probabilidad, ciclos |
| `pert.controller.test.js` | CRUD, análisis y seguimiento |
| `seguimiento.test.js` | Avance planificado vs real y estados |

Para reproducir: `npm test` (debe terminar con `pass 116`). Pegar aquí la captura de la terminal: `docs/img/npm_test.png`.

## 5. Contraste con POM-QM / herramienta externa (completar)

Introducir en **POM-QM for Windows** los mismos datos y anotar los resultados en la columna vacía; guardar capturas en `docs/img/`.

| Caso | Módulo POM-QM | Datos de entrada | Resultado esperado | Resultado POM-QM | Captura |
|---|---|---|---|---|---|
| EOQ | Inventory → EOQ | D=1000, S=10, H=2.5 | Q\*=89.44; CT de pedir+mantener=223.61 | | |
| Decisiones | Decision Analysis | Matriz 1.1, α=0.8 | Maximax 200,000; Maximin 0; Hurwicz 124,000; Laplace 40,000 | | |
| PERT | Project Management (PERT/CPM) | Actividades 3.2 | Te=8; σ²=2.78 | | |
| CPM | Project Management (PERT/CPM) | Actividades 3.1 | Duración 10; ruta A-D-E | | |
| Revisión continua | Inventory | Datos 2.2 | Q=427.2; R=57.36 | | |

Nota: POM-QM puede definir el costo anual de mantener como un valor único (H); en el sistema H = i·c + a, por eso se ingresa H = 2.5 directamente.
