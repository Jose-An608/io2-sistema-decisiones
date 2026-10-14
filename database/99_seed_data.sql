-- =====================================================
-- 99_seed_data.sql - Datos de prueba de los 3 módulos
-- Ejecutar al final, después de los esquemas 01, 02 y 03
-- =====================================================
USE IO2_Sistema;
GO

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
