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
