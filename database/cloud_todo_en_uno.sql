-- =====================================================
-- Script único para bases en la nube (Azure SQL Database)
-- Crea la base IO2_Sistema ANTES (portal de Azure) y conéctate a ella.
-- Equivale a 01 + 02 + 03 + 99 sin las instrucciones USE.
-- =====================================================

-- >>>>> 01_schema_pert.sql
-- =====================================================
-- 01_schema_pert.sql - Módulo PERT / CPM
-- Ejecutar después de 00_create_database.sql
-- Se puede ejecutar más de una vez (no duplica tablas)
-- =====================================================
-- Un proyecto = una red de actividades (modo CPM: una duración; modo PERT: tres estimaciones)
IF OBJECT_ID(N'dbo.Proyecto', N'U') IS NULL
CREATE TABLE dbo.Proyecto (
    IdProyecto    INT IDENTITY(1,1) CONSTRAINT PK_Proyecto PRIMARY KEY,
    Nombre        NVARCHAR(150) NOT NULL,
    Descripcion   NVARCHAR(500) NULL,
    Modo          VARCHAR(4) NOT NULL CONSTRAINT DF_Proyecto_Modo DEFAULT 'cpm'
                  CONSTRAINT CK_Proyecto_Modo CHECK (Modo IN ('cpm', 'pert')),
    FechaInicio   DATE NULL,                 -- para convertir días en fechas del calendario
    FechaCreacion DATETIME2 NOT NULL CONSTRAINT DF_Proyecto_Fecha DEFAULT SYSDATETIME()
);
GO

-- Actividades del proyecto. Duracion se usa en modo CPM;
-- Optimista / MasProbable / Pesimista en modo PERT.
IF OBJECT_ID(N'dbo.Actividad_Pert', N'U') IS NULL
CREATE TABLE dbo.Actividad_Pert (
    IdActividad   INT IDENTITY(1,1) CONSTRAINT PK_ActividadPert PRIMARY KEY,
    IdProyecto    INT NOT NULL
                  CONSTRAINT FK_ActividadPert_Proyecto REFERENCES dbo.Proyecto(IdProyecto) ON DELETE CASCADE,
    Codigo        NVARCHAR(20)  NOT NULL,    -- A, B, C...
    Nombre        NVARCHAR(100) NULL,
    Duracion      DECIMAL(10,2) NULL CONSTRAINT CK_ActividadPert_Dur CHECK (Duracion >= 0),
    Optimista     DECIMAL(10,2) NULL CONSTRAINT CK_ActividadPert_O CHECK (Optimista >= 0),
    MasProbable   DECIMAL(10,2) NULL CONSTRAINT CK_ActividadPert_M CHECK (MasProbable >= 0),
    Pesimista     DECIMAL(10,2) NULL CONSTRAINT CK_ActividadPert_P CHECK (Pesimista >= 0),
    Orden         INT NOT NULL,
    -- Seguimiento del avance real
    AvanceReal    DECIMAL(5,2) NOT NULL CONSTRAINT DF_ActividadPert_Avance DEFAULT 0
                  CONSTRAINT CK_ActividadPert_Avance CHECK (AvanceReal BETWEEN 0 AND 100),
    InicioReal    DATE NULL,
    FinReal       DATE NULL,
    CONSTRAINT UQ_ActividadPert_Codigo UNIQUE (IdProyecto, Codigo)
);
GO

-- Quién antecede a quién (una fila por cada dependencia)
IF OBJECT_ID(N'dbo.Precedencia', N'U') IS NULL
CREATE TABLE dbo.Precedencia (
    IdActividad     INT NOT NULL
                    CONSTRAINT FK_Precedencia_Actividad REFERENCES dbo.Actividad_Pert(IdActividad) ON DELETE CASCADE,
    IdPredecesora   INT NOT NULL
                    CONSTRAINT FK_Precedencia_Predecesora REFERENCES dbo.Actividad_Pert(IdActividad),
    CONSTRAINT PK_Precedencia PRIMARY KEY (IdActividad, IdPredecesora),
    CONSTRAINT CK_Precedencia_Distinta CHECK (IdActividad <> IdPredecesora)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ActividadPert_Proyecto')
    CREATE INDEX IX_ActividadPert_Proyecto ON dbo.Actividad_Pert (IdProyecto, Orden);
GO

GO

-- >>>>> 02_schema_inventario.sql
-- =====================================================
-- 02_schema_inventario.sql - Módulo Inventarios
-- Ejecutar después de 00_create_database.sql
-- Se puede ejecutar más de una vez (no duplica tablas)
-- =====================================================
IF OBJECT_ID(N'dbo.Proveedor', N'U') IS NULL
CREATE TABLE dbo.Proveedor (
    IdProveedor  INT IDENTITY(1,1) CONSTRAINT PK_Proveedor PRIMARY KEY,
    Nombre       NVARCHAR(120) NOT NULL CONSTRAINT UQ_Proveedor_Nombre UNIQUE,
    Contacto     NVARCHAR(120) NULL,
    Telefono     NVARCHAR(30)  NULL,
    Email        NVARCHAR(120) NULL,
    FechaCreacion DATETIME2 NOT NULL CONSTRAINT DF_Proveedor_Fecha DEFAULT SYSDATETIME()
);
GO

-- Producto con todos los parámetros del modelo EOQ / punto de pedido
IF OBJECT_ID(N'dbo.Producto', N'U') IS NULL
CREATE TABLE dbo.Producto (
    IdProducto        INT IDENTITY(1,1) CONSTRAINT PK_Producto PRIMARY KEY,
    Codigo            NVARCHAR(30)  NOT NULL CONSTRAINT UQ_Producto_Codigo UNIQUE,
    Nombre            NVARCHAR(150) NOT NULL,
    IdProveedor       INT NULL CONSTRAINT FK_Producto_Proveedor REFERENCES dbo.Proveedor(IdProveedor) ON DELETE SET NULL,
    DemandaAnual      DECIMAL(14,2) NOT NULL CONSTRAINT CK_Producto_D CHECK (DemandaAnual > 0),
    CostoPedido       DECIMAL(12,2) NOT NULL CONSTRAINT CK_Producto_S CHECK (CostoPedido >= 0),
    CostoUnitario     DECIMAL(12,2) NOT NULL CONSTRAINT CK_Producto_C CHECK (CostoUnitario >= 0),
    TasaMantenimiento DECIMAL(6,4)  NOT NULL CONSTRAINT DF_Producto_I DEFAULT 0 CONSTRAINT CK_Producto_I CHECK (TasaMantenimiento >= 0),
    CostoAlmacenamiento DECIMAL(12,4) NOT NULL CONSTRAINT DF_Producto_A DEFAULT 0 CONSTRAINT CK_Producto_A CHECK (CostoAlmacenamiento >= 0),
    TiempoEntregaDias DECIMAL(8,2)  NOT NULL CONSTRAINT DF_Producto_L DEFAULT 0 CONSTRAINT CK_Producto_L CHECK (TiempoEntregaDias >= 0),
    DesviacionDemandaDiaria DECIMAL(12,4) NOT NULL CONSTRAINT DF_Producto_Sd DEFAULT 0 CONSTRAINT CK_Producto_Sd CHECK (DesviacionDemandaDiaria >= 0),
    NivelServicio     DECIMAL(6,4)  NOT NULL CONSTRAINT DF_Producto_NS DEFAULT 0.95 CONSTRAINT CK_Producto_NS CHECK (NivelServicio > 0 AND NivelServicio < 1),
    DiasAnio          INT NOT NULL CONSTRAINT DF_Producto_Dias DEFAULT 365 CONSTRAINT CK_Producto_Dias CHECK (DiasAnio BETWEEN 1 AND 366),
    FechaCreacion     DATETIME2 NOT NULL CONSTRAINT DF_Producto_Fecha DEFAULT SYSDATETIME()
);
GO

-- Entradas (+), salidas (-) y ajustes (+/-). El stock actual se calcula sumando.
IF OBJECT_ID(N'dbo.MovimientoStock', N'U') IS NULL
CREATE TABLE dbo.MovimientoStock (
    IdMovimiento INT IDENTITY(1,1) CONSTRAINT PK_Movimiento PRIMARY KEY,
    IdProducto   INT NOT NULL CONSTRAINT FK_Movimiento_Producto REFERENCES dbo.Producto(IdProducto) ON DELETE CASCADE,
    Tipo         VARCHAR(10) NOT NULL CONSTRAINT CK_Movimiento_Tipo CHECK (Tipo IN ('entrada', 'salida', 'ajuste')),
    Cantidad     DECIMAL(14,2) NOT NULL,
    Fecha        DATETIME2 NOT NULL CONSTRAINT DF_Movimiento_Fecha DEFAULT SYSDATETIME(),
    Nota         NVARCHAR(200) NULL,
    CONSTRAINT CK_Movimiento_Cantidad CHECK (Cantidad <> 0 AND (Tipo = 'ajuste' OR Cantidad > 0))
);
GO

-- Pedidos al proveedor; los pendientes cuentan como "stock en camino"
IF OBJECT_ID(N'dbo.OrdenPedido', N'U') IS NULL
CREATE TABLE dbo.OrdenPedido (
    IdOrden     INT IDENTITY(1,1) CONSTRAINT PK_OrdenPedido PRIMARY KEY,
    IdProducto  INT NOT NULL CONSTRAINT FK_Orden_Producto REFERENCES dbo.Producto(IdProducto) ON DELETE CASCADE,
    Cantidad    DECIMAL(14,2) NOT NULL CONSTRAINT CK_Orden_Cantidad CHECK (Cantidad > 0),
    Estado      VARCHAR(10) NOT NULL CONSTRAINT DF_Orden_Estado DEFAULT 'pendiente'
                CONSTRAINT CK_Orden_Estado CHECK (Estado IN ('pendiente', 'recibida')),
    FechaPedido DATETIME2 NOT NULL CONSTRAINT DF_Orden_Fecha DEFAULT SYSDATETIME(),
    FechaRecepcion DATETIME2 NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Movimiento_Producto')
    CREATE INDEX IX_Movimiento_Producto ON dbo.MovimientoStock (IdProducto, Fecha);
GO

GO

-- >>>>> 03_schema_decisiones.sql
-- =====================================================
-- 03_schema_decisiones.sql - Módulo Teoría de decisiones
-- Ejecutar después de 00_create_database.sql
-- Se puede ejecutar más de una vez (no duplica tablas)
-- =====================================================
-- Una decisión = un problema con su matriz de pagos
IF OBJECT_ID(N'dbo.Decision', N'U') IS NULL
CREATE TABLE dbo.Decision (
    IdDecision     INT IDENTITY(1,1) CONSTRAINT PK_Decision PRIMARY KEY,
    Nombre         NVARCHAR(150) NOT NULL,
    Descripcion    NVARCHAR(500) NULL,
    Tipo           VARCHAR(10)   NOT NULL
                   CONSTRAINT CK_Decision_Tipo CHECK (Tipo IN ('beneficio', 'costo')),
    Alfa           DECIMAL(5,4)  NOT NULL CONSTRAINT DF_Decision_Alfa DEFAULT 0.5
                   CONSTRAINT CK_Decision_Alfa CHECK (Alfa BETWEEN 0 AND 1),
    FechaCreacion  DATETIME2     NOT NULL CONSTRAINT DF_Decision_Fecha DEFAULT SYSDATETIME()
);
GO

-- Filas de la matriz
IF OBJECT_ID(N'dbo.Alternativa', N'U') IS NULL
CREATE TABLE dbo.Alternativa (
    IdAlternativa  INT IDENTITY(1,1) CONSTRAINT PK_Alternativa PRIMARY KEY,
    IdDecision     INT NOT NULL
                   CONSTRAINT FK_Alternativa_Decision REFERENCES dbo.Decision(IdDecision) ON DELETE CASCADE,
    Nombre         NVARCHAR(100) NOT NULL,
    Orden          INT NOT NULL,
    CONSTRAINT UQ_Alternativa_Nombre UNIQUE (IdDecision, Nombre)
);
GO

-- Columnas de la matriz (probabilidad opcional: solo para VME)
IF OBJECT_ID(N'dbo.EstadoNaturaleza', N'U') IS NULL
CREATE TABLE dbo.EstadoNaturaleza (
    IdEstado       INT IDENTITY(1,1) CONSTRAINT PK_EstadoNaturaleza PRIMARY KEY,
    IdDecision     INT NOT NULL
                   CONSTRAINT FK_Estado_Decision REFERENCES dbo.Decision(IdDecision) ON DELETE CASCADE,
    Nombre         NVARCHAR(100) NOT NULL,
    Probabilidad   DECIMAL(9,8) NULL
                   CONSTRAINT CK_Estado_Prob CHECK (Probabilidad BETWEEN 0 AND 1),
    Orden          INT NOT NULL,
    CONSTRAINT UQ_Estado_Nombre UNIQUE (IdDecision, Nombre)
);
GO

-- Celdas de la matriz (alternativa x estado)
IF OBJECT_ID(N'dbo.Pago', N'U') IS NULL
CREATE TABLE dbo.Pago (
    IdAlternativa  INT NOT NULL
                   CONSTRAINT FK_Pago_Alternativa REFERENCES dbo.Alternativa(IdAlternativa) ON DELETE CASCADE,
    IdEstado       INT NOT NULL
                   CONSTRAINT FK_Pago_Estado REFERENCES dbo.EstadoNaturaleza(IdEstado),
    Valor          DECIMAL(18,4) NOT NULL,
    CONSTRAINT PK_Pago PRIMARY KEY (IdAlternativa, IdEstado)
);
GO

-- ---------- Árboles de decisión ----------

-- Un árbol = un problema de decisión secuencial
IF OBJECT_ID(N'dbo.ArbolDecision', N'U') IS NULL
CREATE TABLE dbo.ArbolDecision (
    IdArbol        INT IDENTITY(1,1) CONSTRAINT PK_ArbolDecision PRIMARY KEY,
    Nombre         NVARCHAR(150) NOT NULL,
    Descripcion    NVARCHAR(500) NULL,
    Tipo           VARCHAR(10)   NOT NULL
                   CONSTRAINT CK_Arbol_Tipo CHECK (Tipo IN ('beneficio', 'costo')),
    FechaCreacion  DATETIME2     NOT NULL CONSTRAINT DF_Arbol_Fecha DEFAULT SYSDATETIME()
);
GO

-- Nodos del árbol. Los campos EtiquetaRama, ValorRama y Probabilidad describen
-- la rama que llega a este nodo desde su padre (IdPadre NULL = nodo raíz).
IF OBJECT_ID(N'dbo.NodoArbol', N'U') IS NULL
CREATE TABLE dbo.NodoArbol (
    IdNodo         INT IDENTITY(1,1) CONSTRAINT PK_NodoArbol PRIMARY KEY,
    IdArbol        INT NOT NULL
                   CONSTRAINT FK_Nodo_Arbol REFERENCES dbo.ArbolDecision(IdArbol) ON DELETE CASCADE,
    IdPadre        INT NULL
                   CONSTRAINT FK_Nodo_Padre REFERENCES dbo.NodoArbol(IdNodo),
    Tipo           VARCHAR(10)   NOT NULL
                   CONSTRAINT CK_Nodo_Tipo CHECK (Tipo IN ('decision', 'azar', 'terminal')),
    Etiqueta       NVARCHAR(100) NOT NULL,
    Pago           DECIMAL(18,4) NULL,            -- solo nodos terminales
    EtiquetaRama   NVARCHAR(100) NULL,
    ValorRama      DECIMAL(18,4) NOT NULL CONSTRAINT DF_Nodo_ValorRama DEFAULT 0,
    Probabilidad   DECIMAL(9,8)  NULL
                   CONSTRAINT CK_Nodo_Prob CHECK (Probabilidad BETWEEN 0 AND 1),
    Orden          INT NOT NULL
);
GO

GO

-- >>>>> 99_seed_data.sql
-- =====================================================
-- 99_seed_data.sql - Datos de prueba de los 3 módulos
-- Ejecutar al final, después de los esquemas 01, 02 y 03
-- =====================================================
-- ---------- MÓDULO: TEORÍA DE DECISIONES ----------
-- Ejemplo resuelto a mano (coincide con backend/tests/criterios.test.js)
IF NOT EXISTS (SELECT 1 FROM dbo.Decision WHERE Nombre = N'Ejemplo: planta de manufactura')
BEGIN
    DECLARE @d INT, @a1 INT, @a2 INT, @a3 INT, @e1 INT, @e2 INT;

    INSERT INTO dbo.Decision (Nombre, Descripcion, Tipo, Alfa)
    VALUES (N'Ejemplo: planta de manufactura',
            N'Decidir el tamaño de la planta según la demanda del mercado', 'beneficio', 0.8);
    SET @d = SCOPE_IDENTITY();

    INSERT INTO dbo.Alternativa (IdDecision, Nombre, Orden) VALUES (@d, N'Planta grande', 0);
    SET @a1 = SCOPE_IDENTITY();
    INSERT INTO dbo.Alternativa (IdDecision, Nombre, Orden) VALUES (@d, N'Planta pequeña', 1);
    SET @a2 = SCOPE_IDENTITY();
    INSERT INTO dbo.Alternativa (IdDecision, Nombre, Orden) VALUES (@d, N'No hacer nada', 2);
    SET @a3 = SCOPE_IDENTITY();

    INSERT INTO dbo.EstadoNaturaleza (IdDecision, Nombre, Probabilidad, Orden)
    VALUES (@d, N'Mercado favorable', 0.5, 0);
    SET @e1 = SCOPE_IDENTITY();
    INSERT INTO dbo.EstadoNaturaleza (IdDecision, Nombre, Probabilidad, Orden)
    VALUES (@d, N'Mercado desfavorable', 0.5, 1);
    SET @e2 = SCOPE_IDENTITY();

    INSERT INTO dbo.Pago (IdAlternativa, IdEstado, Valor) VALUES
        (@a1, @e1, 200000), (@a1, @e2, -180000),
        (@a2, @e1, 100000), (@a2, @e2, -20000),
        (@a3, @e1, 0),      (@a3, @e2, 0);
END
GO

-- Ejemplo de árbol resuelto a mano (coincide con backend/tests/arbolDecision.test.js)
-- Con estudio de mercado: 49 200  |  Sin estudio: 40 000
IF NOT EXISTS (SELECT 1 FROM dbo.ArbolDecision WHERE Nombre = N'Ejemplo: estudio de mercado (Thompson Lumber)')
BEGIN
    DECLARE @arbol INT, @n1 INT, @n2 INT, @n3 INT, @n4 INT, @n5 INT, @n6 INT, @n7 INT, @n8 INT, @n9 INT, @n10 INT, @n11 INT, @n12 INT, @n13 INT, @n14 INT, @n15 INT, @n16 INT, @n17 INT, @n18 INT, @n19 INT, @n20 INT, @n21 INT, @n22 INT, @n23 INT, @n24 INT, @n25 INT, @n26 INT;

    INSERT INTO dbo.ArbolDecision (Nombre, Descripcion, Tipo)
    VALUES (N'Ejemplo: estudio de mercado (Thompson Lumber)', N'¿Conviene pagar 10 000 por un estudio de mercado antes de elegir el tamaño de la planta?', 'beneficio');
    SET @arbol = SCOPE_IDENTITY();

    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, NULL, 'decision', N'Estudio de mercado', NULL, NULL, 0, NULL, 0);
    SET @n1 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n1, 'azar', N'Resultado del estudio', NULL, N'Realizar estudio', -10000, NULL, 0);
    SET @n2 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n2, 'decision', N'Tamaño de planta', NULL, N'Resultado positivo', 0, 0.45, 0);
    SET @n3 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n3, 'azar', N'Mercado', NULL, N'Planta grande', 0, NULL, 0);
    SET @n4 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n4, 'terminal', N'Resultado', 200000, N'Favorable', 0, 0.78, 0);
    SET @n5 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n4, 'terminal', N'Resultado', -180000, N'Desfavorable', 0, 0.22, 1);
    SET @n6 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n3, 'azar', N'Mercado', NULL, N'Planta pequeña', 0, NULL, 1);
    SET @n7 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n7, 'terminal', N'Resultado', 100000, N'Favorable', 0, 0.78, 0);
    SET @n8 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n7, 'terminal', N'Resultado', -20000, N'Desfavorable', 0, 0.22, 1);
    SET @n9 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n3, 'terminal', N'Sin inversión', 0, N'No hacer nada', 0, NULL, 2);
    SET @n10 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n2, 'decision', N'Tamaño de planta', NULL, N'Resultado negativo', 0, 0.55, 1);
    SET @n11 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n11, 'azar', N'Mercado', NULL, N'Planta grande', 0, NULL, 0);
    SET @n12 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n12, 'terminal', N'Resultado', 200000, N'Favorable', 0, 0.27, 0);
    SET @n13 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n12, 'terminal', N'Resultado', -180000, N'Desfavorable', 0, 0.73, 1);
    SET @n14 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n11, 'azar', N'Mercado', NULL, N'Planta pequeña', 0, NULL, 1);
    SET @n15 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n15, 'terminal', N'Resultado', 100000, N'Favorable', 0, 0.27, 0);
    SET @n16 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n15, 'terminal', N'Resultado', -20000, N'Desfavorable', 0, 0.73, 1);
    SET @n17 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n11, 'terminal', N'Sin inversión', 0, N'No hacer nada', 0, NULL, 2);
    SET @n18 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n1, 'decision', N'Tamaño de planta', NULL, N'No realizar estudio', 0, NULL, 1);
    SET @n19 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n19, 'azar', N'Mercado', NULL, N'Planta grande', 0, NULL, 0);
    SET @n20 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n20, 'terminal', N'Resultado', 200000, N'Favorable', 0, 0.5, 0);
    SET @n21 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n20, 'terminal', N'Resultado', -180000, N'Desfavorable', 0, 0.5, 1);
    SET @n22 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n19, 'azar', N'Mercado', NULL, N'Planta pequeña', 0, NULL, 1);
    SET @n23 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n23, 'terminal', N'Resultado', 100000, N'Favorable', 0, 0.5, 0);
    SET @n24 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n23, 'terminal', N'Resultado', -20000, N'Desfavorable', 0, 0.5, 1);
    SET @n25 = SCOPE_IDENTITY();
    INSERT INTO dbo.NodoArbol (IdArbol, IdPadre, Tipo, Etiqueta, Pago, EtiquetaRama, ValorRama, Probabilidad, Orden)
    VALUES (@arbol, @n19, 'terminal', N'Sin inversión', 0, N'No hacer nada', 0, NULL, 2);
    SET @n26 = SCOPE_IDENTITY();
END
GO

-- ---------- MÓDULO: INVENTARIOS ----------
-- 6 productos (valor anual 50 000, 20 000, 10 000, 8 000, 7 000 y 5 000 -> ABC 3/2/1)
-- con stocks elegidos para ver cada estado de alerta: ok, pedir, riesgo, agotado y en camino
IF NOT EXISTS (SELECT 1 FROM dbo.Proveedor WHERE Nombre = N'Distribuidora Andina SAC')
BEGIN
    INSERT INTO dbo.Proveedor (Nombre, Contacto, Telefono, Email) VALUES
        (N'Distribuidora Andina SAC', N'Rosa Quispe', N'952000111', N'ventas@andina.example.com'),
        (N'Importaciones del Sur', N'Luis Mamani', N'952000222', N'contacto@sur.example.com');

    DECLARE @p1 INT = (SELECT IdProveedor FROM dbo.Proveedor WHERE Nombre = N'Distribuidora Andina SAC');
    DECLARE @p2 INT = (SELECT IdProveedor FROM dbo.Proveedor WHERE Nombre = N'Importaciones del Sur');

    INSERT INTO dbo.Producto (Codigo, Nombre, IdProveedor, DemandaAnual, CostoPedido, CostoUnitario, TasaMantenimiento,
                              CostoAlmacenamiento, TiempoEntregaDias, DesviacionDemandaDiaria, NivelServicio) VALUES
        (N'INV-001', N'Laptop escolar',            @p1, 1000, 40, 50, 0.20, 2.0, 7,  1.5, 0.95),
        (N'INV-002', N'Impresora multifuncional',  @p1,  800, 30, 25, 0.20, 1.5, 5,  1.2, 0.95),
        (N'INV-003', N'Silla ergonómica',          @p2,  500, 35, 20, 0.18, 1.0, 10, 0.9, 0.90),
        (N'INV-004', N'Cuaderno A4 (paquete)',     @p2,  400, 12, 20, 0.15, 0.5, 3,  0.8, 0.95),
        (N'INV-005', N'Mouse inalámbrico',         @p1,  700, 10, 10, 0.20, 0.3, 4,  1.0, 0.95),
        (N'INV-006', N'Cable HDMI 2 m',            @p2,  250,  8, 20, 0.20, 0.4, 3,  0.5, 0.90);

    -- Stock inicial (entradas) y consumo (salidas)
    INSERT INTO dbo.MovimientoStock (IdProducto, Tipo, Cantidad, Nota)
    SELECT IdProducto, 'entrada', v.Inicial, N'Stock inicial'
    FROM dbo.Producto p JOIN (VALUES (N'INV-001', 100), (N'INV-002', 60), (N'INV-003', 40),
                                      (N'INV-004', 30),  (N'INV-005', 50), (N'INV-006', 40)) v(Codigo, Inicial)
         ON v.Codigo = p.Codigo;

    INSERT INTO dbo.MovimientoStock (IdProducto, Tipo, Cantidad, Nota)
    SELECT IdProducto, 'salida', v.Salida, N'Ventas del periodo'
    FROM dbo.Producto p JOIN (VALUES (N'INV-001', 40), (N'INV-002', 47), (N'INV-003', 32),
                                      (N'INV-004', 30), (N'INV-005', 44), (N'INV-006', 20)) v(Codigo, Salida)
         ON v.Codigo = p.Codigo;
    -- Stock resultante: 60 (ok), 13 (pedir), 8 (riesgo), 0 (agotado), 6 (en camino), 20 (ok)

    INSERT INTO dbo.OrdenPedido (IdProducto, Cantidad)
    SELECT IdProducto, 78 FROM dbo.Producto WHERE Codigo = N'INV-005';
END
GO

-- ---------- MÓDULO: PERT / CPM ----------
-- Ejemplo CPM resuelto a mano (coincide con backend/tests/cpm.test.js):
-- duración 10 días, ruta crítica A-D-E, holgura 1 en B y C
IF NOT EXISTS (SELECT 1 FROM dbo.Proyecto WHERE Nombre = N'Ejemplo CPM: red A-E')
BEGIN
    INSERT INTO dbo.Proyecto (Nombre, Descripcion, Modo)
    VALUES (N'Ejemplo CPM: red A-E', N'Cinco actividades con duración fija. Ruta crítica A-D-E (10 días).', 'cpm');
    DECLARE @cpm INT = SCOPE_IDENTITY();

    INSERT INTO dbo.Actividad_Pert (IdProyecto, Codigo, Nombre, Duracion, Orden) VALUES
        (@cpm, N'A', N'Actividad A', 3, 0), (@cpm, N'B', N'Actividad B', 2, 1),
        (@cpm, N'C', N'Actividad C', 4, 2), (@cpm, N'D', N'Actividad D', 5, 3),
        (@cpm, N'E', N'Actividad E', 2, 4);

    INSERT INTO dbo.Precedencia (IdActividad, IdPredecesora)
    SELECT a.IdActividad, p.IdActividad
    FROM (VALUES (N'C', N'A'), (N'D', N'A'), (N'D', N'B'), (N'E', N'C'), (N'E', N'D')) v(Act, Pred)
    JOIN dbo.Actividad_Pert a ON a.IdProyecto = @cpm AND a.Codigo = v.Act
    JOIN dbo.Actividad_Pert p ON p.IdProyecto = @cpm AND p.Codigo = v.Pred;
END
GO

-- Ejemplo PERT: desarrollo de un sistema (tiempos en días)
-- Tiempos esperados: A3 B4 C3 D7 E5 F3 G2 H1 -> duración 18, ruta crítica A-B-D-F-H,
-- varianza del proyecto 3.4444 (desviación 1.856)
IF NOT EXISTS (SELECT 1 FROM dbo.Proyecto WHERE Nombre = N'Ejemplo PERT: desarrollo de un sistema')
BEGIN
    INSERT INTO dbo.Proyecto (Nombre, Descripcion, Modo, FechaInicio)
    VALUES (N'Ejemplo PERT: desarrollo de un sistema', N'Ocho actividades con tiempos optimista, más probable y pesimista.', 'pert', '2026-11-02');
    DECLARE @pert INT = SCOPE_IDENTITY();

    INSERT INTO dbo.Actividad_Pert (IdProyecto, Codigo, Nombre, Optimista, MasProbable, Pesimista, Orden) VALUES
        (@pert, N'A', N'Análisis de requisitos',   2, 3, 4,  0),
        (@pert, N'B', N'Diseño de base de datos',  2, 4, 6,  1),
        (@pert, N'C', N'Diseño de interfaz',       1, 3, 5,  2),
        (@pert, N'D', N'Programación del backend', 4, 6, 14, 3),
        (@pert, N'E', N'Programación del frontend',3, 5, 7,  4),
        (@pert, N'F', N'Integración y pruebas',    2, 3, 4,  5),
        (@pert, N'G', N'Documentación',            1, 2, 3,  6),
        (@pert, N'H', N'Entrega al cliente',       1, 1, 1,  7);

    INSERT INTO dbo.Precedencia (IdActividad, IdPredecesora)
    SELECT a.IdActividad, p.IdActividad
    FROM (VALUES (N'B', N'A'), (N'C', N'A'), (N'D', N'B'), (N'E', N'C'), (N'F', N'D'), (N'F', N'E'),
                 (N'G', N'B'), (N'G', N'C'), (N'H', N'F'), (N'H', N'G')) v(Act, Pred)
    JOIN dbo.Actividad_Pert a ON a.IdProyecto = @pert AND a.Codigo = v.Act
    JOIN dbo.Actividad_Pert p ON p.IdProyecto = @pert AND p.Codigo = v.Pred;
END
GO

GO

