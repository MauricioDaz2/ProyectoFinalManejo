-- RFC-000079: Plantillas editables de asientos, carga local de foto de bus,
-- hora de salida y tarifa base en frecuencias, categoría única por bus y tipos de asiento.
-- Requiere haber aplicado antes 014_simplificar_frecuencias_sin_resoluciones.sql (RFC-000078).
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    -- 1. Columnas de plantilla y modelo de estructura en BUSES
    IF COL_LENGTH('dbo.BUSES', 'MOD_PLA_BUS') IS NULL
        ALTER TABLE dbo.BUSES ADD MOD_PLA_BUS varchar(30) NULL;

    IF COL_LENGTH('dbo.BUSES', 'PLANTILLA_JSON') IS NULL
        ALTER TABLE dbo.BUSES ADD PLANTILLA_JSON nvarchar(max) NULL;

    -- 2. Posición espacial (fila, columna, ubicación ventana/pasillo/centro) en ASIENTOS_BUS
    IF COL_LENGTH('dbo.ASIENTOS_BUS', 'FIL_ASI') IS NULL
        ALTER TABLE dbo.ASIENTOS_BUS ADD FIL_ASI int NULL;

    IF COL_LENGTH('dbo.ASIENTOS_BUS', 'COL_ASI') IS NULL
        ALTER TABLE dbo.ASIENTOS_BUS ADD COL_ASI int NULL;

    IF COL_LENGTH('dbo.ASIENTOS_BUS', 'UBI_ASI') IS NULL
        ALTER TABLE dbo.ASIENTOS_BUS ADD UBI_ASI varchar(15) NULL;

    -- 3. Tipos de asientos estándar (incluyendo DISCAPACIDAD y VIP)
    IF NOT EXISTS (SELECT 1 FROM dbo.TIPOS_ASIENTOS WHERE ID_TIP = 'TIP01')
        INSERT INTO dbo.TIPOS_ASIENTOS (ID_TIP, NOM_TIP, PRE_TIP) VALUES ('TIP01', 'NORMAL', 0);

    IF NOT EXISTS (SELECT 1 FROM dbo.TIPOS_ASIENTOS WHERE ID_TIP = 'TIP02')
        INSERT INTO dbo.TIPOS_ASIENTOS (ID_TIP, NOM_TIP, PRE_TIP) VALUES ('TIP02', 'VIP', 3);

    IF NOT EXISTS (SELECT 1 FROM dbo.TIPOS_ASIENTOS WHERE ID_TIP = 'TIP03')
        INSERT INTO dbo.TIPOS_ASIENTOS (ID_TIP, NOM_TIP, PRE_TIP) VALUES ('TIP03', 'DISCAPACIDAD', 0);

    -- 4. Hora de salida y Tarifa base en FRECUENCIAS
    IF COL_LENGTH('dbo.FRECUENCIAS', 'HORA_SAL_FRE') IS NULL
        ALTER TABLE dbo.FRECUENCIAS ADD HORA_SAL_FRE varchar(5) NULL;

    IF COL_LENGTH('dbo.FRECUENCIAS', 'TAR_BAS_FRE') IS NULL
        ALTER TABLE dbo.FRECUENCIAS ADD TAR_BAS_FRE decimal(10, 2) NULL;

    -- Inicializar valores por defecto en registros históricos si existen
    EXEC(N'
        UPDATE dbo.FRECUENCIAS SET HORA_SAL_FRE = ''08:00'' WHERE HORA_SAL_FRE IS NULL;
        UPDATE dbo.FRECUENCIAS SET TAR_BAS_FRE = 5.00 WHERE TAR_BAS_FRE IS NULL;
    ');

    -- 5. Restricción de categoría única por bus en BUS_CATEGORIAS (si la tabla existe)
    IF OBJECT_ID('dbo.BUS_CATEGORIAS', 'U') IS NOT NULL
    BEGIN
        -- Conservar solo 1 categoría por bus si algún bus tenía varias asignadas
        ;WITH Duplicadas AS (
            SELECT ID_BUS, ID_CAT,
                   ROW_NUMBER() OVER (PARTITION BY ID_BUS ORDER BY ID_CAT) AS rn
            FROM dbo.BUS_CATEGORIAS
        )
        DELETE FROM Duplicadas WHERE rn > 1;

        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.BUS_CATEGORIAS') AND name = 'UQ_BUS_CATEGORIA_UNICA')
            CREATE UNIQUE INDEX UQ_BUS_CATEGORIA_UNICA ON dbo.BUS_CATEGORIAS(ID_BUS);
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
