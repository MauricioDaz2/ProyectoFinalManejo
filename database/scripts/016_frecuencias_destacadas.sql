-- RFC-000085: Frecuencias destacadas / publicidad patrocinada con cupo por cooperativa.
-- Migración aditiva, transaccional e idempotente. Requiere 014 (FRECUENCIAS.ID_COP_PER) y 015 aplicadas.
-- No modifica ni elimina datos históricos: las columnas nuevas inician en 0.
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH('dbo.FRECUENCIAS', 'ID_COP_PER') IS NULL
        THROW 51600, 'Aplica primero 014_simplificar_frecuencias_sin_resoluciones.sql (FRECUENCIAS.ID_COP_PER).', 1;

    -- 1. Límite de frecuencias destacadas contratadas por cooperativa (lo configura el Administrador R001).
    IF COL_LENGTH('dbo.COOPERATIVAS', 'LIM_DES_COP') IS NULL
        ALTER TABLE dbo.COOPERATIVAS ADD LIM_DES_COP int NOT NULL
            CONSTRAINT DF_COOPERATIVAS_LIM_DES_COP DEFAULT 0 WITH VALUES;

    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_COOPERATIVAS_LIM_DES_COP')
        EXEC(N'ALTER TABLE dbo.COOPERATIVAS WITH CHECK ADD CONSTRAINT CK_COOPERATIVAS_LIM_DES_COP CHECK (LIM_DES_COP BETWEEN 0 AND 50);');

    -- 2. Marca de frecuencia destacada (la gestiona la Cooperativa R002).
    IF COL_LENGTH('dbo.FRECUENCIAS', 'ES_DESTACADA') IS NULL
        ALTER TABLE dbo.FRECUENCIAS ADD ES_DESTACADA bit NOT NULL
            CONSTRAINT DF_FRECUENCIAS_ES_DESTACADA DEFAULT 0 WITH VALUES;

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.FRECUENCIAS') AND name = 'IX_FRECUENCIAS_DESTACADAS')
        EXEC(N'CREATE INDEX IX_FRECUENCIAS_DESTACADAS ON dbo.FRECUENCIAS(ID_COP_PER, ES_DESTACADA) WHERE ES_DESTACADA = 1;');

    -- 3. Validación de cupo en BD: una cooperativa no puede marcar más destacadas que su límite.
    --    Solo se evalúa cuando una frecuencia pasa a destacada, para no bloquear ediciones de otros campos.
    EXEC(N'
CREATE OR ALTER TRIGGER dbo.TR_RFC085_CupoDestacadas
ON dbo.FRECUENCIAS
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(ES_DESTACADA) AND NOT UPDATE(ID_COP_PER) RETURN;

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT DISTINCT i.ID_COP_PER
            FROM inserted i
            LEFT JOIN deleted d ON d.ID_FRE = i.ID_FRE
            WHERE i.ES_DESTACADA = 1
              AND (d.ID_FRE IS NULL OR d.ES_DESTACADA = 0 OR ISNULL(d.ID_COP_PER, '''') <> ISNULL(i.ID_COP_PER, ''''))
        ) AS afectadas
        JOIN dbo.COOPERATIVAS c ON c.ID_COP = afectadas.ID_COP_PER
        WHERE (SELECT COUNT(*) FROM dbo.FRECUENCIAS f
               WHERE f.ID_COP_PER = c.ID_COP AND f.ES_DESTACADA = 1) > c.LIM_DES_COP
    )
        THROW 51685, ''CUPO_DESTACADAS_EXCEDIDO: la cooperativa superó su límite de frecuencias destacadas.'', 1;
END;');

    COMMIT TRANSACTION;
    PRINT 'RFC-000085: migración 016 aplicada correctamente.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
