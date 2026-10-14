-- =====================================================
-- 00_create_database.sql
-- Crea la base de datos del sistema (ejecutar primero)
-- =====================================================
IF DB_ID(N'IO2_Sistema') IS NULL
BEGIN
    CREATE DATABASE IO2_Sistema;
    PRINT 'Base de datos IO2_Sistema creada.';
END
ELSE
    PRINT 'La base de datos IO2_Sistema ya existe.';
GO
