-- =====================================================
-- 01_schema_pert.sql - Módulo PERT / CPM
-- Ejecutar después de 00_create_database.sql
-- Se puede ejecutar más de una vez (no duplica tablas)
-- =====================================================
USE IO2_Sistema;
GO

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
