-- =====================================================
-- 02_schema_inventario.sql - Módulo Inventarios
-- Ejecutar después de 00_create_database.sql
-- Se puede ejecutar más de una vez (no duplica tablas)
-- =====================================================
USE IO2_Sistema;
GO

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
