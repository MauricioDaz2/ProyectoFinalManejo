-- RFC-000088: Configuración de paradas intermedias (Directo vs. Con paradas)
-- y hora estimada de llegada en Frecuencias.
-- Requiere haber aplicado antes 015_buses_plantillas_frecuencias_hora_tarifa.sql.
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    -- 1. Hora estimada de llegada y modalidad Directo / Con paradas en FRECUENCIAS
    IF COL_LENGTH('dbo.FRECUENCIAS', 'HORA_LLE_FRE') IS NULL
        ALTER TABLE dbo.FRECUENCIAS ADD HORA_LLE_FRE varchar(5) NULL;

    IF COL_LENGTH('dbo.FRECUENCIAS', 'ES_DIRECTA') IS NULL
        ALTER TABLE dbo.FRECUENCIAS ADD ES_DIRECTA bit NOT NULL CONSTRAINT DF_FRECUENCIAS_ES_DIRECTA DEFAULT (1);

    -- 2. Asegurar existencia de tabla FRECUENCIA_PARADAS para persistir paradas ordenadas
    IF OBJECT_ID('dbo.FRECUENCIA_PARADAS', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.FRECUENCIA_PARADAS (
            ID_FRE varchar(5) NOT NULL REFERENCES dbo.FRECUENCIAS(ID_FRE),
            ORDEN int NOT NULL CHECK (ORDEN >= 0),
            NOMBRE varchar(20) NOT NULL,
            COMERCIAL bit NOT NULL DEFAULT (1),
            PRIMARY KEY (ID_FRE, ORDEN)
        );
    END;

    -- 3. Inicializar hora estimada de llegada y modalidad según paradas existentes
    EXEC(N'
        UPDATE dbo.FRECUENCIAS
        SET HORA_LLE_FRE = ''10:00''
        WHERE HORA_LLE_FRE IS NULL;

        UPDATE F
        SET F.ES_DIRECTA = CASE
            WHEN EXISTS (
                SELECT 1
                FROM dbo.FRECUENCIA_PARADAS FP
                WHERE FP.ID_FRE = F.ID_FRE
                  AND FP.NOMBRE NOT IN (F.CIU_ORI_FRE, F.CIU_DES_FRE)
            ) THEN 0
            ELSE 1
        END
        FROM dbo.FRECUENCIAS F;
    ');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
