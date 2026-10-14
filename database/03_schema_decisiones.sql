-- =====================================================
-- 03_schema_decisiones.sql - Módulo Teoría de decisiones
-- Ejecutar después de 00_create_database.sql
-- Se puede ejecutar más de una vez (no duplica tablas)
-- =====================================================
USE IO2_Sistema;
GO

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
